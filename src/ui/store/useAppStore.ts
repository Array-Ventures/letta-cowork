import { create } from "zustand";
import type { ServerEvent } from "../types";

import { createConfigSlice, handleConfigEvent, type ConfigSlice } from "./slices/configSlice";
import { createSessionSlice, handleSessionEvent, type SessionSlice } from "./slices/sessionSlice";
import { createAgentSlice, handleAgentEvent, type AgentSlice } from "./slices/agentSlice";
import { createArtifactSlice, handleArtifactEvent, type ArtifactSlice } from "./slices/artifactSlice";
import { createFolderSlice, handleFolderEvent, type FolderSlice } from "./slices/folderSlice";
import { createUISlice, handleUIEvent, type UISlice } from "./slices/uiSlice";

// Re-export types used by components
export type { SessionView, PermissionRequest } from "./slices/sessionSlice";
export type { OnboardingData } from "./slices/configSlice";

export type AppState = ConfigSlice &
  SessionSlice &
  AgentSlice &
  ArtifactSlice &
  FolderSlice &
  UISlice & {
    handleServerEvent: (event: ServerEvent) => void;
  };

export const useAppStore = create<AppState>()((...a) => {
  const [set, get] = a;

  return {
    ...createConfigSlice(...a),
    ...createSessionSlice(...a),
    ...createAgentSlice(...a),
    ...createArtifactSlice(...a),
    ...createFolderSlice(...a),
    ...createUISlice(...a),

    handleServerEvent: (event: ServerEvent) => {
      // Dispatch to slice handlers — first match wins
      if (handleConfigEvent(event, set)) return;
      if (handleSessionEvent(event, set, get)) return;
      if (handleAgentEvent(event, set)) return;
      if (handleArtifactEvent(event, set)) return;
      if (handleFolderEvent(event, set, get)) return;
      if (handleUIEvent(event, set)) return;
    },
  };
});
