import type { StateCreator } from "zustand";
import type { FolderInfo, FileInfo, EmbeddingModelInfo, ServerEvent } from "../../types";
import type { AppState } from "../useAppStore";

export interface FolderSlice {
  folders: FolderInfo[];
  selectedFolderId: string | null;
  folderFiles: FileInfo[];
  folderAgentIds: string[];
  embeddingModels: EmbeddingModelInfo[];

  setSelectedFolder: (folderId: string | null) => void;
}

export const createFolderSlice: StateCreator<AppState, [], [], FolderSlice> = (set) => ({
  folders: [],
  selectedFolderId: null,
  folderFiles: [],
  folderAgentIds: [],
  embeddingModels: [],

  setSelectedFolder: (selectedFolderId) => set({ selectedFolderId, folderFiles: [], folderAgentIds: [] }),
});

export function handleFolderEvent(
  event: ServerEvent,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  get: () => AppState,
): boolean {
  const state = get();

  switch (event.type) {
    case "folder.list": {
      set({ folders: event.payload.folders });
      return true;
    }

    case "folder.created": {
      set((state) => ({
        folders: [...state.folders, event.payload],
        selectedFolderId: event.payload.id,
        folderFiles: [],
        folderAgentIds: [],
      }));
      return true;
    }

    case "folder.updated": {
      set((state) => ({
        folders: state.folders.map((f) =>
          f.id === event.payload.id ? event.payload : f
        ),
      }));
      return true;
    }

    case "folder.deleted": {
      const { folderId } = event.payload;
      set((state) => ({
        folders: state.folders.filter((f) => f.id !== folderId),
        selectedFolderId: state.selectedFolderId === folderId ? null : state.selectedFolderId,
        folderFiles: state.selectedFolderId === folderId ? [] : state.folderFiles,
        folderAgentIds: state.selectedFolderId === folderId ? [] : state.folderAgentIds,
      }));
      return true;
    }

    case "folder.files": {
      if (event.payload.folderId === state.selectedFolderId) {
        set({ folderFiles: event.payload.files });
      }
      return true;
    }

    case "folder.file.uploaded": {
      if (event.payload.folderId === state.selectedFolderId) {
        set((state) => ({
          folderFiles: [...state.folderFiles, event.payload.file],
        }));
      }
      return true;
    }

    case "folder.file.deleted": {
      if (event.payload.folderId === state.selectedFolderId) {
        set((state) => ({
          folderFiles: state.folderFiles.filter((f) => f.id !== event.payload.fileId),
        }));
      }
      return true;
    }

    case "folder.agents": {
      if (event.payload.folderId === state.selectedFolderId) {
        set({ folderAgentIds: event.payload.agentIds });
      }
      return true;
    }

    case "folder.attached": {
      if (event.payload.folderId === state.selectedFolderId) {
        set((state) => ({
          folderAgentIds: [...state.folderAgentIds, event.payload.agentId],
        }));
      }
      return true;
    }

    case "folder.detached": {
      if (event.payload.folderId === state.selectedFolderId) {
        set((state) => ({
          folderAgentIds: state.folderAgentIds.filter((id) => id !== event.payload.agentId),
        }));
      }
      return true;
    }

    case "embedding_models.list": {
      set({ embeddingModels: event.payload.models });
      return true;
    }

    default:
      return false;
  }
}
