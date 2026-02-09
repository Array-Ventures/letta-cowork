import { useEffect, useCallback, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../store/useAppStore";
import type { ClientEvent, FolderInfo, FileInfo } from "../types";
import { CreateFolderModal } from "./CreateFolderModal";

function StatusBadge({ status }: { status?: FileInfo["processingStatus"] }) {
  if (!status) return null;
  const config: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    completed: { bg: "bg-green-50", text: "text-green-600", dot: "bg-green-500", label: "Live" },
    pending: { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500", label: "Pending" },
    parsing: { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500", label: "Parsing" },
    embedding: { bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500", label: "Embedding" },
    error: { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500", label: "Error" },
  };
  const c = config[status] ?? config.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(fileType?: string, fileName?: string): string {
  if (fileType) {
    if (fileType.includes("pdf")) return "PDF";
    if (fileType.includes("json")) return "JSON";
    if (fileType.includes("markdown") || fileType.includes("md")) return "MD";
    if (fileType.includes("text")) return "TXT";
    return fileType.split("/").pop()?.toUpperCase() ?? "FILE";
  }
  const ext = fileName?.split(".").pop()?.toUpperCase();
  return ext ?? "FILE";
}

export function FilesView({ sendEvent }: { sendEvent: (event: ClientEvent) => void }) {
  const { folders, selectedFolderId, folderFiles, folderAgentIds, agents, embeddingModels } = useAppStore(
    useShallow((s) => ({
      folders: s.folders, selectedFolderId: s.selectedFolderId,
      folderFiles: s.folderFiles, folderAgentIds: s.folderAgentIds,
      agents: s.agents, embeddingModels: s.embeddingModels,
    }))
  );
  const setSelectedFolder = useAppStore((s) => s.setSelectedFolder);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showAttachDropdown, setShowAttachDropdown] = useState(false);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  // Fetch folders on mount
  useEffect(() => {
    sendEvent({ type: "folder.list" });
  }, [sendEvent]);

  // Fetch files + agents when folder selected
  useEffect(() => {
    if (selectedFolderId) {
      sendEvent({ type: "folder.files", payload: { folderId: selectedFolderId } });
      sendEvent({ type: "folder.agents", payload: { folderId: selectedFolderId } });
    }
  }, [selectedFolderId, sendEvent]);

  const handleSelectFolder = useCallback((folderId: string) => {
    setSelectedFolder(folderId);
  }, [setSelectedFolder]);

  const handleCreateFolder = useCallback((name: string, opts?: { description?: string; instructions?: string; embedding?: string }) => {
    sendEvent({ type: "folder.create", payload: { name, description: opts?.description, instructions: opts?.instructions, embedding: opts?.embedding } });
    setShowCreateFolder(false);
  }, [sendEvent]);

  const handleDeleteFolder = useCallback((folderId: string) => {
    sendEvent({ type: "folder.delete", payload: { folderId } });
  }, [sendEvent]);

  const handleUpload = useCallback(async () => {
    if (!selectedFolderId) return;
    const filePath = await window.electron.selectFile();
    if (filePath) {
      sendEvent({ type: "folder.upload", payload: { folderId: selectedFolderId, filePath } });
    }
  }, [selectedFolderId, sendEvent]);

  const handleDeleteFile = useCallback((fileId: string) => {
    if (!selectedFolderId) return;
    sendEvent({ type: "folder.file.delete", payload: { folderId: selectedFolderId, fileId } });
  }, [selectedFolderId, sendEvent]);

  const handleAttachAgent = useCallback((agentId: string) => {
    if (!selectedFolderId) return;
    sendEvent({ type: "folder.attach", payload: { folderId: selectedFolderId, agentId } });
    setShowAttachDropdown(false);
  }, [selectedFolderId, sendEvent]);

  const handleDetachAgent = useCallback((agentId: string) => {
    if (!selectedFolderId) return;
    sendEvent({ type: "folder.detach", payload: { folderId: selectedFolderId, agentId } });
  }, [selectedFolderId, sendEvent]);

  const openCreateFolderModal = useCallback(() => {
    setShowCreateFolder(true);
    sendEvent({ type: "embedding_models.list" });
  }, [sendEvent]);

  const attachableAgents = agents.filter((a) => !folderAgentIds.includes(a.lettaAgentId));

  return (
    <main className="flex flex-1 ml-[280px] h-screen">
      {/* Folder Pane */}
      <div className="flex w-[280px] flex-col border-r border-border bg-surface">
        {/* Header */}
        <div
          className="flex items-center h-12 px-4 border-b border-border"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <span className="flex-1 text-[15px] font-semibold text-ink-900">Folders</span>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-tertiary text-ink-700 hover:bg-ink-900/10 transition-colors"
            onClick={openCreateFolderModal}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            aria-label="Create folder"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5V19M5 12H19" /></svg>
          </button>
        </div>

        {/* Folder List */}
        <div className="flex-1 overflow-y-auto p-2">
          {folders.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted">
              No folders yet. Create one to get started.
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {folders.map((folder) => (
                <FolderItem
                  key={folder.id}
                  folder={folder}
                  isActive={folder.id === selectedFolderId}
                  onClick={() => handleSelectFolder(folder.id)}
                  onDelete={() => handleDeleteFolder(folder.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* File Pane */}
      <div className="flex flex-1 flex-col bg-surface-cream">
        {selectedFolder ? (
          <>
            {/* File Header */}
            <div
              className="flex items-center gap-3 h-12 px-5 border-b border-border bg-surface-cream"
              style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
              </svg>
              <div className="flex-1 min-w-0">
                <span className="text-[15px] font-semibold text-ink-900">{selectedFolder.name}</span>
                {selectedFolder.description && (
                  <span className="ml-2 text-xs text-muted">{selectedFolder.description}</span>
                )}
              </div>
              <button
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accent/90 transition-colors"
                onClick={handleUpload}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload
              </button>
            </div>

            {/* Instructions Banner */}
            {selectedFolder.instructions && (
              <div className="flex items-start gap-2 px-5 py-2.5 bg-accent-subtle/50 border-b border-border">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                </svg>
                <span className="text-[12px] text-accent leading-relaxed">{selectedFolder.instructions}</span>
              </div>
            )}

            {/* Table Header */}
            <div className="flex items-center h-9 px-5 bg-surface-tertiary/50 border-b border-border text-[11px] font-semibold text-muted uppercase tracking-wider">
              <span className="flex-1">Name</span>
              <span className="w-16 text-center">Type</span>
              <span className="w-20 text-center">Status</span>
              <span className="w-16 text-right">Size</span>
              <span className="w-8" />
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto">
              {folderFiles.length === 0 ? (
                <div className="px-5 py-12 text-center text-xs text-muted">
                  No files in this folder. Upload one to get started.
                </div>
              ) : (
                folderFiles.map((file) => (
                  <FileRow key={file.id} file={file} onDelete={() => handleDeleteFile(file.id)} />
                ))
              )}
            </div>

            {/* Attached Agents Panel */}
            <div className="border-t border-border bg-surface-tertiary/30 px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span className="flex-1 text-[13px] font-semibold text-ink-900">Attached Agents</span>
                <div className="relative">
                  <button
                    className="flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
                    onClick={() => setShowAttachDropdown(!showAttachDropdown)}
                    disabled={attachableAgents.length === 0}
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5V19M5 12H19" /></svg>
                    Attach
                  </button>
                  {showAttachDropdown && attachableAgents.length > 0 && (
                    <div className="absolute right-0 bottom-full mb-1 z-50 min-w-[180px] rounded-xl border border-border bg-surface p-1 shadow-lg">
                      {attachableAgents.map((agent) => (
                        <button
                          key={agent.lettaAgentId}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-ink-700 hover:bg-surface-tertiary transition-colors"
                          onClick={() => handleAttachAgent(agent.lettaAgentId)}
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: agent.color }}
                          />
                          {agent.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {folderAgentIds.length === 0 ? (
                <div className="text-[11px] text-muted">No agents attached to this folder.</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {folderAgentIds.map((agentId) => {
                    const agent = agents.find((a) => a.lettaAgentId === agentId);
                    return (
                      <div key={agentId} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: agent?.color ?? "#888" }}
                        />
                        <span className="flex-1 text-[13px] font-medium text-ink-900">{agent?.name ?? agentId}</span>
                        <span className="text-[11px] text-muted">3 tools attached</span>
                        <button
                          className="text-muted hover:text-error transition-colors"
                          onClick={() => handleDetachAgent(agentId)}
                          aria-label="Detach agent"
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div
              className="h-12"
              style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
            />
            <div className="text-center">
              <svg viewBox="0 0 24 24" className="mx-auto mb-3 h-10 w-10 text-muted/40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
              </svg>
              <p className="text-sm text-muted">Select a folder to view its files</p>
            </div>
          </div>
        )}
      </div>

      {showCreateFolder && (
        <CreateFolderModal
          onClose={() => setShowCreateFolder(false)}
          onCreate={handleCreateFolder}
          embeddingModels={embeddingModels}
        />
      )}
    </main>
  );
}

function FolderItem({
  folder,
  isActive,
  onClick,
  onDelete,
}: {
  folder: FolderInfo;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  return (
    <button
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors ${
        isActive ? "bg-accent-subtle" : "hover:bg-surface-tertiary"
      }`}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" className={`h-4 w-4 flex-shrink-0 ${isActive ? "text-accent" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      </svg>
      <div className="flex-1 min-w-0">
        <div className={`text-[13px] truncate ${isActive ? "font-semibold text-accent" : "font-medium text-ink-800"}`}>
          {folder.name}
        </div>
        {(folder.description || folder.instructions) && (
          <div className="text-[11px] text-muted truncate">{folder.description || folder.instructions}</div>
        )}
      </div>
      <button
        className="flex-shrink-0 rounded-full p-1 text-muted opacity-0 group-hover:opacity-100 hover:text-error hover:bg-error/10 transition-colors"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label="Delete folder"
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9l1-12" />
        </svg>
      </button>
    </button>
  );
}

function FileRow({ file, onDelete }: { file: FileInfo; onDelete: () => void }) {
  return (
    <div className="flex items-center h-12 px-5 border-b border-ink-900/5 hover:bg-surface-tertiary/30 transition-colors group">
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <svg viewBox="0 0 24 24" className="h-4 w-4 flex-shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </svg>
        <div className="min-w-0">
          <span className="text-[13px] font-medium text-ink-800 truncate block">{file.fileName}</span>
          {file.processingStatus === "error" && file.errorMessage && (
            <span className="text-[10px] text-error truncate block">{file.errorMessage}</span>
          )}
        </div>
      </div>
      <span className="w-16 text-center text-xs text-muted">{fileTypeLabel(file.fileType, file.fileName)}</span>
      <span className="w-20 text-center"><StatusBadge status={file.processingStatus} /></span>
      <span className="w-16 text-right text-xs text-muted">{formatFileSize(file.fileSize)}</span>
      <button
        className="w-8 flex items-center justify-center text-muted hover:text-error transition-colors"
        onClick={onDelete}
        aria-label="Delete file"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </button>
    </div>
  );
}
