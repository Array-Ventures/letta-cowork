/**
 * Cloud Runner — REST-based runner for cloud agents.
 *
 * Uses @letta-ai/letta-client to create conversations and stream responses via SSE.
 * Maps LettaStreamingResponse chunks to the same StreamMessage types the UI expects,
 * so the renderer doesn't know whether it's talking to a local SDK subprocess or
 * a cloud REST stream.
 */

import { getLettaClient } from "./letta-client.js";
import type { RunnerOptions, RunnerHandle } from "./runner.js";
import type { StreamMessage, ApprovalRequestMessage } from "../types.js";
import type { LettaStreamingResponse } from "@letta-ai/letta-client/resources/agents/messages";
import type { ToolReturnMessage } from "@letta-ai/letta-client/resources/tools";
import { createLogger } from "./logger.js";

const log = createLogger("cloud-runner");

/**
 * Map a single SSE chunk from the Letta REST stream to a StreamMessage the UI can render.
 * Returns null for chunks that should be skipped (pings, usage stats).
 */
function mapStreamChunk(chunk: LettaStreamingResponse): StreamMessage | null {
  // Use message_type to discriminate — all LettaStreamingResponse variants have it
  const mt = (chunk as { message_type?: string }).message_type;

  if (mt === "reasoning_message") {
    const c = chunk as Extract<LettaStreamingResponse, { message_type?: "reasoning_message" }>;
    return {
      type: "reasoning" as const,
      content: c.reasoning ?? "",
      uuid: `${c.id}-reasoning`,
    };
  }

  if (mt === "assistant_message") {
    const c = chunk as Extract<LettaStreamingResponse, { message_type?: "assistant_message" }>;
    // content can be string or array of content parts
    let text: string;
    if (typeof c.content === "string") {
      text = c.content;
    } else if (Array.isArray(c.content)) {
      text = c.content
        .map((part) => (typeof part === "string" ? part : "text" in part ? (part as { text: string }).text : ""))
        .join("");
    } else {
      text = String(c.content ?? "");
    }
    return {
      type: "assistant" as const,
      content: text,
      uuid: `${c.id}-assistant`,
    };
  }

  if (mt === "tool_call_message") {
    const c = chunk as Extract<LettaStreamingResponse, { message_type?: "tool_call_message" }>;
    // Prefer tool_calls array (ToolCall[]), fall back to deprecated tool_call (ToolCall | ToolCallDelta)
    const tc = Array.isArray(c.tool_calls) ? c.tool_calls[0] : c.tool_call;
    if (!tc || !("tool_call_id" in tc) || !tc.tool_call_id) return null;
    // ToolCall has `arguments` (JSON string) and `name`, not `input`
    const args = "arguments" in tc && tc.arguments ? tc.arguments : "{}";
    let toolInput: Record<string, unknown> = {};
    try { toolInput = JSON.parse(args); } catch { /* leave empty */ }
    return {
      type: "tool_call" as const,
      toolCallId: tc.tool_call_id,
      toolName: tc.name ?? "unknown",
      toolInput,
      uuid: `${c.id}-tool_call`,
    };
  }

  if (mt === "tool_return_message") {
    const c = chunk as ToolReturnMessage;
    // tool_return (deprecated string field) has the actual output (not .content which is empty)
    return {
      type: "tool_result" as const,
      toolCallId: c.tool_call_id ?? "",
      content: c.tool_return ?? "",
      isError: c.status === "error",
      uuid: `${c.id}-tool_return`,
    };
  }

  if (mt === "approval_request_message") {
    const c = chunk as Extract<LettaStreamingResponse, { message_type?: "approval_request_message" }>;
    // tool_calls is ToolCall[] | ToolCallDelta | null; ToolCall has { arguments, name, tool_call_id }
    const toolCalls: Array<{ name: string; arguments: string; toolCallId: string }> = [];
    if (Array.isArray(c.tool_calls)) {
      for (const tc of c.tool_calls) {
        toolCalls.push({
          name: tc.name,
          arguments: tc.arguments ?? "{}",
          toolCallId: tc.tool_call_id,
        });
      }
    }
    // If only deprecated tool_call, wrap it
    if (toolCalls.length === 0 && c.tool_call && "tool_call_id" in c.tool_call && c.tool_call.tool_call_id) {
      toolCalls.push({
        name: c.tool_call.name ?? "unknown",
        arguments: "arguments" in c.tool_call ? (c.tool_call.arguments ?? "{}") : "{}",
        toolCallId: c.tool_call.tool_call_id,
      });
    }
    return {
      type: "approval_request" as const,
      uuid: `${c.id}-approval_request`,
      messageId: c.id,
      runId: c.run_id ?? "",
      toolCalls,
      isPending: true,
    } satisfies ApprovalRequestMessage;
  }

  if (mt === "error_message") {
    const c = chunk as Extract<LettaStreamingResponse, { message_type: "error_message" }>;
    return {
      type: "result" as const,
      success: false,
      error: c.message ?? "Unknown error",
      durationMs: 0,
      conversationId: null,
    };
  }

  // skip: ping, usage_statistics, stop_reason (handled separately), system/user/hidden_reasoning/approval_response
  return null;
}

export async function runCloudAgent(options: RunnerOptions): Promise<RunnerHandle> {
  const { prompt, session, agentId, resumeConversationId, onEvent, onSessionUpdate, onComplete } = options;
  const client = getLettaClient();

  let currentSessionId = session.id;
  let aborted = false;

  (async () => {
    try {
      // 1. Create or reuse conversation
      let conversationId: string;
      if (resumeConversationId) {
        log.debug("Resuming cloud conversation", { conversationId: resumeConversationId });
        conversationId = resumeConversationId;
      } else if (agentId) {
        log.debug("Creating new cloud conversation", { agentId });
        const conv = await client.conversations.create({ agent_id: agentId });
        conversationId = conv.id;
      } else {
        throw new Error("Cloud runner requires an agentId for new sessions");
      }

      currentSessionId = conversationId;
      onSessionUpdate?.({ lettaConversationId: conversationId, agentId: agentId ?? undefined });

      // 2. Stream response via SSE
      log.debug("Sending prompt to cloud agent", { conversationId, promptLength: prompt.length });
      const stream = await client.conversations.messages.create(conversationId, {
        input: prompt,
        stream_tokens: true,
      });

      for await (const chunk of stream) {
        if (aborted) break;

        const mapped = mapStreamChunk(chunk);
        if (mapped) {
          onEvent({
            type: "stream.message",
            payload: { sessionId: currentSessionId, message: mapped },
          });
        }

        // Detect stop_reason for session status
        const mt = (chunk as { message_type?: string }).message_type;
        if (mt === "stop_reason") {
          const c = chunk as Extract<LettaStreamingResponse, { message_type?: "stop_reason" }>;
          const stopReason = c.stop_reason;
          // "end_turn" = normal completion, "requires_approval" = HITL, "error" = failure
          if (stopReason === "error") {
            onEvent({
              type: "session.status",
              payload: { sessionId: currentSessionId, status: "error", title: currentSessionId },
            });
          }
          // Normal completion and requires_approval handled by emitSessionRefresh in onComplete
        }
      }

      log.debug("Cloud stream ended", { conversationId: currentSessionId });
    } catch (error) {
      if (aborted) {
        log.debug("Cloud session aborted", { conversationId: currentSessionId });
        return;
      }
      log.error("Cloud runner error", { conversationId: currentSessionId, error: String(error) });
      onEvent({
        type: "session.status",
        payload: { sessionId: currentSessionId, status: "error", title: currentSessionId, error: String(error) },
      });
    } finally {
      await onComplete?.(currentSessionId);
    }
  })();

  return {
    abort: async () => {
      aborted = true;
      // Attempt server-side cancellation for long-running tool calls
      if (currentSessionId && currentSessionId !== "pending") {
        try {
          await client.conversations.cancel(currentSessionId);
        } catch {
          // Best-effort — conversation may already be complete
        }
      }
    },
  };
}
