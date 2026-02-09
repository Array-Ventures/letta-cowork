import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ServerEvent } from "./types";
import { useIPC } from "./hooks/useIPC";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "./store/useAppStore";
import { Sidebar, AgentIcon } from "./components/Sidebar";
import { AppViewer } from "./components/AppViewer";
import { StartSessionModal } from "./components/StartSessionModal";
import { CreateAgentModal } from "./components/CreateAgentModal";
import { CreateAppModal } from "./components/CreateAppModal";
import { usePromptActions } from "./components/PromptInput";
import { ChatPanel } from "./components/ChatPanel";
import { HomePage } from "./components/HomePage";
import { FilesView } from "./components/FilesView";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { SettingsModal } from "./components/SettingsModal";

function App() {
  const partialMessageRef = useRef("");
  const [partialMessage, setPartialMessage] = useState("");
  const [showPartialMessage, setShowPartialMessage] = useState(false);
  const [partialSessionId, setPartialSessionId] = useState<string | null>(null);
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);
  const [showCreateAppModal, setShowCreateAppModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  const {
    configStatus, currentConfig, sessions, activeSessionId,
    appSessionId, showStartModal, globalError, historyRequested,
    prompt, cwd, pendingStart, agents, models, selectedAgentId,
    sessionsLoaded, agentsLoaded, activeView, sessionMode,
  } = useAppStore(useShallow((s) => ({
    configStatus: s.configStatus, currentConfig: s.currentConfig,
    sessions: s.sessions, activeSessionId: s.activeSessionId,
    appSessionId: s.appSessionId, showStartModal: s.showStartModal,
    globalError: s.globalError, historyRequested: s.historyRequested,
    prompt: s.prompt, cwd: s.cwd, pendingStart: s.pendingStart,
    agents: s.agents, models: s.models, selectedAgentId: s.selectedAgentId,
    sessionsLoaded: s.sessionsLoaded, agentsLoaded: s.agentsLoaded,
    activeView: s.activeView, sessionMode: s.sessionMode,
  })));

  const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);

  // Actions (stable refs — individual selectors are fine)
  const setShowStartModal = useAppStore((s) => s.setShowStartModal);
  const setGlobalError = useAppStore((s) => s.setGlobalError);
  const markHistoryRequested = useAppStore((s) => s.markHistoryRequested);
  const handleServerEvent = useAppStore((s) => s.handleServerEvent);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const setCwd = useAppStore((s) => s.setCwd);
  const setSessionMode = useAppStore((s) => s.setSessionMode);
  const setActiveSessionId = useAppStore((s) => s.setActiveSessionId);

  // Handle partial messages from stream events (session-aware)
  const handlePartialMessages = useCallback((partialEvent: ServerEvent) => {
    if (partialEvent.type !== "stream.message" || partialEvent.payload.message.type !== "stream_event") return;

    const eventSessionId = partialEvent.payload.sessionId;
    const message = partialEvent.payload.message as { type: "stream_event"; event: { type: string; delta?: { text?: string; reasoning?: string } } };
    const event = message.event;

    if (event.type === "content_block_start") {
      partialMessageRef.current = "";
      setPartialMessage("");
      setShowPartialMessage(true);
      setPartialSessionId(eventSessionId);
    }

    if (event.type === "content_block_delta" && event.delta) {
      const text = event.delta.text || event.delta.reasoning || "";
      partialMessageRef.current += text;
      setPartialMessage(partialMessageRef.current);
    }

    if (event.type === "content_block_stop") {
      setShowPartialMessage(false);
      setTimeout(() => {
        partialMessageRef.current = "";
        setPartialMessage("");
        setPartialSessionId(null);
      }, 500);
    }
  }, []);

  const onEvent = useCallback((event: ServerEvent) => {
    handleServerEvent(event);
    handlePartialMessages(event);
    if (event.type === "models.list") setLoadingModels(false);
  }, [handleServerEvent, handlePartialMessages]);

  const { connected, sendEvent } = useIPC(onEvent);
  const { handleStartFromModal } = usePromptActions(sendEvent);

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const selectedAgent = agents.find((a) => a.lettaAgentId === selectedAgentId);

  // Sessions for the selected agent, newest first
  const agentSessions = useMemo(() => {
    if (!selectedAgentId) return [];
    return Object.values(sessions)
      .filter((s) => s.agentId === selectedAgentId)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [sessions, selectedAgentId]);

  // On connect: check config status first
  useEffect(() => {
    if (connected) {
      sendEvent({ type: "config.get" });
    }
  }, [connected, sendEvent]);

  // Fetch app data only after config is confirmed
  useEffect(() => {
    if (connected && configStatus === "configured") {
      sendEvent({ type: "session.list" });
      sendEvent({ type: "agent.list" });
    }
  }, [connected, configStatus, sendEvent]);

  // First launch: no agents and no sessions → prompt user to create an agent
  useEffect(() => {
    if (sessionsLoaded && agentsLoaded && agents.length === 0 && Object.keys(sessions).length === 0) {
      queueMicrotask(() => {
        setShowCreateAgentModal(true);
        setLoadingModels(true);
        sendEvent({ type: "models.list" });
      });
    }
  }, [sessionsLoaded, agentsLoaded, agents, sessions, sendEvent]);

  // Hydrate active session
  useEffect(() => {
    if (!activeSessionId || !connected) return;
    const session = sessions[activeSessionId];
    if (session && !session.hydrated && !historyRequested.has(activeSessionId)) {
      markHistoryRequested(activeSessionId);
      sendEvent({ type: "session.history", payload: { sessionId: activeSessionId } });
    }
  }, [activeSessionId, connected, sessions, historyRequested, markHistoryRequested, sendEvent]);

  // Hydrate app session
  useEffect(() => {
    if (!appSessionId || !connected) return;
    const session = sessions[appSessionId];
    if (session && !session.hydrated && !historyRequested.has(appSessionId)) {
      markHistoryRequested(appSessionId);
      sendEvent({ type: "session.history", payload: { sessionId: appSessionId } });
    }
  }, [appSessionId, connected, sessions, historyRequested, markHistoryRequested, sendEvent]);

  const handleNewSession = useCallback(() => {
    useAppStore.getState().setActiveSessionId(null);
    setShowStartModal(true);
  }, [setShowStartModal]);

  const openCreateAgentModal = useCallback(() => {
    setShowCreateAgentModal(true);
    setLoadingModels(true);
    sendEvent({ type: "models.list" });
  }, [sendEvent]);

  const handleCreateAgent = useCallback((name: string, icon: string, color: string, model?: string) => {
    sendEvent({ type: "agent.create", payload: { name, icon, color, model } });
    setShowCreateAgentModal(false);
  }, [sendEvent]);

  const openCreateAppModal = useCallback(() => {
    setShowCreateAppModal(true);
    setLoadingModels(true);
    sendEvent({ type: "models.list" });
  }, [sendEvent]);

  const handleCreateApp = useCallback((payload: {
    name: string; icon: string; color: string; model?: string;
    repoUrl: string; branch?: string; port: number; startCommand: string; installCommand: string;
  }) => {
    sendEvent({ type: "app.create", payload });
    setShowCreateAppModal(false);
  }, [sendEvent]);

  // Loading state while checking config
  if (configStatus === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-accent" />
          <span className="text-sm text-muted">Loading...</span>
        </div>
      </div>
    );
  }

  // Onboarding wizard when not configured
  if (configStatus === "unconfigured") {
    return <OnboardingWizard sendEvent={sendEvent} />;
  }

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar
        connected={connected}
        onNewAgent={openCreateAgentModal}
        onNewApp={openCreateAppModal}
        onSettings={() => setShowSettingsModal(true)}
      />

      {activeView.type === "home" ? (
        <HomePage />
      ) : activeView.type === "files" ? (
        <FilesView sendEvent={sendEvent} />
      ) : activeView.type === "app" ? (
        <AppViewer
          agentId={activeView.agentId}
          sendEvent={sendEvent}
          partialMessage={partialSessionId === appSessionId ? partialMessage : ""}
          showPartialMessage={partialSessionId === appSessionId ? showPartialMessage : false}
        />
      ) : (
      <main className="flex flex-1 flex-col ml-[280px] bg-surface-cream">
        <div
          className="relative flex items-center gap-3 h-12 border-b border-ink-900/10 bg-surface-cream select-none px-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          {selectedAgent && (
            <span className="flex items-center gap-1.5 rounded-full bg-accent-subtle px-2.5 py-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full"
                style={{ backgroundColor: selectedAgent.color }}
              >
                <AgentIcon name={selectedAgent.icon} className="h-3 w-3 text-white" />
              </span>
              <span className="text-xs font-semibold text-accent">{selectedAgent.name}</span>
            </span>
          )}
          <button
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-ink-900/5 transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={() => setSessionDropdownOpen(!sessionDropdownOpen)}
          >
            <span className="text-sm font-medium text-ink-700">
              {activeSession?.title || "No session"}
            </span>
            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 text-muted transition-transform ${sessionDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {/* Session Dropdown */}
          {sessionDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSessionDropdownOpen(false)} />
              <div className="absolute left-4 top-full z-50 mt-1 w-72 rounded-xl border border-ink-900/10 bg-surface shadow-lg" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <div className="px-3 pt-3 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[1.5px] text-muted-light">Sessions</span>
                </div>
                <div className="max-h-56 overflow-y-auto px-1 pb-1">
                  {agentSessions.length === 0 && (
                    <div className="px-3 py-4 text-center text-xs text-muted">No sessions yet</div>
                  )}
                  {agentSessions.map((s) => (
                    <button
                      key={s.id}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                        s.id === activeSessionId ? "bg-accent-subtle" : "hover:bg-surface-tertiary"
                      }`}
                      onClick={() => { setActiveSessionId(s.id); setSessionDropdownOpen(false); }}
                    >
                      <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 flex-shrink-0 ${s.id === activeSessionId ? "text-accent" : "text-muted"}`} fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className={`flex-1 truncate text-xs ${s.id === activeSessionId ? "font-medium text-accent" : "text-ink-700"}`}>
                        {s.title || "Untitled"}
                      </span>
                      <span className="text-[10px] text-muted flex-shrink-0">{timeAgo(s.updatedAt)}</span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-ink-900/10 p-1">
                  <button
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-accent hover:bg-accent-subtle transition-colors"
                    onClick={() => { handleNewSession(); setSessionDropdownOpen(false); }}
                  >
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    New Session
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <ChatPanel
          sessionId={activeSessionId}
          sendEvent={sendEvent}
          partialMessage={partialSessionId === activeSessionId ? partialMessage : ""}
          showPartialMessage={partialSessionId === activeSessionId ? showPartialMessage : false}
        />
      </main>
      )}

      {showCreateAgentModal && (
        <CreateAgentModal
          onClose={() => setShowCreateAgentModal(false)}
          onCreate={handleCreateAgent}
          models={models}
          loadingModels={loadingModels}
        />
      )}

      {showCreateAppModal && (
        <CreateAppModal
          onClose={() => setShowCreateAppModal(false)}
          onCreate={handleCreateApp}
          models={models}
          loadingModels={loadingModels}
        />
      )}

      {showStartModal && (
        <StartSessionModal
          cwd={cwd}
          prompt={prompt}
          pendingStart={pendingStart}
          mode={sessionMode}
          onModeChange={setSessionMode}
          onCwdChange={setCwd}
          onPromptChange={setPrompt}
          onStart={handleStartFromModal}
          onClose={() => setShowStartModal(false)}
        />
      )}

      {showSettingsModal && currentConfig && (
        <SettingsModal
          config={currentConfig}
          sendEvent={sendEvent}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {globalError && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-error/20 bg-error-light px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-sm text-error">{globalError}</span>
            <button className="text-error hover:text-error/80" onClick={() => setGlobalError(null)}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(ts?: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default App;
