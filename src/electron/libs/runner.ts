import {
  createSession,
  resumeSession,
  type Session as LettaSession,
  type SDKMessage,
  type CanUseToolResponse,
} from "@letta-ai/letta-code-sdk";
import type { ServerEvent } from "../types.js";
import type { PendingPermission } from "./runtime-state.js";

// Simplified session type for runner
export type RunnerSession = {
  id: string;
  title: string;
  status: string;
  cwd?: string;
  pendingPermissions: Map<string, PendingPermission>;
};

export type RunnerOptions = {
  prompt: string;
  session: RunnerSession;
  agentId?: string;
  resumeConversationId?: string;
  onEvent: (event: ServerEvent) => void;
  onSessionUpdate?: (updates: { lettaConversationId?: string; agentId?: string }) => void;
  onComplete?: (conversationId: string) => void;
};

export type RunnerHandle = {
  abort: () => Promise<void>;
};

const DEFAULT_CWD = process.cwd();

export async function runLetta(options: RunnerOptions): Promise<RunnerHandle> {
  const { prompt, session, agentId, resumeConversationId, onEvent, onSessionUpdate, onComplete } = options;

  // Mutable sessionId - starts as session.id, updated when conversationId is available
  let currentSessionId = session.id;

  // Per-invocation session reference (not module-level) to avoid concurrent session clobbering
  let localLettaSession: LettaSession | null = null;

  const sendMessage = (message: SDKMessage) => {
    onEvent({
      type: "stream.message",
      payload: { sessionId: currentSessionId, message }
    });
  };

  const sendPermissionRequest = (toolUseId: string, toolName: string, input: unknown) => {
    onEvent({
      type: "permission.request",
      payload: { sessionId: currentSessionId, toolUseId, toolName, input }
    });
  };

  // Start the query in the background
  (async () => {
    try {
      // Common options for canUseTool
      const promptUser = (toolName: string, input: unknown) => {
        const toolUseId = crypto.randomUUID();
        sendPermissionRequest(toolUseId, toolName, input);
        return new Promise<CanUseToolResponse>((resolve) => {
          session.pendingPermissions.set(toolUseId, {
            toolUseId,
            toolName,
            input,
            resolve: (result) => {
              session.pendingPermissions.delete(toolUseId);
              resolve(result);
            }
          });
        });
      };

      const canUseTool = async (toolName: string, input: unknown) => {
        // Bash → always ask user
        if (toolName === "Bash") {
          return promptUser(toolName, input);
        }
        // AskUserQuestion → route to user
        if (toolName === "AskUserQuestion") {
          return promptUser(toolName, input);
        }
        // Everything else → auto-approve
        return { behavior: "allow" as const };
      };

      // Session options
      const sessionOptions = {
        cwd: session.cwd ?? DEFAULT_CWD,
        permissionMode: "default" as const,
        canUseTool,
      };

      // Create or resume session
      let lettaSession: LettaSession;

      if (resumeConversationId) {
        // Resume specific conversation
        lettaSession = resumeSession(resumeConversationId, sessionOptions);
      } else if (agentId) {
        // New conversation on existing agent
        lettaSession = createSession(agentId, sessionOptions);
      } else {
        // Fallback - no agent specified
        lettaSession = createSession(undefined, sessionOptions);
      }

      // Store for abort handling (per-invocation, not global)
      localLettaSession = lettaSession;

      // Send the prompt (triggers init internally)
      await lettaSession.send(prompt);

      // Now initialized - update sessionId and cache agentId
      if (lettaSession.conversationId) {
        currentSessionId = lettaSession.conversationId;
        onSessionUpdate?.({
          lettaConversationId: lettaSession.conversationId,
          agentId: lettaSession.agentId ?? undefined
        });
      }

      // Stream messages
      for await (const message of lettaSession.stream()) {
        // Send message directly to frontend (no transform needed)
        sendMessage(message);

        // Check for result to update session status
        if (message.type === "result") {
          const status = message.success ? "completed" : "error";
          onEvent({
            type: "session.status",
            payload: { sessionId: currentSessionId, status, title: currentSessionId }
          });
        }
      }

      // Query completed normally
      if (session.status === "running") {
        onEvent({
          type: "session.status",
          payload: { sessionId: currentSessionId, status: "completed", title: currentSessionId }
        });
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        // Session was aborted, don't treat as error
        return;
      }
      onEvent({
        type: "session.status",
        payload: { sessionId: currentSessionId, status: "error", title: currentSessionId, error: String(error) }
      });
    } finally {
      localLettaSession = null;
      // Notify completion so IPC can check for pending approvals (runs on all paths)
      await onComplete?.(currentSessionId);
    }
  })();

  return {
    abort: async () => {
      if (localLettaSession) {
        await localLettaSession.abort();
        localLettaSession = null;
      }
    }
  };
}
