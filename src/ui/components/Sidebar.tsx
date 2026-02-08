import { useEffect, useMemo, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { useAppStore, type SessionView } from "../store/useAppStore";
import type { AgentInfo, SessionStatus } from "../types";

interface SidebarProps {
  connected: boolean;
  onNewSession: () => void;
  onNewAgent: () => void;
  onNewApp: () => void;
  onDeleteSession: (sessionId: string) => void;
}

export function Sidebar({
  onNewSession,
  onNewAgent,
  onNewApp,
  onDeleteSession,
}: SidebarProps) {
  const sessions = useAppStore((state) => state.sessions);
  const agents = useAppStore((state) => state.agents);
  const selectedAgentId = useAppStore((state) => state.selectedAgentId);
  const setSelectedAgent = useAppStore((state) => state.setSelectedAgent);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const setActiveSessionId = useAppStore((state) => state.setActiveSessionId);
  const activeView = useAppStore((state) => state.activeView);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const artifacts = useAppStore((state) => state.artifacts);
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

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

  useEffect(() => {
    queueMicrotask(() => setCopied(false));
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, [resumeSessionId]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  const handleCopyCommand = async () => {
    if (!resumeSessionId) return;
    const command = `letta --conv ${resumeSessionId}`;
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      return;
    }
    setCopied(true);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setResumeSessionId(null);
    }, 3000);
  };

  const sessionsForAgent = (agentId: string): SessionView[] =>
    sessionList.filter((s) => s.agentId === agentId);

  // Sessions with no agent assigned (legacy / fallback)
  const unassignedSessions = sessionList.filter((s) => !s.agentId);

  const isHomeActive = activeView.type === "home";

  return (
    <aside className="fixed inset-y-0 left-0 flex h-full w-[280px] flex-col gap-4 border-r border-border bg-sidebar px-4 pb-4 pt-5">
      <div
        className="absolute top-0 left-0 right-0 h-12"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      />

      {/* Org Logo */}
      <div className="flex items-center gap-2 pb-4 pt-7">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent">
          <span className="text-sm font-bold text-white">L</span>
        </div>
        <span className="text-[15px] font-semibold text-ink-900">Array Ventures</span>
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
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-ink-700 hover:bg-surface-tertiary transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          Library
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
        {agents.length === 0 && unassignedSessions.length === 0 && (
          <div className="rounded-xl border border-ink-900/5 bg-surface px-4 py-5 text-center text-xs text-muted">
            No agents yet. Create one to get started.
          </div>
        )}

        {agents.filter((a) => !artifacts.some((art) => art.agentId === a.lettaAgentId)).map((agent) => {
          const isSelected = selectedAgentId === agent.lettaAgentId;
          const agentSessions = sessionsForAgent(agent.lettaAgentId);

          return isSelected ? (
            <ExpandedAgentCard
              key={agent.lettaAgentId}
              agent={agent}
              sessions={agentSessions}
              activeSessionId={activeSessionId}
              onSessionClick={setActiveSessionId}
              onNewSession={onNewSession}
              onDeleteSession={onDeleteSession}
              onResumeSession={setResumeSessionId}
            />
          ) : (
            <CollapsedAgentCard
              key={agent.lettaAgentId}
              agent={agent}
              sessionCount={agentSessions.length}
              onClick={() => setSelectedAgent(agent.lettaAgentId)}
            />
          );
        })}

        {/* Legacy sessions without agents */}
        {unassignedSessions.length > 0 && (
          <div className="mt-2">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-light">
              Unassigned Sessions
            </div>
            {unassignedSessions.map((session) => (
              <SessionItem
                key={session.id}
                title={session.title}
                isActive={activeSessionId === session.id}
                status={session.status}
                hasPendingApproval={session.hasPendingApproval || [...session.restMessages, ...session.streamMessages].some(
                  (m) => m.type === "approval_request" && m.isPending
                )}
                onClick={() => setActiveSessionId(session.id)}
                onDelete={() => onDeleteSession(session.id)}
                onResume={() => setResumeSessionId(session.id)}
              />
            ))}
          </div>
        )}
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

      {/* Resume Dialog */}
      <Dialog.Root open={!!resumeSessionId} onOpenChange={(open) => !open && setResumeSessionId(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-ink-900/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-lg font-semibold text-ink-800">Resume</Dialog.Title>
              <Dialog.Close asChild>
                <button className="rounded-full p-1 text-ink-500 hover:bg-ink-900/10" aria-label="Close dialog">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-ink-900/10 bg-surface px-3 py-2 font-mono text-xs text-ink-700">
              <span className="flex-1 break-all">{resumeSessionId ? `letta --conv ${resumeSessionId}` : ""}</span>
              <button className="rounded-lg p-1.5 text-ink-600 hover:bg-ink-900/10" onClick={handleCopyCommand} aria-label="Copy resume command">
                {copied ? (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l4 4L19 6" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </aside>
  );
}

// --- Sub-components ---

function ExpandedAgentCard({
  agent,
  sessions,
  activeSessionId,
  onSessionClick,
  onNewSession,
  onDeleteSession,
  onResumeSession,
}: {
  agent: AgentInfo;
  sessions: SessionView[];
  activeSessionId: string | null;
  onSessionClick: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  onResumeSession: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border border-accent/40 bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 bg-accent-subtle px-3 py-2.5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ backgroundColor: agent.color }}
        >
          <AgentIcon name={agent.icon} className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-accent truncate">{agent.name}</span>
            {agent.type === "cloud" && (
              <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">Cloud</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-success">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
            Active
          </div>
        </div>
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9L12 15L18 9" />
        </svg>
      </div>

      {/* Sessions */}
      <div className="flex flex-col gap-1 p-2">
        {sessions.map((session) => (
          <SessionItem
            key={session.id}
            title={session.title}
            isActive={activeSessionId === session.id}
            status={session.status}
            hasPendingApproval={session.hasPendingApproval || [...session.restMessages, ...session.streamMessages].some(
              (m) => m.type === "approval_request" && m.isPending
            )}
            onClick={() => onSessionClick(session.id)}
            onDelete={() => onDeleteSession(session.id)}
            onResume={() => onResumeSession(session.id)}
          />
        ))}
        <button
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-muted hover:bg-surface-tertiary transition-colors"
          onClick={onNewSession}
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5V19M5 12H19" />
          </svg>
          New Session
        </button>
      </div>
    </div>
  );
}

function CollapsedAgentCard({
  agent,
  sessionCount,
  onClick,
}: {
  agent: AgentInfo;
  sessionCount: number;
  onClick: () => void;
}) {
  return (
    <button
      className="flex items-center gap-2.5 rounded-xl border border-ink-900/10 bg-surface px-3 py-2.5 text-left hover:bg-surface-tertiary transition-colors"
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
          <span className="text-[13px] font-semibold text-ink-800 truncate">{agent.name}</span>
          {agent.type === "cloud" && (
            <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">Cloud</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted" />
          {sessionCount} {sessionCount === 1 ? "session" : "sessions"}
        </div>
      </div>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-500" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 6L15 12L9 18" />
      </svg>
    </button>
  );
}

function SessionStatusDot({ status, hasPendingApproval }: { status: SessionStatus; hasPendingApproval: boolean }) {
  if (hasPendingApproval) {
    return <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500 flex-shrink-0" />;
  }
  if (status === "running") {
    return <span className="inline-block h-1.5 w-1.5 rounded-full bg-success flex-shrink-0" />;
  }
  if (status === "error") {
    return <span className="inline-block h-1.5 w-1.5 rounded-full bg-error flex-shrink-0" />;
  }
  if (status === "completed") {
    return <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted flex-shrink-0" />;
  }
  return null;
}

function SessionItem({
  title,
  isActive,
  status = "idle",
  hasPendingApproval = false,
  onClick,
  onDelete,
  onResume,
}: {
  title: string;
  isActive: boolean;
  status?: SessionStatus;
  hasPendingApproval?: boolean;
  onClick: () => void;
  onDelete: () => void;
  onResume: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors ${
        isActive ? "bg-accent-subtle" : "hover:bg-surface-tertiary"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    >
      <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 flex-shrink-0 ${isActive ? "text-accent" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span className={`flex-1 truncate text-xs ${isActive ? "font-medium text-ink-800" : "text-ink-700"}`}>
        {title || "Untitled"}
      </span>
      <SessionStatusDot status={status} hasPendingApproval={hasPendingApproval} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            className="flex-shrink-0 rounded-full p-1 text-ink-500 opacity-0 group-hover:opacity-100 hover:bg-ink-900/10"
            aria-label="Session menu"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="z-50 min-w-[180px] rounded-xl border border-ink-900/10 bg-surface p-1 shadow-lg" align="center" sideOffset={8}>
            <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-ink-900/5" onSelect={onDelete}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-error/80" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M7 7l1 12a1 1 0 0 0 1 .9h6a1 1 0 0 0 1-.9l1-12" />
              </svg>
              Delete
            </DropdownMenu.Item>
            <DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none hover:bg-ink-900/5" onSelect={onResume}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-500" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 5h16v14H4z" /><path d="M7 9h10M7 12h6" /><path d="M13 15l3 2-3 2" />
              </svg>
              Resume in CLI
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
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
