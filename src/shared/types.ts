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
  sandboxId?: string;
};

export type ModelInfo = {
  handle: string;
  name: string;
  display_name: string;
  provider_type: string;
  max_context_window: number;
};

// Folders / Files
export type FolderInfo = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type FileInfo = {
  id: string;
  folderId: string;
  fileName: string;
  fileSize?: number;
  fileType?: string;
  processingStatus?: "pending" | "parsing" | "embedding" | "completed" | "error";
  errorMessage?: string;
  totalChunks?: number;
  chunksEmbedded?: number;
  createdAt?: string;
};

export type EmbeddingModelInfo = {
  handle: string;
  name: string;
  provider_type: string;
};

// App Configuration (onboarding wizard)
export type AppConfig = {
  letta: { baseUrl: string; apiKey: string; serverVersion?: string };
  organization: { id: string; name: string };
  identity: { id: string; name: string; identifierKey: string };
  daytona: { apiKey: string; apiUrl: string };
};

export type OrgInfo = { id: string; name: string };
export type IdentityInfo = { id: string; name: string; identifierKey: string };

// Artifacts
export type ActiveView =
  | { type: "home" }
  | { type: "chat" }
  | { type: "artifact"; artifactId: string; agentId?: string }
  | { type: "files" };

export type ArtifactInfo = {
  id: string;
  name: string;
  icon: string;
  agentId?: string;
  path?: string;
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
  | { type: "models.list"; payload: { models: ModelInfo[] } }
  | { type: "artifacts.list"; payload: { artifacts: ArtifactInfo[] } }
  | { type: "artifact.created"; payload: { artifact: ArtifactInfo } }
  | { type: "artifact.reload"; payload: { artifactId: string } }
  | { type: "folder.list"; payload: { folders: FolderInfo[] } }
  | { type: "folder.created"; payload: FolderInfo }
  | { type: "folder.updated"; payload: FolderInfo }
  | { type: "folder.deleted"; payload: { folderId: string } }
  | { type: "folder.files"; payload: { folderId: string; files: FileInfo[] } }
  | { type: "folder.file.uploaded"; payload: { folderId: string; file: FileInfo } }
  | { type: "folder.file.deleted"; payload: { folderId: string; fileId: string } }
  | { type: "folder.agents"; payload: { folderId: string; agentIds: string[] } }
  | { type: "folder.attached"; payload: { folderId: string; agentId: string } }
  | { type: "folder.detached"; payload: { folderId: string; agentId: string } }
  | { type: "embedding_models.list"; payload: { models: EmbeddingModelInfo[] } }
  // Config / onboarding
  | { type: "config.status"; payload: { configured: boolean; config?: AppConfig } }
  | { type: "config.testServer.result"; payload: { success: boolean; version?: string; error?: string } }
  | { type: "config.listOrgs.result"; payload: { success: boolean; orgs?: OrgInfo[]; error?: string } }
  | { type: "config.listIdentities.result"; payload: { success: boolean; identities?: IdentityInfo[]; error?: string } }
  | { type: "config.testDaytona.result"; payload: { success: boolean; error?: string } }
  | { type: "config.createIdentity.result"; payload: { success: boolean; identityId?: string; error?: string } }
  | { type: "config.saved"; payload: { success: boolean; error?: string } }
  | { type: "config.reset.result"; payload: { success: boolean } };

// Client -> Server events
export type ClientEvent =
  | { type: "session.start"; payload: { title: string; prompt: string; cwd?: string; agentId?: string; allowedTools?: string; mode?: "local" | "cloud" } }
  | { type: "session.continue"; payload: { sessionId: string; prompt: string; cwd?: string; mode?: "local" | "cloud" } }
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
  | { type: "artifacts.list" }
  | { type: "approval.response"; payload: { sessionId: string; approvals: Array<{ tool_call_id: string; approve: boolean; reason?: string }> } }
  | { type: "artifact.create"; payload: { name: string; icon: string; agentIcon: string; agentColor: string; model?: string } }
  | { type: "artifact.watch"; payload: { artifactId: string | null } }
  | { type: "folder.list" }
  | { type: "folder.create"; payload: { name: string; description?: string; instructions?: string; embedding?: string } }
  | { type: "folder.update"; payload: { folderId: string; name?: string; description?: string; instructions?: string } }
  | { type: "folder.delete"; payload: { folderId: string } }
  | { type: "folder.files"; payload: { folderId: string } }
  | { type: "folder.upload"; payload: { folderId: string; filePath: string } }
  | { type: "folder.file.delete"; payload: { folderId: string; fileId: string } }
  | { type: "folder.agents"; payload: { folderId: string } }
  | { type: "folder.attach"; payload: { folderId: string; agentId: string } }
  | { type: "folder.detach"; payload: { folderId: string; agentId: string } }
  | { type: "embedding_models.list" }
  // Config / onboarding
  | { type: "config.get" }
  | { type: "config.save"; payload: AppConfig }
  | { type: "config.testServer"; payload: { baseUrl: string; apiKey: string } }
  | { type: "config.listOrgs"; payload: { baseUrl: string; apiKey: string } }
  | { type: "config.listIdentities"; payload: { baseUrl: string; apiKey: string } }
  | { type: "config.testDaytona"; payload: { apiKey: string; apiUrl: string } }
  | { type: "config.createIdentity"; payload: { baseUrl: string; apiKey: string; name: string; identifierKey: string } }
  | { type: "config.reset" };
