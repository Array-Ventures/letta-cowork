import { useCallback, useEffect, useRef, useState } from "react";
import type { ServerEvent } from "./types";
import { useIPC } from "./hooks/useIPC";
import { useAppStore } from "./store/useAppStore";
import { Sidebar, AgentIcon } from "./components/Sidebar";
import { ArtifactViewer } from "./components/ArtifactViewer";
import { StartSessionModal } from "./components/StartSessionModal";
import { CreateAgentModal } from "./components/CreateAgentModal";
import { CreateAppModal } from "./components/CreateAppModal";
import { usePromptActions } from "./components/PromptInput";
import { ChatPanel } from "./components/ChatPanel";
import { HomePage } from "./components/HomePage";

function App() {
  const partialMessageRef = useRef("");
  const [partialMessage, setPartialMessage] = useState("");
  const [showPartialMessage, setShowPartialMessage] = useState(false);
  const [partialSessionId, setPartialSessionId] = useState<string | null>(null);
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);
  const [showCreateAppModal, setShowCreateAppModal] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);

  const sessions = useAppStore((s) => s.sessions);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const artifactSessionId = useAppStore((s) => s.artifactSessionId);
  const showStartModal = useAppStore((s) => s.showStartModal);
  const setShowStartModal = useAppStore((s) => s.setShowStartModal);
  const globalError = useAppStore((s) => s.globalError);
  const setGlobalError = useAppStore((s) => s.setGlobalError);
  const historyRequested = useAppStore((s) => s.historyRequested);
  const markHistoryRequested = useAppStore((s) => s.markHistoryRequested);
  const handleServerEvent = useAppStore((s) => s.handleServerEvent);
  const prompt = useAppStore((s) => s.prompt);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const cwd = useAppStore((s) => s.cwd);
  const setCwd = useAppStore((s) => s.setCwd);
  const pendingStart = useAppStore((s) => s.pendingStart);
  const agents = useAppStore((s) => s.agents);
  const models = useAppStore((s) => s.models);
  const sessionsLoaded = useAppStore((s) => s.sessionsLoaded);
  const agentsLoaded = useAppStore((s) => s.agentsLoaded);
  const activeView = useAppStore((s) => s.activeView);

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
  const activeAgent = agents.find((a) => a.lettaAgentId === activeSession?.agentId);

  // Fetch initial data on connect
  useEffect(() => {
    if (connected) {
      sendEvent({ type: "session.list" });
      sendEvent({ type: "agent.list" });
      sendEvent({ type: "artifacts.list" });
    }
  }, [connected, sendEvent]);

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

  // Hydrate artifact session
  useEffect(() => {
    if (!artifactSessionId || !connected) return;
    const session = sessions[artifactSessionId];
    if (session && !session.hydrated && !historyRequested.has(artifactSessionId)) {
      markHistoryRequested(artifactSessionId);
      sendEvent({ type: "session.history", payload: { sessionId: artifactSessionId } });
    }
  }, [artifactSessionId, connected, sessions, historyRequested, markHistoryRequested, sendEvent]);

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

  const handleDeleteSession = useCallback((sessionId: string) => {
    sendEvent({ type: "session.delete", payload: { sessionId } });
  }, [sendEvent]);

  const openCreateAppModal = useCallback(() => {
    setShowCreateAppModal(true);
    setLoadingModels(true);
    sendEvent({ type: "models.list" });
  }, [sendEvent]);

  const handleCreateApp = useCallback((name: string, icon: string, agentIcon: string, agentColor: string, model?: string) => {
    sendEvent({ type: "artifact.create", payload: { name, icon, agentIcon, agentColor, model } });
    setShowCreateAppModal(false);
  }, [sendEvent]);

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar
        connected={connected}
        onNewSession={handleNewSession}
        onNewAgent={openCreateAgentModal}
        onNewApp={openCreateAppModal}
        onDeleteSession={handleDeleteSession}
      />

      {activeView.type === "home" ? (
        <HomePage />
      ) : activeView.type === "artifact" ? (
        <ArtifactViewer
          artifactId={activeView.artifactId}
          sendEvent={sendEvent}
          partialMessage={partialSessionId === artifactSessionId ? partialMessage : ""}
          showPartialMessage={partialSessionId === artifactSessionId ? showPartialMessage : false}
        />
      ) : (
      <main className="flex flex-1 flex-col ml-[280px] bg-surface-cream">
        <div
          className="flex items-center justify-center gap-3 h-12 border-b border-ink-900/10 bg-surface-cream select-none"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          {activeAgent && (
            <span className="flex items-center gap-1.5 rounded-full bg-accent-subtle px-2.5 py-1">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full"
                style={{ backgroundColor: activeAgent.color }}
              >
                <AgentIcon name={activeAgent.icon} className="h-3 w-3 text-white" />
              </span>
              <span className="text-xs font-semibold text-accent">{activeAgent.name}</span>
            </span>
          )}
          <span className="text-sm font-medium text-ink-700">{activeSession?.title || "Letta Cowork"}</span>
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
          onCwdChange={setCwd}
          onPromptChange={setPrompt}
          onStart={handleStartFromModal}
          onClose={() => setShowStartModal(false)}
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

export default App;
