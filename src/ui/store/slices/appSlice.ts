import type { StateCreator } from "zustand";
import type { AppServerStatus, ServerEvent } from "../../types";
import type { AppState } from "../useAppStore";

export interface AppSlice {
  appStatuses: Record<string, { status: AppServerStatus; previewUrl?: string; error?: string }>;
}

export const createAppSlice: StateCreator<AppState, [], [], AppSlice> = () => ({
  appStatuses: {},
});

export function handleAppEvent(event: ServerEvent, set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void): boolean {
  switch (event.type) {
    case "app.status": {
      const { agentId, status, previewUrl, error } = event.payload;
      set((state) => ({
        appStatuses: {
          ...state.appStatuses,
          [agentId]: { status, previewUrl, error },
        },
      }));
      return true;
    }

    default:
      return false;
  }
}
