/**
 * Simple in-memory runtime state for active sessions.
 * No persistence needed - Letta handles conversation/message storage.
 */

export type SessionStatus = "idle" | "running" | "completed" | "error";

export type RuntimeSession = {
  conversationId: string;
  agentId?: string;
  mode?: "local" | "cloud";
  status: SessionStatus;
  abortController?: AbortController;
};

// In-memory state for active sessions
const sessions = new Map<string, RuntimeSession>();

export function createRuntimeSession(conversationId: string): RuntimeSession {
  const session: RuntimeSession = {
    conversationId,
    status: "idle",
  };
  sessions.set(conversationId, session);
  return session;
}

export function getSession(conversationId: string): RuntimeSession | undefined {
  return sessions.get(conversationId);
}

export function updateSession(conversationId: string, updates: Partial<RuntimeSession>): RuntimeSession | undefined {
  const session = sessions.get(conversationId);
  if (!session) return undefined;
  Object.assign(session, updates);
  return session;
}

export function deleteSession(conversationId: string): boolean {
  return sessions.delete(conversationId);
}

export function getAllSessions(): Map<string, RuntimeSession> {
  return sessions;
}
