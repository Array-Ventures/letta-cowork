import { useEffect, useState } from "react";
import type { ModelInfo } from "../types";
import { AgentIcon } from "./Sidebar";

const APP_ICONS = [
  { name: "clipboard-list", label: "List" },
  { name: "database", label: "Database" },
  { name: "file-code", label: "Code" },
  { name: "terminal", label: "Terminal" },
  { name: "bot", label: "Bot" },
];

const AGENT_COLORS = [
  "#3B28CC",
  "#16A34A",
  "#0D9488",
  "#7C3AED",
  "#EA580C",
  "#DB2777",
  "#A78BFA",
];

interface CreateAppModalProps {
  onClose: () => void;
  onCreate: (name: string, icon: string, agentIcon: string, agentColor: string, model?: string) => void;
  models: ModelInfo[];
  loadingModels: boolean;
}

export function CreateAppModal({ onClose, onCreate, models, loadingModels }: CreateAppModalProps) {
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(APP_ICONS[0].name);
  const [selectedAgentColor, setSelectedAgentColor] = useState(AGENT_COLORS[0]);
  const [selectedModel, setSelectedModel] = useState("");

  // Auto-select first model when loaded
  useEffect(() => {
    if (models.length > 0 && !selectedModel) {
      queueMicrotask(() => setSelectedModel(models[0].handle));
    }
  }, [models, selectedModel]);

  const handleCreate = () => {
    if (!name.trim()) return;
    // Use the same icon for both app and agent
    onCreate(name.trim(), selectedIcon, selectedIcon, selectedAgentColor, selectedModel || undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/20 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-ink-900/5 bg-surface p-6 shadow-elevated">
        <div className="flex items-center justify-between">
          <div className="text-xl font-semibold text-ink-900">Create New App</div>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-tertiary text-muted hover:text-ink-700 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-muted">
          Create a new app with a skeleton page and a dedicated maintainer agent.
        </p>

        <div className="mt-5 grid gap-4">
          {/* App Name */}
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted">App Name</span>
            <input
              className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
              placeholder="My Dashboard"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </label>

          {/* Model Picker */}
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-muted">Model</span>
            {loadingModels ? (
              <div className="flex items-center gap-2 rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-muted">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Loading models...
              </div>
            ) : models.length === 0 ? (
              <div className="rounded-xl border border-error/20 bg-error-light px-4 py-2.5 text-sm text-error">
                No models available. Check your Letta server configuration.
              </div>
            ) : (
              <select
                className="rounded-xl border border-ink-900/10 bg-surface-secondary px-4 py-2.5 text-sm text-ink-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20 transition-colors"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {models.map((model) => (
                  <option key={model.handle} value={model.handle}>
                    {model.display_name || model.name} ({model.provider_type})
                  </option>
                ))}
              </select>
            )}
          </label>

          {/* Icon Picker */}
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted">App Icon</span>
            <div className="flex gap-2">
              {APP_ICONS.map((icon) => (
                <button
                  key={icon.name}
                  type="button"
                  onClick={() => setSelectedIcon(icon.name)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                    selectedIcon === icon.name
                      ? "bg-accent text-white"
                      : "bg-surface-secondary text-ink-600 hover:bg-surface-tertiary"
                  }`}
                  title={icon.label}
                >
                  <AgentIcon name={icon.name} className="h-5 w-5" />
                </button>
              ))}
            </div>
          </div>

          {/* Agent Color Picker */}
          <div className="grid gap-1.5">
            <span className="text-xs font-medium text-muted">Agent Color</span>
            <div className="flex gap-2.5">
              {AGENT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedAgentColor(color)}
                  className={`h-8 w-8 rounded-full transition-all ${
                    selectedAgentColor === color ? "ring-2 ring-offset-2 ring-ink-400 scale-110" : "hover:scale-105"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Create Button */}
          <button
            className="mt-2 flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-white shadow-soft hover:bg-accent-hover transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleCreate}
            disabled={!name.trim() || (!loadingModels && models.length === 0)}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5V19M5 12H19" />
            </svg>
            Create App
          </button>
        </div>
      </div>
    </div>
  );
}
