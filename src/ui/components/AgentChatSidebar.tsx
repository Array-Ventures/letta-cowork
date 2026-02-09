import { useState } from "react";
import type { ClientEvent } from "../types";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../store/useAppStore";
import { AgentIcon } from "./Sidebar";
import { ChatPanel } from "./ChatPanel";

interface AgentChatSidebarProps {
  agentId: string;
  agentName: string;
  agentIcon: string;
  agentColor: string;
  defaultCwd?: string;
  sendEvent: (event: ClientEvent) => void;
  partialMessage?: string;
  showPartialMessage?: boolean;
}

export function AgentChatSidebar({
  agentId,
  agentName,
  agentIcon,
  agentColor,
  defaultCwd,
  sendEvent,
  partialMessage = "",
  showPartialMessage = false,
}: AgentChatSidebarProps) {
  const { artifactSessionId, sessions } = useAppStore(
    useShallow((s) => ({ artifactSessionId: s.artifactSessionId, sessions: s.sessions }))
  );
  const setArtifactSessionId = useAppStore((s) => s.setArtifactSessionId);
  const session = artifactSessionId ? sessions[artifactSessionId] : undefined;
  const isRunning = session?.status === "running";

  const [showSessionDropdown, setShowSessionDropdown] = useState(false);

  // All sessions for this agent, newest first
  const agentSessions = Object.values(sessions)
    .filter((s) => s.agentId === agentId)
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  const handleSwitchSession = (sessionId: string) => {
    setArtifactSessionId(sessionId);
    setShowSessionDropdown(false);
  };

  const handleNewChat = () => {
    setArtifactSessionId(null);
    setShowSessionDropdown(false);
  };

  return (
    <div className="flex h-full w-[280px] flex-shrink-0 flex-col border-l border-ink-900/10 bg-surface">
      {/* Agent Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-ink-900/10 flex-shrink-0">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0"
          style={{ backgroundColor: agentColor }}
        >
          <AgentIcon name={agentIcon} className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink-800 truncate">{agentName}</div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${isRunning ? "bg-success" : "bg-muted"}`} />
            <span className={isRunning ? "text-success" : "text-muted"}>
              {isRunning ? "Running" : "Active"}
            </span>
          </div>
        </div>
        <button className="rounded-full p-1 text-ink-400 hover:bg-ink-900/5" aria-label="Settings">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        </button>
      </div>

      {/* Session Bar */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-ink-900/10 flex-shrink-0 relative">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <button
          className="flex-1 min-w-0 flex items-center gap-1 text-xs text-ink-700 hover:text-ink-900 truncate"
          onClick={() => setShowSessionDropdown(!showSessionDropdown)}
        >
          <span className="truncate">{session?.title || "New chat"}</span>
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-muted shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <button
          onClick={handleNewChat}
          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:text-ink-700 hover:bg-ink-900/5 shrink-0"
          aria-label="New chat"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        {/* Session Dropdown */}
        {showSessionDropdown && agentSessions.length > 0 && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 mx-2 rounded-lg border border-ink-900/10 bg-surface shadow-lg max-h-48 overflow-y-auto">
            {agentSessions.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSwitchSession(s.id)}
                className={`w-full px-3 py-2 text-left text-xs hover:bg-surface-hover truncate ${
                  s.id === artifactSessionId ? "text-accent font-medium" : "text-ink-700"
                }`}
              >
                {s.title || s.id.slice(0, 8)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat Area — reuses ChatPanel in compact mode */}
      <ChatPanel
        sessionId={artifactSessionId}
        sendEvent={sendEvent}
        compact
        agentId={agentId}
        defaultCwd={defaultCwd}
        partialMessage={partialMessage}
        showPartialMessage={showPartialMessage}
      />
    </div>
  );
}
