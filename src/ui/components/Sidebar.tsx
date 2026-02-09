import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../store/useAppStore";
import type { AgentInfo } from "../types";

interface SidebarProps {
  connected: boolean;
  onNewAgent: () => void;
  onNewApp: () => void;
  onSettings?: () => void;
}

export function Sidebar({
  onNewAgent,
  onNewApp,
  onSettings,
}: SidebarProps) {
  const { sessions, agents, selectedAgentId, activeView, artifacts, currentConfig } = useAppStore(
    useShallow((s) => ({
      sessions: s.sessions, agents: s.agents, selectedAgentId: s.selectedAgentId,
      activeView: s.activeView, artifacts: s.artifacts, currentConfig: s.currentConfig,
    }))
  );
  const setSelectedAgent = useAppStore((s) => s.setSelectedAgent);
  const setActiveSessionId = useAppStore((s) => s.setActiveSessionId);
  const setActiveView = useAppStore((s) => s.setActiveView);

  const sessionList = useMemo(() => {
    const list = Object.values(sessions);
    list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return list;
  }, [sessions]);

  // Auto-select first agent if none selected
  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) {
      setSelectedAgent(agents[0].lettaAgentId);
    }
  }, [agents, selectedAgentId, setSelectedAgent]);

  const handleAgentClick = (agentId: string) => {
    setSelectedAgent(agentId);
    // Auto-select the most recent session for this agent
    const agentSessions = sessionList.filter((s) => s.agentId === agentId);
    if (agentSessions.length > 0) {
      setActiveSessionId(agentSessions[0].id);
    } else {
      setActiveView({ type: "chat" });
    }
  };

  const isHomeActive = activeView.type === "home";
  const isFilesActive = activeView.type === "files";

  return (
    <aside className="fixed inset-y-0 left-0 flex h-full w-[280px] flex-col gap-4 border-r border-border bg-sidebar px-4 pb-4 pt-5">
      <div
        className="absolute top-0 left-0 right-0 h-12"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Org & User */}
      <div className="flex items-center gap-2.5 pb-4 pt-7">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent flex-shrink-0">
          <span className="text-sm font-bold text-white">
            {(currentConfig?.organization.name ?? "L")[0].toUpperCase()}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-semibold text-ink-900 truncate">
            {currentConfig?.organization.name ?? "Letta Cowork"}
          </span>
          {currentConfig?.identity.name && (
            <span className="text-[11px] text-muted truncate">{currentConfig.identity.name}</span>
          )}
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex flex-col gap-1">
        <button
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
            isHomeActive ? "bg-accent-subtle font-medium text-accent" : "text-ink-700 hover:bg-surface-tertiary"
          }`}
          onClick={() => setActiveView({ type: "home" })}
        >
          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${isHomeActive ? "text-accent" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
            <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          Home
        </button>
        <button
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
            isFilesActive ? "bg-accent-subtle font-medium text-accent" : "text-ink-700 hover:bg-surface-tertiary"
          }`}
          onClick={() => setActiveView({ type: "files" })}
        >
          <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${isFilesActive ? "text-accent" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
          </svg>
          Files
        </button>
      </nav>

      {/* Agents Section */}
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-light">Agents</span>
        <button
          className="flex h-5 w-5 items-center justify-center rounded-md text-muted hover:text-ink-700 hover:bg-surface-tertiary transition-colors"
          onClick={onNewAgent}
          aria-label="Add agent"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V19M5 12H19" />
          </svg>
        </button>
      </div>

      {/* Agent List */}
      <div className="flex flex-col gap-2 overflow-y-auto -mt-2">
        {agents.length === 0 && (
          <div className="rounded-xl border border-ink-900/5 bg-surface px-4 py-5 text-center text-xs text-muted">
            No agents yet. Create one to get started.
          </div>
        )}

        {agents.filter((a) => !artifacts.some((art) => art.agentId === a.lettaAgentId)).map((agent) => {
          const agentSessions = sessionList.filter((s) => s.agentId === agent.lettaAgentId);
          return (
            <AgentCard
              key={agent.lettaAgentId}
              agent={agent}
              sessionCount={agentSessions.length}
              isSelected={selectedAgentId === agent.lettaAgentId}
              onClick={() => handleAgentClick(agent.lettaAgentId)}
            />
          );
        })}
      </div>

      {/* Apps */}
      <div className="mt-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-light">Apps</span>
          <button
            className="flex h-5 w-5 items-center justify-center rounded-md text-muted hover:text-ink-700 hover:bg-surface-tertiary transition-colors"
            onClick={onNewApp}
            aria-label="Add app"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5V19M5 12H19" />
            </svg>
          </button>
        </div>
        {artifacts.map((artifact) => {
          const isActive = activeView.type === "artifact" && activeView.artifactId === artifact.id;
          return (
            <button
              key={artifact.id}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                isActive ? "bg-accent-subtle font-medium text-ink-800" : "text-ink-700 hover:bg-surface-tertiary"
              }`}
              onClick={() => setActiveView({ type: "artifact", artifactId: artifact.id, agentId: artifact.agentId })}
            >
              <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? "text-accent" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                <path d="M9 14h6" />
                <path d="M9 18h6" />
                <path d="M9 10h6" />
              </svg>
              {artifact.name}
            </button>
          );
        })}
      </div>

      {/* Settings */}
      <div className="mt-auto pt-2 border-t border-border">
        <button
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-ink-700 hover:bg-surface-tertiary transition-colors"
          onClick={onSettings}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Settings
        </button>
      </div>

    </aside>
  );
}

// --- Sub-components ---

function AgentCard({
  agent,
  sessionCount,
  isSelected,
  onClick,
}: {
  agent: AgentInfo;
  sessionCount: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        isSelected
          ? "border-accent/40 bg-accent-subtle"
          : "border-ink-900/10 bg-surface hover:bg-surface-tertiary"
      }`}
      onClick={onClick}
    >
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: agent.color }}
      >
        <AgentIcon name={agent.icon} className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-[13px] font-semibold truncate ${isSelected ? "text-accent" : "text-ink-800"}`}>
            {agent.name}
          </span>
        </div>
        <div className={`flex items-center gap-1.5 text-[11px] ${isSelected ? "text-accent/70" : "text-muted"}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${isSelected ? "bg-success" : "bg-muted"}`} />
          {sessionCount} {sessionCount === 1 ? "session" : "sessions"}
        </div>
      </div>
    </button>
  );
}

// Lucide icon component matching the design system
export function AgentIcon({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, React.ReactNode> = {
    bot: <>
      <path d="M12 8V4H8" />
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </>,
    "file-code": <>
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8l6 6v12a2 2 0 0 1-2 2z" />
      <path d="M14 2v5a1 1 0 0 0 1 1h5" />
      <path d="M10 12.5 8 15l2 2.5" />
      <path d="m14 12.5 2 2.5-2 2.5" />
    </>,
    bug: <>
      <path d="M12 20v-9" />
      <path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z" />
      <path d="m14.12 3.88L16 2" />
      <path d="M21 21a4 4 0 0 0-3.81-4" />
      <path d="M21 5a4 4 0 0 1-3.55 3.97" />
      <path d="M22 13h-4" />
      <path d="M3 21a4 4 0 0 1 3.81-4" />
      <path d="M3 5a4 4 0 0 0 3.55 3.97" />
      <path d="M6 13H2" />
      <path d="m8 2 1.88 1.88" />
      <path d="M9 7.13V6a3 3 0 1 1 6 0v1.13" />
    </>,
    database: <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </>,
    terminal: <>
      <path d="m4 17 6-6-6-6" />
      <path d="M12 19h8" />
    </>,
    "clipboard-list": <>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </>,
    "square-check-big": <>
      <path d="M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5" />
      <path d="m9 11 3 3L22 4" />
    </>,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || icons.bot}
    </svg>
  );
}
