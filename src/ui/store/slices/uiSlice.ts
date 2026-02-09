import type { StateCreator } from "zustand";
import type { ActiveView, ServerEvent } from "../../types";
import type { AppState } from "../useAppStore";

export interface UISlice {
  activeView: ActiveView;
  prompt: string;
  cwd: string;
  pendingStart: boolean;
  globalError: string | null;
  sessionMode: "local" | "cloud";

  setActiveView: (view: ActiveView) => void;
  setPrompt: (prompt: string) => void;
  setCwd: (cwd: string) => void;
  setSessionMode: (mode: "local" | "cloud") => void;
  setPendingStart: (pending: boolean) => void;
  setGlobalError: (error: string | null) => void;
}

export const createUISlice: StateCreator<AppState, [], [], UISlice> = (set, get) => ({
  activeView: { type: "home" } as ActiveView,
  prompt: "",
  cwd: "",
  pendingStart: false,
  globalError: null,
  sessionMode: "cloud",

  setActiveView: (activeView) => {
    if (activeView.type === "artifact" && activeView.agentId) {
      const sessions = Object.values(get().sessions);
      const agentSessions = sessions
        .filter((s) => s.agentId === activeView.agentId)
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
      set({ activeView, artifactSessionId: agentSessions[0]?.id ?? null });
    } else {
      set({ activeView, artifactSessionId: null });
    }
  },

  setPrompt: (prompt) => set({ prompt }),
  setCwd: (cwd) => set({ cwd }),
  setSessionMode: (sessionMode) => set({ sessionMode }),
  setPendingStart: (pendingStart) => set({ pendingStart }),
  setGlobalError: (globalError) => set({ globalError }),
});

export function handleUIEvent(event: ServerEvent, set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void): boolean {
  switch (event.type) {
    case "runner.error": {
      set({ globalError: event.payload.message });
      return true;
    }
    default:
      return false;
  }
}
