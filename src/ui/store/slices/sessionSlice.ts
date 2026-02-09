import type { StateCreator } from "zustand";
import type { SessionStatus, StreamMessage, ServerEvent } from "../../types";
import type { AppState } from "../useAppStore";

export type PermissionRequest = {
  toolUseId: string;
  toolName: string;
  input: unknown;
};

export type SessionView = {
  id: string;
  title: string;
  status: SessionStatus;
  hasPendingApproval?: boolean;
  agentId?: string;
  cwd?: string;
  restMessages: StreamMessage[];
  streamMessages: StreamMessage[];
  cursor?: string;
  hasMore?: boolean;
  isLoadingPage: boolean;
  permissionRequests: PermissionRequest[];
  lastPrompt?: string;
  createdAt?: number;
  updatedAt?: number;
  hydrated: boolean;
};

export function createSession(id: string): SessionView {
  return { id, title: "", status: "idle", restMessages: [], streamMessages: [], isLoadingPage: false, permissionRequests: [], hydrated: false };
}

export interface SessionSlice {
  sessions: Record<string, SessionView>;
  activeSessionId: string | null;
  artifactSessionId: string | null;
  sessionsLoaded: boolean;
  historyRequested: Set<string>;
  showStartModal: boolean;

  setActiveSessionId: (id: string | null) => void;
  setArtifactSessionId: (id: string | null) => void;
  setShowStartModal: (show: boolean) => void;
  markHistoryRequested: (sessionId: string) => void;
  resolvePermissionRequest: (sessionId: string, toolUseId: string) => void;
  markApprovalHandled: (sessionId: string, messageId: string) => void;
  setLoadingPage: (sessionId: string, loading: boolean) => void;
}

export const createSessionSlice: StateCreator<AppState, [], [], SessionSlice> = (set) => ({
  sessions: {},
  activeSessionId: null,
  artifactSessionId: null,
  sessionsLoaded: false,
  historyRequested: new Set(),
  showStartModal: false,

  setActiveSessionId: (id) => set({ activeSessionId: id, activeView: { type: "chat" }, artifactSessionId: null }),

  setArtifactSessionId: (artifactSessionId) => set({ artifactSessionId }),

  setShowStartModal: (showStartModal) => set({ showStartModal }),

  markHistoryRequested: (sessionId) => {
    set((state) => {
      const next = new Set(state.historyRequested);
      next.add(sessionId);
      return { historyRequested: next };
    });
  },

  resolvePermissionRequest: (sessionId, toolUseId) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return {};
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            permissionRequests: existing.permissionRequests.filter(req => req.toolUseId !== toolUseId)
          }
        }
      };
    });
  },

  markApprovalHandled: (sessionId, messageId) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return {};
      const mapFn = (m: StreamMessage) =>
        m.type === "approval_request" && m.messageId === messageId
          ? { ...m, isPending: false }
          : m;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...existing,
            restMessages: existing.restMessages.map(mapFn),
            streamMessages: existing.streamMessages.map(mapFn),
          }
        }
      };
    });
  },

  setLoadingPage: (sessionId, loading) => {
    set((state) => {
      const existing = state.sessions[sessionId];
      if (!existing) return {};
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...existing, isLoadingPage: loading }
        }
      };
    });
  },
});

export function handleSessionEvent(
  event: ServerEvent,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  get: () => AppState,
): boolean {
  switch (event.type) {
    case "session.list": {
      const state = get();
      const nextSessions: Record<string, SessionView> = {};
      for (const session of event.payload.sessions) {
        const existing = state.sessions[session.id] ?? createSession(session.id);
        nextSessions[session.id] = {
          ...existing,
          status: session.status,
          hasPendingApproval: session.hasPendingApproval,
          title: session.title,
          cwd: session.cwd,
          agentId: session.agentId,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        };
      }

      set({ sessions: nextSessions, sessionsLoaded: true });

      const hasSessions = event.payload.sessions.length > 0;

      if (!hasSessions) {
        get().setActiveSessionId(null);
      }

      if (!state.activeSessionId && event.payload.sessions.length > 0) {
        const sorted = [...event.payload.sessions].sort((a, b) => {
          const aTime = a.updatedAt ?? a.createdAt ?? 0;
          const bTime = b.updatedAt ?? b.createdAt ?? 0;
          return aTime - bTime;
        });
        const latestSession = sorted[sorted.length - 1];
        if (latestSession) {
          get().setActiveSessionId(latestSession.id);
        }
      } else if (state.activeSessionId) {
        const stillExists = event.payload.sessions.some(
          (session) => session.id === state.activeSessionId
        );
        if (!stillExists) {
          get().setActiveSessionId(null);
        }
      }
      return true;
    }

    case "session.history": {
      const { sessionId, messages: historyMessages, status, hasPendingApproval, cursor, hasMore, append } = event.payload;
      set((state) => {
        const existing = state.sessions[sessionId] ?? createSession(sessionId);

        if (append) {
          const seen = new Set(existing.restMessages.map((m) => 'uuid' in m ? (m as { uuid: string }).uuid : undefined).filter(Boolean));
          const newMsgs = historyMessages.filter((m) => {
            const key = 'uuid' in m ? (m as { uuid: string }).uuid : undefined;
            return !key || !seen.has(key);
          });
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                restMessages: [...newMsgs, ...existing.restMessages],
                cursor: cursor ?? existing.cursor,
                hasMore: hasMore ?? existing.hasMore,
                isLoadingPage: false,
              }
            }
          };
        }

        return {
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...existing,
              status,
              hasPendingApproval: hasPendingApproval ?? existing.hasPendingApproval,
              restMessages: historyMessages,
              streamMessages: [],
              cursor,
              hasMore,
              isLoadingPage: false,
              hydrated: true,
            }
          }
        };
      });
      return true;
    }

    case "session.refresh": {
      const { sessionId, messages: freshMessages, cursor, hasMore, status, hasPendingApproval } = event.payload;
      set((state) => {
        const existing = state.sessions[sessionId] ?? createSession(sessionId);
        const freshUuids = new Set(freshMessages.map((m) => 'uuid' in m ? (m as { uuid: string }).uuid : undefined).filter(Boolean));
        const olderMessages = existing.restMessages.filter((m) => {
          const key = 'uuid' in m ? (m as { uuid: string }).uuid : undefined;
          return key && !freshUuids.has(key);
        });
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...existing,
              restMessages: [...olderMessages, ...freshMessages],
              streamMessages: [],
              cursor: cursor ?? existing.cursor,
              hasMore: hasMore ?? existing.hasMore,
              status,
              hasPendingApproval,
              hydrated: true,
            }
          }
        };
      });
      return true;
    }

    case "session.status": {
      const state = get();
      const { sessionId, status, title, cwd, agentId } = event.payload;
      set((s) => {
        const existing = s.sessions[sessionId] ?? createSession(sessionId);
        return {
          sessions: {
            ...s.sessions,
            [sessionId]: {
              ...existing,
              status,
              title: title ?? existing.title,
              cwd: cwd ?? existing.cwd,
              agentId: agentId ?? existing.agentId,
              updatedAt: Date.now(),
              hydrated: s.pendingStart ? true : existing.hydrated,
            }
          }
        };
      });

      if (state.pendingStart) {
        const av = state.activeView;
        if (av.type === "artifact" && av.agentId && agentId === av.agentId) {
          set({ artifactSessionId: sessionId, pendingStart: false, prompt: "" });
        } else {
          get().setActiveSessionId(sessionId);
          set({ pendingStart: false, showStartModal: false, prompt: "" });
        }
      }
      return true;
    }

    case "session.deleted": {
      const state = get();
      const { sessionId } = event.payload;

      const nextSessions = { ...state.sessions };
      delete nextSessions[sessionId];

      const nextHistoryRequested = new Set(state.historyRequested);
      nextHistoryRequested.delete(sessionId);

      const hasRemaining = Object.keys(nextSessions).length > 0;

      set({
        sessions: nextSessions,
        historyRequested: nextHistoryRequested,
        showStartModal: !hasRemaining
      });

      if (state.activeSessionId === sessionId) {
        const remaining = Object.values(nextSessions).sort(
          (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
        );
        get().setActiveSessionId(remaining[0]?.id ?? null);
      }
      return true;
    }

    case "stream.message": {
      const { sessionId, message } = event.payload;
      set((state) => {
        const existing = state.sessions[sessionId] ?? createSession(sessionId);
        const streamMessages = [...existing.streamMessages];

        const msgId = 'uuid' in message ? message.uuid : undefined;
        const msgType = message.type;

        if (msgId) {
          const existingIdx = streamMessages.findIndex(
            (m) => 'uuid' in m && m.uuid === msgId
          );
          if (existingIdx >= 0) {
            if (msgType === "reasoning" || msgType === "assistant") {
              const existingMsg = streamMessages[existingIdx];
              const existingContent = 'content' in existingMsg ? existingMsg.content : "";
              const newContent = 'content' in message ? message.content : "";
              streamMessages[existingIdx] = {
                ...message,
                content: existingContent + newContent
              } as StreamMessage;
            } else {
              streamMessages[existingIdx] = message;
            }
          } else {
            streamMessages.push(message);
          }
        } else if (msgType === "approval_request") {
          const approvalMsg = message as { type: "approval_request"; messageId: string };
          const existingIdx = streamMessages.findIndex(
            (m) => m.type === "approval_request" && m.messageId === approvalMsg.messageId
          );
          if (existingIdx >= 0) {
            streamMessages[existingIdx] = message;
          } else {
            streamMessages.push(message);
          }
        } else {
          streamMessages.push(message);
        }

        return {
          sessions: {
            ...state.sessions,
            [sessionId]: { ...existing, streamMessages }
          }
        };
      });
      return true;
    }

    case "stream.user_prompt": {
      const { sessionId, prompt } = event.payload;
      set((state) => {
        const existing = state.sessions[sessionId] ?? createSession(sessionId);
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...existing,
              streamMessages: [...existing.streamMessages, { type: "user_prompt" as const, prompt }]
            }
          }
        };
      });
      return true;
    }

    case "permission.request": {
      const { sessionId, toolUseId, toolName, input } = event.payload;
      set((state) => {
        const existing = state.sessions[sessionId] ?? createSession(sessionId);
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: {
              ...existing,
              permissionRequests: [...existing.permissionRequests, { toolUseId, toolName, input }]
            }
          }
        };
      });
      return true;
    }

    default:
      return false;
  }
}
