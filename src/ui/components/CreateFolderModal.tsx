import { useState } from "react";
import type { EmbeddingModelInfo } from "../types";

interface CreateFolderModalProps {
  onClose: () => void;
  onCreate: (name: string, opts?: { description?: string; instructions?: string; embedding?: string }) => void;
  embeddingModels: EmbeddingModelInfo[];
}

export function CreateFolderModal({ onClose, onCreate, embeddingModels }: CreateFolderModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [embedding, setEmbedding] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), {
      description: description.trim() || undefined,
      instructions: instructions.trim() || undefined,
      embedding: embedding || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-[440px] rounded-2xl border border-border bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center h-14 px-6 border-b border-border">
          <span className="flex-1 text-[17px] font-semibold text-ink-900">Create Folder</span>
          <button
            className="rounded-full p-1 text-muted hover:text-ink-700 hover:bg-surface-tertiary transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-700">Folder Name</label>
            <input
              type="text"
              className="h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-ink-900 placeholder:text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
              placeholder="e.g. Project Documentation"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-700">Description</label>
            <input
              type="text"
              className="h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-ink-900 placeholder:text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors"
              placeholder="Optional description for this folder"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-700">Instructions</label>
            <textarea
              className="min-h-[72px] rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-ink-900 placeholder:text-muted outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors resize-y"
              placeholder="Instructions for how agents should use this folder's contents"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
            <span className="text-[11px] text-muted">Tells agents how to interpret and use files in this folder</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-ink-700">Embedding Model</label>
            <select
              className="h-10 rounded-lg border border-border bg-surface px-3 text-[13px] text-ink-900 outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-colors appearance-none"
              value={embedding}
              onChange={(e) => setEmbedding(e.target.value)}
            >
              <option value="">Default</option>
              {embeddingModels.map((m) => (
                <option key={m.handle} value={m.handle}>
                  {m.handle || m.name}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-muted">Used for embedding uploaded files into vector storage</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 h-16 px-6 border-t border-border">
          <button
            className="rounded-lg border border-border px-5 py-2 text-[13px] font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg bg-accent px-5 py-2 text-[13px] font-semibold text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            onClick={handleSubmit}
            disabled={!name.trim()}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 10v6" /><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /><path d="M9 16h6" />
            </svg>
            Create Folder
          </button>
        </div>
      </div>
    </div>
  );
}
