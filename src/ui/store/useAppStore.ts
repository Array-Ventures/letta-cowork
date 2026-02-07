import { create } from 'zustand';
import type { ServerEvent, SessionStatus, StreamMessage, AgentInfo, ModelInfo } from "../types";

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
  restMessages: StreamMessage[];      // Server truth (paginated)
  streamMessages: StreamMessage[];    // Ephemeral SDK stream
  cursor?: string;                    // Oldest loaded message ID for scroll-up
  hasMore?: boolean;                  // Whether older pages exist
  isLoadingPage: boolean;             // Prevents concurrent page loads
  permissionRequests: PermissionRequest[];
  lastPrompt?: string;
  createdAt?: number;
  updatedAt?: number;
  hydrated: boolean;
};

interface AppState {
  sessions: Record<string, SessionView>;
  agents: AgentInfo[];
  models: ModelInfo[];
  selectedAgentId: string | null;
  activeSessionId: string | null;
  prompt: string;
  cwd: string;
  pendingStart: boolean;
  globalError: string | null;
  sessionsLoaded: boolean;
  agentsLoaded: boolean;
  showStartModal: boolean;
  historyRequested: Set<string>;

  setPrompt: (prompt: string) => void;
  setCwd: (cwd: string) => void;
  setPendingStart: (pending: boolean) => void;
  setGlobalError: (error: string | null) => void;
  setShowStartModal: (show: boolean) => void;
  setActiveSessionId: (id: string | null) => void;
  setAgents: (agents: AgentInfo[]) => void;
  setSelectedAgent: (agentId: string | null) => void;
  markHistoryRequested: (sessionId: string) => void;
  resolvePermissionRequest: (sessionId: string, toolUseId: string) => void;
  markApprovalHandled: (sessionId: string, messageId: string) => void;
  setLoadingPage: (sessionId: string, loading: boolean) => void;
  handleServerEvent: (event: ServerEvent) => void;
}

function createSession(id: string): SessionView {
  return { id, title: "", status: "idle", restMessages: [], streamMessages: [], isLoadingPage: false, permissionRequests: [], hydrated: false };
}

export const useAppStore = create<AppState>((set, get) => ({
  sessions: {},
  agents: [],
  models: [],
  selectedAgentId: null,
  activeSessionId: null,
  prompt: "",
  cwd: "",
  pendingStart: false,
  globalError: null,
  sessionsLoaded: false,
  agentsLoaded: false,
  showStartModal: false,
  historyRequested: new Set(),

  setPrompt: (prompt) => set({ prompt }),
  setCwd: (cwd) => set({ cwd }),
  setPendingStart: (pendingStart) => set({ pendingStart }),
  setGlobalError: (globalError) => set({ globalError }),
  setShowStartModal: (showStartModal) => set({ showStartModal }),
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  setAgents: (agents) => set({ agents }),
  setSelectedAgent: (selectedAgentId) => set({ selectedAgentId }),

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

  handleServerEvent: (event) => {
    const state = get();

    switch (event.type) {
      case "session.list": {
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
        break;
      }

      case "session.history": {
        const { sessionId, messages: historyMessages, status, hasPendingApproval, cursor, hasMore, append } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);

          if (append) {
            // Scroll-up: prepend older messages, dedup by uuid
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

          // Initial load: replace restMessages, clear streamMessages
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
        break;
      }

      case "session.refresh": {
        const { sessionId, messages: freshMessages, cursor, hasMore, status, hasPendingApproval } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          // Merge: keep already-loaded older pages, replace newest portion with fresh data
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
                streamMessages: [],  // Clear ephemeral stream
                cursor: cursor ?? existing.cursor,
                hasMore: hasMore ?? existing.hasMore,
                status,
                hasPendingApproval,
              }
            }
          };
        });
        break;
      }

      case "session.status": {
        const { sessionId, status, title, cwd, agentId } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                status,
                title: title ?? existing.title,
                cwd: cwd ?? existing.cwd,
                agentId: agentId ?? existing.agentId,
                updatedAt: Date.now()
              }
            }
          };
        });

        if (state.pendingStart) {
          get().setActiveSessionId(sessionId);
          set({ pendingStart: false, showStartModal: false, prompt: "" });
        }
        break;
      }

      case "session.deleted": {
        const { sessionId } = event.payload;
        const state = get();

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
        break;
      }

      case "stream.message": {
        const { sessionId, message } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          const streamMessages = [...existing.streamMessages];

          // Get message ID (uuid for SDK messages)
          const msgId = 'uuid' in message ? message.uuid : undefined;
          const msgType = message.type;

          if (msgId) {
            // Find existing message with same ID in stream messages
            const existingIdx = streamMessages.findIndex(
              (m) => 'uuid' in m && m.uuid === msgId
            );
            if (existingIdx >= 0) {
              // For streaming messages, ACCUMULATE content (SDK sends deltas)
              if (msgType === "reasoning" || msgType === "assistant") {
                const existingMsg = streamMessages[existingIdx];
                const existingContent = 'content' in existingMsg ? existingMsg.content : "";
                const newContent = 'content' in message ? message.content : "";
                streamMessages[existingIdx] = {
                  ...message,
                  content: existingContent + newContent
                } as StreamMessage;
              } else {
                // Other messages: replace
                streamMessages[existingIdx] = message;
              }
            } else {
              streamMessages.push(message);
            }
          } else if (msgType === "approval_request") {
            // Dedup by messageId — update existing or push new
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
        break;
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
        break;
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
        break;
      }

      case "runner.error": {
        set({ globalError: event.payload.message });
        break;
      }

      case "agent.list": {
        set({ agents: event.payload.agents, agentsLoaded: true });
        break;
      }

      case "agent.created": {
        set((state) => ({
          agents: [...state.agents, event.payload],
          selectedAgentId: event.payload.lettaAgentId,
        }));
        break;
      }

      case "agent.deleted": {
        const { lettaAgentId } = event.payload;
        set((state) => ({
          agents: state.agents.filter((a) => a.lettaAgentId !== lettaAgentId),
          selectedAgentId: state.selectedAgentId === lettaAgentId ? null : state.selectedAgentId,
        }));
        break;
      }

      case "agent.renamed": {
        const { lettaAgentId, name } = event.payload;
        set((state) => ({
          agents: state.agents.map((a) =>
            a.lettaAgentId === lettaAgentId ? { ...a, name } : a
          ),
        }));
        break;
      }

      case "models.list": {
        set({ models: event.payload.models });
        break;
      }
    }
  }
}));
