import type { StateCreator } from "zustand";
import type { ArtifactInfo, ServerEvent } from "../../types";
import type { AppState } from "../useAppStore";

export interface ArtifactSlice {
  artifacts: ArtifactInfo[];
  artifactReloadCounter: number;
}

export const createArtifactSlice: StateCreator<AppState, [], [], ArtifactSlice> = () => ({
  artifacts: [],
  artifactReloadCounter: 0,
});

export function handleArtifactEvent(event: ServerEvent, set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void): boolean {
  switch (event.type) {
    case "artifacts.list": {
      set({ artifacts: event.payload.artifacts });
      return true;
    }

    case "artifact.created": {
      set((state) => ({
        artifacts: [...state.artifacts, event.payload.artifact],
        activeView: { type: "artifact", artifactId: event.payload.artifact.id, agentId: event.payload.artifact.agentId },
      }));
      return true;
    }

    case "artifact.reload": {
      set((state) => ({
        artifactReloadCounter: state.artifactReloadCounter + 1,
      }));
      return true;
    }

    default:
      return false;
  }
}
