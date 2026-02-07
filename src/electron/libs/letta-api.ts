/**
 * Letta API client using the official @letta-ai/letta-client SDK.
 * Provides typed wrappers for run/conversation/message/agent operations
 * and transforms SDK messages into our StreamMessage format.
 */

import type { StreamMessage } from "../types.js";
import type { Message, ToolCall } from "@letta-ai/letta-client/resources/agents/messages.js";
import type { Run } from "@letta-ai/letta-client/resources/agents/messages.js";
import type { Conversation } from "@letta-ai/letta-client/resources/conversations/conversations.js";
import type { ToolReturnMessage } from "@letta-ai/letta-client/resources/tools.js";
import { getLettaClient } from "./letta-client.js";

// Re-export SDK types used by ipc-handlers
export type { Run, Conversation, Message };

// --- API functions ---

export async function fetchLastRun(conversationId: string): Promise<Run | null> {
  const client = getLettaClient();
  const page = await client.runs.list({
    conversation_id: conversationId,
    limit: 1,
    order: "desc",
  });
  return page.items[0] ?? null;
}

export async function fetchConversations(agentId: string): Promise<Conversation[]> {
  const client = getLettaClient();
  return client.conversations.list({ agent_id: agentId });
}

export async function fetchMessagePage(
  conversationId: string,
  options?: { before?: string; limit?: number }
): Promise<{ items: Message[]; hasMore: boolean }> {
  const client = getLettaClient();
  const limit = options?.limit ?? 50;
  const page = await client.conversations.messages.list(conversationId, {
    limit,
    ...(options?.before ? { before: options.before } : {}),
  });
  // SDK's hasNextPage() returns true as long as items exist (can't detect last page
  // without an extra fetch), so also check if we got fewer items than requested.
  const hasMore = page.items.length >= limit && page.hasNextPage();
  return { items: page.items, hasMore };
}

export async function updateAgent(agentId: string, updates: { name?: string; description?: string }): Promise<void> {
  const client = getLettaClient();
  await client.agents.update(agentId, updates);
}

export async function sendApprovalResponse(
  conversationId: string,
  approvals: Array<{ tool_call_id: string; approve: boolean; reason?: string }>
): Promise<Message[]> {
  const client = getLettaClient();
  // Need agentId — retrieve from conversation
  const conv = await client.conversations.retrieve(conversationId);
  const response = await client.agents.messages.create(conv.agent_id, {
    messages: [{
      type: "approval" as const,
      approvals: approvals.map((a) => ({
        type: "approval" as const,
        tool_call_id: a.tool_call_id,
        approve: a.approve,
        ...(a.reason ? { reason: a.reason } : {}),
      })),
    }],
    streaming: false,
  });
  return response.messages;
}

// --- Helpers ---

function safeParseJson(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    return { raw: str };
  }
}

function extractContent(content: string | Array<{ type?: string; text?: string }>): string {
  if (typeof content === "string") return content;
  return content
    .filter((c): c is { text: string } => "text" in c && typeof c.text === "string")
    .map((c) => c.text)
    .join("");
}

// --- Message transformation ---

export function transformLettaMessages(apiMessages: Message[], pendingRunId?: string): StreamMessage[] {
  // API returns newest-first for pagination, but within same-ID pairs (e.g.
  // reasoning + assistant), messages are in chronological order.  A simple
  // .reverse() would flip within-pair order.  Instead: group consecutive
  // same-ID messages, reverse the groups, then flatten.
  const groups: Message[][] = [];
  let currentGroup: Message[] = [];
  let currentId: string | null = null;

  for (const msg of apiMessages) {
    if (msg.id !== currentId) {
      if (currentGroup.length > 0) groups.push(currentGroup);
      currentGroup = [msg];
      currentId = msg.id;
    } else {
      currentGroup.push(msg);
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  groups.reverse();
  const chronological = groups.flat();
  const transformed: StreamMessage[] = [];

  for (const msg of chronological) {
    const messageType = msg.message_type;

    switch (messageType) {
      case "user_message":
        transformed.push({ type: "user_prompt", prompt: extractContent(msg.content), uuid: `${msg.id}-user` });
        break;

      case "assistant_message":
        transformed.push({ type: "assistant", content: extractContent(msg.content), uuid: `${msg.id}-assistant` });
        break;

      case "reasoning_message":
        transformed.push({ type: "reasoning", content: msg.reasoning, uuid: `${msg.id}-reasoning` });
        break;

      case "hidden_reasoning_message":
        // Redacted reasoning — skip in UI
        break;

      case "tool_call_message": {
        const tc = msg.tool_call as ToolCall;
        transformed.push({
          type: "tool_call",
          toolCallId: tc.tool_call_id,
          toolName: tc.name,
          toolInput: safeParseJson(tc.arguments),
          uuid: `${msg.id}-tool_call`,
        });
        break;
      }

      case "tool_return_message": {
        const trm = msg as ToolReturnMessage;
        transformed.push({
          type: "tool_result",
          toolCallId: trm.tool_call_id,
          content: trm.tool_return || "",
          isError: trm.status === "error",
          uuid: `${msg.id}-tool_return`,
        });
        break;
      }

      case "approval_request_message": {
        const toolCalls = Array.isArray(msg.tool_calls)
          ? (msg.tool_calls as ToolCall[])
          : msg.tool_call
            ? [msg.tool_call as ToolCall]
            : [];
        const isPending = !!pendingRunId && msg.run_id === pendingRunId;

        // Emit tool_call for each tool so ToolCallCard renders properly
        for (const tc of toolCalls) {
          transformed.push({
            type: "tool_call",
            toolCallId: tc.tool_call_id,
            toolName: tc.name,
            toolInput: safeParseJson(tc.arguments),
            uuid: `${msg.id}-tool_call-${tc.tool_call_id}`,
          });
        }

        // Only emit the approval_request if it's actually pending user action
        if (isPending) {
          transformed.push({
            type: "approval_request",
            uuid: `${msg.id}-approval_request`,
            messageId: msg.id,
            runId: msg.run_id ?? "",
            toolCalls: toolCalls.map((tc) => ({
              name: tc.name,
              arguments: tc.arguments,
              toolCallId: tc.tool_call_id,
            })),
            isPending: true,
          });
        }
        break;
      }

      case "approval_response_message":
        // Internal marker — skip in UI
        break;

      case "system_message":
        // Internal to Letta — skip in UI
        break;

      case "summary_message":
        // Compaction summary — skip in UI
        break;

      case "event_message":
        // Compaction event — skip in UI
        break;

      default:
        console.warn(`Unknown Letta message type: ${messageType}`);
        break;
    }
  }

  return transformed;
}
