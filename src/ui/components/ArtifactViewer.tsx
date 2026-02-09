import { useEffect, useRef, useState } from "react";
import type { ClientEvent } from "../types";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../store/useAppStore";
import { AgentChatSidebar } from "./AgentChatSidebar";

interface ArtifactViewerProps {
  artifactId: string;
  sendEvent: (event: ClientEvent) => void;
  partialMessage?: string;
  showPartialMessage?: boolean;
}

export function ArtifactViewer({ artifactId, sendEvent, partialMessage = "", showPartialMessage = false }: ArtifactViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const { artifacts, agents, artifactReloadCounter } = useAppStore(
    useShallow((s) => ({ artifacts: s.artifacts, agents: s.agents, artifactReloadCounter: s.artifactReloadCounter }))
  );
  const artifact = artifacts.find((a) => a.id === artifactId);
  const artifactAgent = artifact?.agentId
    ? agents.find((a) => a.lettaAgentId === artifact.agentId)
    : undefined;

  // Tell main process to watch this artifact's bundle.html for changes
  useEffect(() => {
    sendEvent({ type: "artifact.watch", payload: { artifactId } });
    return () => {
      sendEvent({ type: "artifact.watch", payload: { artifactId: null } });
    };
  }, [artifactId, sendEvent]);

  // Reload iframe when artifact.reload event bumps the counter
  useEffect(() => {
    if (artifactReloadCounter > 0) {
      setIframeKey((k) => k + 1);
    }
  }, [artifactReloadCounter]);

  // Sync theme with iframe
  useEffect(() => {
    const sendTheme = () => {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      iframeRef.current?.contentWindow?.postMessage(
        { type: "theme", value: isDark ? "dark" : "light" },
        "*"
      );
    };

    const iframe = iframeRef.current;
    if (iframe) iframe.addEventListener("load", sendTheme);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", sendTheme);

    return () => {
      iframe?.removeEventListener("load", sendTheme);
      mq.removeEventListener("change", sendTheme);
    };
  }, [artifact, iframeKey]);

  if (!artifact) {
    return (
      <main className="flex flex-1 flex-col ml-[280px] items-center justify-center bg-surface-cream">
        <p className="text-sm text-muted">Artifact not found</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 h-screen ml-[280px] bg-surface-cream">
      {/* Dashboard — fills remaining space */}
      <div className="flex flex-1 flex-col min-w-0">
        <div
          className="flex items-center gap-3 h-12 border-b border-ink-900/10 bg-surface-cream select-none px-4"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <span className="text-sm font-medium text-ink-700">{artifact.name}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Live
          </span>
        </div>

        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={`artifact://bundle/${artifact.id}`}
          sandbox="allow-scripts"
          className="flex-1 border-0"
          title={artifact.name}
        />
      </div>

      {/* Agent Chat Sidebar — 280px right panel */}
      {artifact.agentId && (
        <AgentChatSidebar
          agentId={artifact.agentId}
          agentName={artifactAgent?.name ?? `${artifact.name} maintainer`}
          agentIcon={artifactAgent?.icon ?? "bot"}
          agentColor={artifactAgent?.color ?? "#0606ac"}
          defaultCwd={artifact.path}
          sendEvent={sendEvent}
          partialMessage={partialMessage}
          showPartialMessage={showPartialMessage}
        />
      )}
    </main>
  );
}
