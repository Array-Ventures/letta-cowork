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

function AgentCard({ name, icon, color, sessionCount, status }: {
  name: string;
  icon: string;
  color: string;
  sessionCount: number;
  status: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 flex-1 min-w-[200px]">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: color }}
        >
          <AgentIcon name={icon} className="h-4.5 w-4.5 text-white" />
        </div>
        <div>
          <div className="text-sm font-semibold text-ink-900">{name}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-success" : "bg-muted"}`} />
            {status === "active" ? "Running" : "Idle"}
          </div>
        </div>
      </div>
      <div className="flex gap-4 border-t border-border pt-3">
        <div className="flex flex-col items-center flex-1">
          <span className="text-lg font-semibold text-ink-800">{sessionCount}</span>
          <span className="text-[10px] text-muted">Tasks</span>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const agents = useAppStore((s) => s.agents);
  const sessions = useAppStore((s) => s.sessions);
  const artifacts = useAppStore((s) => s.artifacts);

  const sessionList = Object.values(sessions);
  const activeAgentCount = agents.length;
  const totalSessions = sessionList.length;
  const runningSessions = sessionList.filter((s) => s.status === "running").length;

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
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
            <StatCard label="Active Agents" value={activeAgentCount} />
            <StatCard label="Active Tasks" value={totalSessions} />
            <StatCard label="Conversations" value={totalSessions} />
            <StatCard label="Apps Running" value={artifacts.length} />
          </div>

          {/* Agents Section */}
          {agents.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-4 text-base font-semibold text-ink-900">Agents</h2>
              <div className="flex flex-wrap gap-4">
                {agents
                  .filter((a) => !artifacts.some((art) => art.agentId === a.lettaAgentId))
                  .map((agent) => {
                    const agentSessions = sessionList.filter((s) => s.agentId === agent.lettaAgentId);
                    const hasRunning = agentSessions.some((s) => s.status === "running");
                    return (
                      <AgentCard
                        key={agent.lettaAgentId}
                        name={agent.name}
                        icon={agent.icon}
                        color={agent.color}
                        sessionCount={agentSessions.length}
                        status={hasRunning || runningSessions > 0 ? "active" : "idle"}
                      />
                    );
                  })}
              </div>
            </div>
          )}

          {/* Apps Section */}
          {artifacts.length > 0 && (
            <div>
              <h2 className="mb-4 text-base font-semibold text-ink-900">Apps</h2>
              <div className="flex flex-wrap gap-4">
                {artifacts.map((artifact) => (
                  <div
                    key={artifact.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 min-w-[200px] flex-1"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-subtle">
                      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 text-accent" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink-900">{artifact.name}</div>
                      <div className="text-[11px] text-muted">App</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {agents.length === 0 && artifacts.length === 0 && (
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
