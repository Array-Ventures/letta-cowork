import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../store/useAppStore";
import { AgentIcon } from "./Sidebar";

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface px-6 py-4 flex-1">
      <span className="text-2xl font-semibold text-ink-900">{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

function AgentCard({ name, icon, color, sessionCount, status, onSettings }: {
  name: string;
  icon: string;
  color: string;
  sessionCount: number;
  status: string;
  onSettings?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 w-[calc(50%-8px)]">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          <AgentIcon name={icon} className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink-900 truncate">{name}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-success" : "bg-muted"}`} />
            {status === "active" ? "Running" : "Idle"}
          </div>
        </div>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-ink-700 hover:bg-ink-900/5 transition-colors flex-shrink-0"
          onClick={onSettings}
          aria-label={`${name} settings`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
      <div className="flex gap-4 border-t border-border mt-3 pt-3">
        <div className="flex flex-col items-center flex-1">
          <span className="text-lg font-semibold text-ink-800">{sessionCount}</span>
          <span className="text-[10px] text-muted">Sessions</span>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const { agents, sessions, currentConfig } = useAppStore(
    useShallow((s) => ({ agents: s.agents, sessions: s.sessions, currentConfig: s.currentConfig }))
  );

  const sessionList = Object.values(sessions);
  const regularAgents = useMemo(() => agents.filter((a) => !a.appConfig), [agents]);
  const appAgents = useMemo(() => agents.filter((a) => a.appConfig), [agents]);
  const totalSessions = sessionList.length;

  const userName = currentConfig?.identity.name;
  const greeting = (() => {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
    return userName ? `${timeOfDay}, ${userName}` : timeOfDay;
  })();

  return (
    <main className="flex flex-1 flex-col ml-[280px] bg-surface-cream">
      <div
        className="flex items-center justify-between h-12 border-b border-ink-900/10 bg-surface-cream px-8 select-none"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <span className="text-sm font-medium text-ink-700">Home</span>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-4xl">
          {/* Greeting */}
          <div className="mb-8">
            <h1 className="text-2xl font-semibold text-ink-900">{greeting}</h1>
            <p className="mt-1 text-sm text-muted">Here's what's happening across your workspace</p>
          </div>

          {/* Stats */}
          <div className="mb-8 flex gap-4">
            <StatCard label="Active Agents" value={regularAgents.length} />
            <StatCard label="Active Tasks" value={totalSessions} />
            <StatCard label="Conversations" value={totalSessions} />
            <StatCard label="Apps" value={appAgents.length} />
          </div>

          {/* Agents Section */}
          {regularAgents.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 text-base font-semibold text-ink-900">Agents</h2>
              <div className="flex flex-wrap gap-4">
                {regularAgents.map((agent) => {
                  const agentSessions = sessionList.filter((s) => s.agentId === agent.lettaAgentId);
                  const hasRunning = agentSessions.some((s) => s.status === "running");
                  return (
                    <AgentCard
                      key={agent.lettaAgentId}
                      name={agent.name}
                      icon={agent.icon}
                      color={agent.color}
                      sessionCount={agentSessions.length}
                      status={hasRunning ? "active" : "idle"}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Apps Section */}
          {appAgents.length > 0 && (
            <div>
              <h2 className="mb-4 text-base font-semibold text-ink-900">Apps</h2>
              <div className="flex flex-wrap gap-4">
                {appAgents.map((agent) => (
                  <div
                    key={agent.lettaAgentId}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 min-w-[200px] flex-1"
                  >
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0"
                      style={{ backgroundColor: agent.color }}
                    >
                      <AgentIcon name={agent.icon} className="h-4.5 w-4.5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink-900">{agent.name}</div>
                      <div className="text-[11px] text-muted">App</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {agents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-lg font-medium text-ink-700">Welcome to Letta Cowork</div>
              <p className="mt-2 text-sm text-muted">Create an agent to get started</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
