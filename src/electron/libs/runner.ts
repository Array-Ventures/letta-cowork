import {
  createSession,
  resumeSession,
  type Session as LettaSession,
  type SDKMessage,
} from "@letta-ai/letta-code-sdk";
import type { ServerEvent } from "../types.js";
import { createLogger } from "./logger.js";

const log = createLogger("runner");

// Simplified session type for runner
export type RunnerSession = {
  id: string;
  title: string;
  status: string;
  cwd?: string;
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

  // Start the query in the background
  (async () => {
    try {
      // Session options
      const sessionOptions = {
        cwd: session.cwd ?? DEFAULT_CWD,
        permissionMode: "bypassPermissions" as const,
      };

      // Create or resume session
      let lettaSession: LettaSession;

      if (resumeConversationId) {
        log.debug("Resuming session", { conversationId: resumeConversationId });
        lettaSession = resumeSession(resumeConversationId, sessionOptions);
      } else if (agentId) {
        log.debug("Creating new session", { agentId });
        lettaSession = createSession(agentId, sessionOptions);
      } else {
        log.debug("Creating session without agent");
        lettaSession = createSession(undefined, sessionOptions);
      }

      // Store for abort handling (per-invocation, not global)
      localLettaSession = lettaSession;

      // Send the prompt (triggers init internally)
      await lettaSession.send(prompt);

      log.debug("Prompt sent, session initialized", { conversationId: lettaSession.conversationId, agentId: lettaSession.agentId });

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

      log.debug("Stream ended", { conversationId: currentSessionId });

      // Query completed normally
      if (session.status === "running") {
        onEvent({
          type: "session.status",
          payload: { sessionId: currentSessionId, status: "completed", title: currentSessionId }
        });
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        log.debug("Session aborted", { conversationId: currentSessionId });
        return;
      }
      log.error("Runner error", { conversationId: currentSessionId, error: String(error) });
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
