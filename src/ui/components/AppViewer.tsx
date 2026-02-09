import { useEffect, useRef, useState } from "react";
import type { ClientEvent, AppServerStatus } from "../types";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../store/useAppStore";
import { AgentChatSidebar } from "./AgentChatSidebar";

interface AppViewerProps {
  agentId: string;
  sendEvent: (event: ClientEvent) => void;
  partialMessage?: string;
  showPartialMessage?: boolean;
}

const STATUS_LABELS: Record<AppServerStatus, string> = {
  stopped: "Stopped",
  starting: "Starting...",
  running: "Running",
  error: "Error",
};

const PREVIEW_REFRESH_MS = 55 * 60 * 1000; // 55 minutes (TTL is 1 hour)

export function AppViewer({ agentId, sendEvent, partialMessage = "", showPartialMessage = false }: AppViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const { agents, appStatuses } = useAppStore(
    useShallow((s) => ({ agents: s.agents, appStatuses: s.appStatuses }))
  );

  const agent = agents.find((a) => a.lettaAgentId === agentId);
  const appStatus = appStatuses[agentId];
  const status: AppServerStatus = appStatus?.status ?? "stopped";
  const previewUrl = appStatus?.previewUrl;
  const error = appStatus?.error;

  // Request app start on mount — backend guards against duplicates
  useEffect(() => {
    sendEvent({ type: "app.start", payload: { agentId } });
  }, [agentId, sendEvent]);

  // Sync dark/light theme to iframe via postMessage
  useEffect(() => {
    const iframe = iframeRef.current;
    if (status !== "running" || !previewUrl || !iframe) return;

    const postTheme = () => {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      iframe.contentWindow?.postMessage({ type: "theme", value: dark ? "dark" : "light" }, "*");
    };

    iframe.addEventListener("load", postTheme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", postTheme);

    return () => {
      iframe.removeEventListener("load", postTheme);
      mq.removeEventListener("change", postTheme);
    };
  }, [status, previewUrl]);

  // Refresh preview URL before TTL expires
  useEffect(() => {
    if (status !== "running") return;

    refreshTimerRef.current = setInterval(() => {
      sendEvent({ type: "app.preview", payload: { agentId } });
    }, PREVIEW_REFRESH_MS);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [agentId, status, sendEvent]);

  const [retrying, setRetrying] = useState(false);
  const handleRetry = () => {
    setRetrying(true);
    sendEvent({ type: "app.start", payload: { agentId } });
    setTimeout(() => setRetrying(false), 3000);
  };

  if (!agent) {
    return (
      <main className="flex flex-1 flex-col ml-[280px] items-center justify-center bg-surface-cream">
        <p className="text-sm text-muted">App not found</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 h-screen ml-[280px] bg-surface-cream">
      {/* App content — fills remaining space */}
      <div className="flex flex-1 flex-col min-w-0">
        <div
          className="flex items-center gap-3 h-12 border-b border-ink-900/10 bg-surface-cream select-none px-4"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <span className="text-sm font-medium text-ink-700">{agent.name}</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            status === "running"
              ? "bg-green-100 text-green-700"
              : status === "starting"
              ? "bg-amber-100 text-amber-700"
              : status === "error"
              ? "bg-red-100 text-red-700"
              : "bg-gray-100 text-gray-600"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              status === "running"
                ? "bg-green-500"
                : status === "starting"
                ? "bg-amber-500 animate-pulse"
                : status === "error"
                ? "bg-red-500"
                : "bg-gray-400"
            }`} />
            {STATUS_LABELS[status]}
          </span>
          {status === "running" && (
            <button
              type="button"
              onClick={() => sendEvent({ type: "app.rebuild", payload: { agentId } })}
              className="ml-auto flex items-center gap-1 rounded-lg border border-ink-900/10 bg-surface px-2 py-1 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
              style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              Rebuild
            </button>
          )}
        </div>

        {/* Status overlays */}
        {status === "starting" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-accent" />
            <div className="text-sm text-muted">Setting up app environment...</div>
            <div className="text-xs text-muted-light">Cloning repo, installing deps, starting dev server</div>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
            <div className="text-sm font-medium text-red-700">Failed to start app</div>
            {error && <div className="max-w-md text-center text-xs text-muted">{error}</div>}
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {retrying ? "Retrying..." : "Retry"}
            </button>
          </div>
        )}

        {status === "stopped" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="text-sm text-muted">App is stopped</div>
            <button
              onClick={() => sendEvent({ type: "app.start", payload: { agentId } })}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
            >
              Start App
            </button>
          </div>
        )}

        {status === "running" && previewUrl && (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="flex-1 border-0"
            title={agent.name}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            allow="clipboard-write"
          />
        )}
      </div>

      {/* Agent Chat Sidebar — 280px right panel */}
      <AgentChatSidebar
        agentId={agentId}
        agentName={agent.name}
        agentIcon={agent.icon}
        agentColor={agent.color}
        sendEvent={sendEvent}
        partialMessage={partialMessage}
        showPartialMessage={showPartialMessage}
      />
    </main>
  );
}
