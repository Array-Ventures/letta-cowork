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
  messages: StreamMessage[];
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
  handleServerEvent: (event: ServerEvent) => void;
}

function createSession(id: string): SessionView {
  return { id, title: "", status: "idle", messages: [], permissionRequests: [], hydrated: false };
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
      const messages = existing.messages.map((m) =>
        m.type === "approval_request" && m.messageId === messageId
          ? { ...m, isPending: false }
          : m
      );
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...existing, messages }
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
        const { sessionId, messages: historyMessages, status, hasPendingApproval } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          // Merge: history messages first, then any existing messages (like user_prompt added during init)
          // Dedup by uuid to prevent duplicates when history overlaps with streamed messages
          const seen = new Set<string>();
          const mergedMessages = [...historyMessages, ...existing.messages].filter((m) => {
            const key = 'uuid' in m ? (m as { uuid: string }).uuid : undefined;
            if (!key) return true;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                status,
                hasPendingApproval: hasPendingApproval ?? existing.hasPendingApproval,
                messages: mergedMessages,
                hydrated: true,
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
          const messages = [...existing.messages];
          
          // Get message ID (uuid for SDK messages)
          const msgId = 'uuid' in message ? message.uuid : undefined;
          const msgType = message.type;
          
          if (msgId) {
            // Find existing message with same ID
            const existingIdx = messages.findIndex(
              (m) => 'uuid' in m && m.uuid === msgId
            );
            if (existingIdx >= 0) {
              // For streaming messages, ACCUMULATE content (SDK sends deltas)
              if (msgType === "reasoning" || msgType === "assistant") {
                const existingMsg = messages[existingIdx];
                const existingContent = 'content' in existingMsg ? existingMsg.content : "";
                const newContent = 'content' in message ? message.content : "";
                messages[existingIdx] = {
                  ...message,
                  content: existingContent + newContent
                } as StreamMessage;
              } else {
                // Other messages: replace
                messages[existingIdx] = message;
              }
            } else {
              messages.push(message);
            }
          } else if (msgType === "approval_request") {
            // Dedup by messageId — update existing or push new
            const approvalMsg = message as { type: "approval_request"; messageId: string };
            const existingIdx = messages.findIndex(
              (m) => m.type === "approval_request" && m.messageId === approvalMsg.messageId
            );
            if (existingIdx >= 0) {
              messages[existingIdx] = message;
            } else {
              messages.push(message);
            }
          } else {
            messages.push(message);
          }

          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...existing, messages }
            }
          };
        });
        break;
      }

      case "stream.user_prompt": {
        const { sessionId, prompt } = event.payload;
        set((state) => {
          const existing = state.sessions[sessionId] ?? createSession(sessionId);
          const newMessages = [...existing.messages, { type: "user_prompt" as const, prompt }];
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...existing,
                messages: newMessages
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
