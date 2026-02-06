/**
 * Letta REST API client for fetching conversations and messages.
 * Source of truth for session persistence — no local storage needed.
 */

import type { StreamMessage } from "../types.js";

// --- Letta API response types ---

export type LettaConversation = {
  id: string;
  agent_id: string;
  created_at: string;
  updated_at: string;
  summary: string | null;
};

type LettaMessageBase = {
  id: string;
  date: string;
  message_type: string;
};

type LettaUserMessage = LettaMessageBase & {
  message_type: "user_message";
  content: string;
};

type LettaAssistantMessage = LettaMessageBase & {
  message_type: "assistant_message";
  content: string;
};

type LettaReasoningMessage = LettaMessageBase & {
  message_type: "reasoning_message";
  reasoning: string;
};

type LettaSystemMessage = LettaMessageBase & {
  message_type: "system_message";
  content: string;
};

type LettaToolCallMessage = LettaMessageBase & {
  message_type: "tool_call_message";
  tool_call: {
    id: string;
    name: string;
    arguments: string;
  };
};

type LettaToolReturnMessage = LettaMessageBase & {
  message_type: "tool_return_message";
  tool_call_id: string;
  content: string;
  tool_return: string;
  status: "success" | "error";
};

type LettaApprovalToolCall = {
  name: string;
  arguments: string;
  tool_call_id: string;
};

type LettaApprovalRequestMessage = LettaMessageBase & {
  message_type: "approval_request_message";
  run_id: string;
  tool_call: LettaApprovalToolCall;
  tool_calls: LettaApprovalToolCall[];
};

type LettaApprovalResponseMessage = LettaMessageBase & {
  message_type: "approval_response_message";
};

type LettaMessage =
  | LettaUserMessage
  | LettaAssistantMessage
  | LettaReasoningMessage
  | LettaSystemMessage
  | LettaToolCallMessage
  | LettaToolReturnMessage
  | LettaApprovalRequestMessage
  | LettaApprovalResponseMessage;

// --- Helpers ---

function getBaseUrl(): string {
  return process.env.LETTA_BASE_URL || "http://localhost:8283";
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (process.env.LETTA_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.LETTA_API_KEY}`;
  }
  return headers;
}

function safeParseJson(str: string): Record<string, unknown> {
  try {
    return JSON.parse(str);
  } catch {
    return { raw: str };
  }
}

// --- Run types ---

type LettaRun = {
  id: string;
  status: "created" | "running" | "completed" | "failed" | "cancelled";
  stop_reason: string | null;
  conversation_id: string | null;
  agent_id: string;
  created_at: string;
};

// --- API functions ---

export async function fetchLastRun(conversationId: string): Promise<LettaRun | null> {
  const url = `${getBaseUrl()}/v1/runs/?conversation_id=${encodeURIComponent(conversationId)}&order=desc&limit=1`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) return null;
  const runs = await res.json() as LettaRun[];
  return runs[0] ?? null;
}

export async function fetchConversations(agentId: string): Promise<LettaConversation[]> {
  const url = `${getBaseUrl()}/v1/conversations/?agent_id=${encodeURIComponent(agentId)}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    throw new Error(`Letta API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchConversationMessages(conversationId: string): Promise<LettaMessage[]> {
  const url = `${getBaseUrl()}/v1/conversations/${encodeURIComponent(conversationId)}/messages`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    throw new Error(`Letta API error ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export type AgentUpdate = {
  name?: string;
  description?: string;
};

export async function updateAgent(agentId: string, updates: AgentUpdate): Promise<void> {
  const url = `${getBaseUrl()}/v1/agents/${encodeURIComponent(agentId)}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    throw new Error(`Letta API error ${res.status}: ${res.statusText}`);
  }
}

export async function sendApprovalResponse(
  conversationId: string,
  approvals: Array<{ tool_call_id: string; approve: boolean; reason?: string }>
): Promise<LettaMessage[]> {
  const url = `${getBaseUrl()}/v1/conversations/${encodeURIComponent(conversationId)}/messages`;
  const body = {
    messages: [{
      type: "approval",
      approvals: approvals.map((a) => ({
        type: "approval" as const,
        tool_call_id: a.tool_call_id,
        approve: a.approve,
        ...(a.reason ? { reason: a.reason } : {}),
      })),
    }],
    streaming: false,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Letta API error ${res.status}: ${text}`);
  }

  const data = await res.json() as { messages: LettaMessage[] };
  return data.messages;
}

// --- Message transformation ---

export function transformLettaMessages(apiMessages: LettaMessage[], pendingRunId?: string): StreamMessage[] {
  // API returns newest-first; sort by date ascending.
  // Index tiebreaker preserves within-turn order (reasoning before assistant)
  // when messages share the same timestamp.
  const indexed = apiMessages.map((m, i) => ({ m, i }));
  indexed.sort((a, b) => {
    const dt = new Date(a.m.date).getTime() - new Date(b.m.date).getTime();
    return dt !== 0 ? dt : a.i - b.i;
  });
  const chronological = indexed.map(({ m }) => m);
  const transformed: StreamMessage[] = [];

  for (const msg of chronological) {
    switch (msg.message_type) {
      case "user_message":
        transformed.push({ type: "user_prompt", prompt: msg.content });
        break;

      case "assistant_message":
        transformed.push({ type: "assistant", content: msg.content, uuid: `${msg.id}-assistant` });
        break;

      case "reasoning_message":
        transformed.push({ type: "reasoning", content: msg.reasoning, uuid: `${msg.id}-reasoning` });
        break;

      case "hidden_reasoning_message":
        // Redacted reasoning — skip in UI
        break;

      case "tool_call_message":
        transformed.push({
          type: "tool_call",
          toolCallId: msg.tool_call.id,
          toolName: msg.tool_call.name,
          toolInput: safeParseJson(msg.tool_call.arguments),
          uuid: `${msg.id}-tool_call`,
        });
        break;

      case "tool_return_message":
        transformed.push({
          type: "tool_result",
          toolCallId: msg.tool_call_id,
          content: msg.tool_return || msg.content || "",
          isError: msg.status === "error",
          uuid: `${msg.id}-tool_return`,
        });
        break;

      case "approval_request_message": {
        const approvalMsg = msg as LettaApprovalRequestMessage;
        // Pending if this request's run_id matches the conversation's last run
        // which stopped with requires_approval (passed in as pendingRunId)
        transformed.push({
          type: "approval_request",
          messageId: approvalMsg.id,
          runId: approvalMsg.run_id,
          toolCalls: (approvalMsg.tool_calls ?? [approvalMsg.tool_call]).map((tc) => ({
            name: tc.name,
            arguments: tc.arguments,
            toolCallId: tc.tool_call_id,
          })),
          isPending: !!pendingRunId && approvalMsg.run_id === pendingRunId,
        });
        break;
      }

      case "approval_response_message":
        // Internal marker — skip in UI
        break;

      case "system_message":
        // Internal to Letta — skip in UI
        break;

      default:
        console.warn(`Unknown Letta message type: ${(msg as LettaMessageBase).message_type}`);
        break;
    }
  }

  return transformed;
}
