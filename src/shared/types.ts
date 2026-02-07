/**
 * Shared types for electron ↔ UI communication.
 * Single source of truth — both src/electron/types.ts and src/ui/types.ts re-export from here.
 */

// Re-export SDK types
export type {
  SDKMessage,
  SDKInitMessage,
  SDKAssistantMessage,
  SDKToolCallMessage,
  SDKToolResultMessage,
  SDKReasoningMessage,
  SDKResultMessage,
  SDKStreamEventMessage,
  CanUseToolResponse,
} from "@letta-ai/letta-code-sdk";

export type UserPromptMessage = {
  type: "user_prompt";
  prompt: string;
  uuid?: string;
};

export type ApprovalToolCall = {
  name: string;
  arguments: string;
  toolCallId: string;
};

export type ApprovalRequestMessage = {
  type: "approval_request";
  uuid?: string;
  messageId: string;
  runId: string;
  toolCalls: ApprovalToolCall[];
  isPending: boolean;
};

// Import for union type and local use
import type { SDKMessage, CanUseToolResponse } from "@letta-ai/letta-code-sdk";

export type StreamMessage = SDKMessage | UserPromptMessage | ApprovalRequestMessage;

export type SessionStatus = "idle" | "running" | "completed" | "error";

export type SessionInfo = {
  id: string;
  title: string;
  status: SessionStatus;
  hasPendingApproval?: boolean;
  lettaConversationId?: string;
  agentId?: string;
  cwd?: string;
  createdAt: number;
  updatedAt: number;
};

export type AgentInfo = {
  lettaAgentId: string;
  name: string;
  icon: string;
  color: string;
  model?: string;
  createdAt: string;
};

export type ModelInfo = {
  handle: string;
  name: string;
  display_name: string;
  provider_type: string;
  max_context_window: number;
};

// Server -> Client events
export type ServerEvent =
  | { type: "stream.message"; payload: { sessionId: string; message: StreamMessage } }
  | { type: "stream.user_prompt"; payload: { sessionId: string; prompt: string } }
  | { type: "session.status"; payload: { sessionId: string; status: SessionStatus; title?: string; cwd?: string; agentId?: string; error?: string } }
  | { type: "session.list"; payload: { sessions: SessionInfo[] } }
  | { type: "session.history"; payload: { sessionId: string; status: SessionStatus; hasPendingApproval?: boolean; messages: StreamMessage[]; cursor?: string; hasMore?: boolean; append?: boolean } }
  | { type: "session.refresh"; payload: { sessionId: string; status: SessionStatus; hasPendingApproval?: boolean; messages: StreamMessage[]; cursor?: string; hasMore?: boolean } }
  | { type: "session.deleted"; payload: { sessionId: string } }
  | { type: "permission.request"; payload: { sessionId: string; toolUseId: string; toolName: string; input: unknown } }
  | { type: "runner.error"; payload: { sessionId?: string; message: string } }
  | { type: "agent.list"; payload: { agents: AgentInfo[] } }
  | { type: "agent.created"; payload: AgentInfo }
  | { type: "agent.deleted"; payload: { lettaAgentId: string } }
  | { type: "agent.renamed"; payload: { lettaAgentId: string; name: string } }
  | { type: "models.list"; payload: { models: ModelInfo[] } };

// Client -> Server events
export type ClientEvent =
  | { type: "session.start"; payload: { title: string; prompt: string; cwd?: string; agentId?: string; allowedTools?: string } }
  | { type: "session.continue"; payload: { sessionId: string; prompt: string; cwd?: string } }
  | { type: "session.stop"; payload: { sessionId: string } }
  | { type: "session.delete"; payload: { sessionId: string } }
  | { type: "session.list" }
  | { type: "session.history"; payload: { sessionId: string; before?: string; limit?: number } }
  | { type: "permission.response"; payload: { sessionId: string; toolUseId: string; result: CanUseToolResponse } }
  | { type: "agent.list" }
  | { type: "agent.create"; payload: { name: string; icon: string; color: string; model?: string } }
  | { type: "agent.delete"; payload: { lettaAgentId: string } }
  | { type: "agent.rename"; payload: { lettaAgentId: string; name: string } }
  | { type: "models.list" }
  | { type: "approval.response"; payload: { sessionId: string; approvals: Array<{ tool_call_id: string; approve: boolean; reason?: string }> } };
