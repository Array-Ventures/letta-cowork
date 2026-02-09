import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent } from "../types";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../store/useAppStore";

const DEFAULT_ALLOWED_TOOLS = "Read,Edit,Bash";
const MAX_ROWS = 12;
const LINE_HEIGHT = 21;
const MAX_HEIGHT = MAX_ROWS * LINE_HEIGHT;

interface PromptInputProps {
  sendEvent: (event: ClientEvent) => void;
  onSendMessage?: () => void;
  disabled?: boolean;
  sessionIdOverride?: string | null;
  agentIdOverride?: string;
  cwdOverride?: string;
  compact?: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export function usePromptActions(
  sendEvent: (event: ClientEvent) => void,
  overrides?: { sessionId?: string | null; agentId?: string; cwd?: string }
) {
  const { prompt, cwd, storeActiveSessionId, sessions, selectedAgentId } = useAppStore(
    useShallow((s) => ({
      prompt: s.prompt, cwd: s.cwd, storeActiveSessionId: s.activeSessionId,
      sessions: s.sessions, selectedAgentId: s.selectedAgentId,
    }))
  );
  const setPrompt = useAppStore((s) => s.setPrompt);
  const setPendingStart = useAppStore((s) => s.setPendingStart);
  const setGlobalError = useAppStore((s) => s.setGlobalError);

  // Use overrides when provided (e.g. artifact sidebar)
  const activeSessionId = overrides?.sessionId !== undefined ? overrides.sessionId : storeActiveSessionId;
  const agentId = overrides?.agentId ?? selectedAgentId;
  const effectiveCwd = overrides?.cwd ?? cwd;

  const activeSession = activeSessionId ? sessions[activeSessionId] : undefined;
  const isRunning = activeSession?.status === "running";

  const handleSend = useCallback(async () => {
    if (!prompt.trim()) return;

    if (!activeSessionId) {
      setPendingStart(true);
      const sessionMode = useAppStore.getState().sessionMode;
      // Title will be set from conversation ID
      sendEvent({
        type: "session.start",
        payload: { title: "", prompt, cwd: effectiveCwd.trim() || undefined, agentId: agentId || undefined, allowedTools: DEFAULT_ALLOWED_TOOLS, mode: sessionMode }
      });
      // Don't clear prompt yet - wait for modal to close to avoid UI flicker
    } else {
      if (activeSession?.status === "running") {
        setGlobalError("Session is still running. Please wait for it to finish.");
        return;
      }
      const sessionMode = useAppStore.getState().sessionMode;
      sendEvent({ type: "session.continue", payload: { sessionId: activeSessionId, prompt, cwd: effectiveCwd.trim() || activeSession?.cwd, mode: sessionMode } });
      setPrompt("");
    }
  }, [activeSession, activeSessionId, agentId, effectiveCwd, prompt, sendEvent, setGlobalError, setPendingStart, setPrompt]);

  const handleStop = useCallback(() => {
    if (!activeSessionId) return;
    sendEvent({ type: "session.stop", payload: { sessionId: activeSessionId } });
  }, [activeSessionId, sendEvent]);

  const handleStartFromModal = useCallback(() => {
    // Cloud sessions don't need a working directory
    const sessionMode = useAppStore.getState().sessionMode;
    if (sessionMode !== "cloud" && !cwd.trim()) {
      setGlobalError("Working Directory is required to start a local session.");
      return;
    }
    handleSend();
  }, [cwd, handleSend, setGlobalError]);

  return { prompt, setPrompt, isRunning, handleSend, handleStop, handleStartFromModal };
}

export function PromptInput({ sendEvent, onSendMessage, disabled = false, sessionIdOverride, agentIdOverride, cwdOverride, compact = false }: PromptInputProps) {
  const overrides = sessionIdOverride !== undefined || agentIdOverride !== undefined || cwdOverride !== undefined
    ? { sessionId: sessionIdOverride, agentId: agentIdOverride, cwd: cwdOverride }
    : undefined;
  const { prompt, setPrompt, isRunning, handleSend, handleStop } = usePromptActions(sendEvent, overrides);
  const sessionMode = useAppStore((s) => s.sessionMode);
  const setSessionMode = useAppStore((s) => s.setSessionMode);
  const cwd = useAppStore((s) => s.cwd);
  const setCwd = useAppStore((s) => s.setCwd);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [recentCwds, setRecentCwds] = useState<string[]>([]);

  // Fetch recent directories when switching to local mode
  useEffect(() => {
    if (sessionMode === "local") {
      window.electron?.getRecentCwds?.().then((cwds: string[]) => {
        setRecentCwds(cwds);
        if (cwds.length > 0 && !useAppStore.getState().cwd.trim()) {
          setCwd(cwds[0]);
        }
      }).catch(() => {});
    }
  }, [sessionMode, setCwd]);

  const toggleMode = useCallback(() => {
    setSessionMode(sessionMode === "cloud" ? "local" : "cloud");
  }, [sessionMode, setSessionMode]);

  const handleBrowse = useCallback(async () => {
    const result = await window.electron?.selectDirectory?.();
    if (result) {
      setCwd(result);
      // Update recent list immediately (select-directory already persists it)
      setRecentCwds((prev) => [result, ...prev.filter((p) => p !== result)]);
    }
  }, [setCwd]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled && !isRunning) return;
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (isRunning) { handleStop(); return; }
    onSendMessage?.();
    handleSend();
  };

  const handleButtonClick = () => {
    if (disabled && !isRunning) return;
    if (isRunning) {
      handleStop();
    } else {
      onSendMessage?.();
      handleSend();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = "auto";
    const scrollHeight = target.scrollHeight;
    if (scrollHeight > MAX_HEIGHT) {
      target.style.height = `${MAX_HEIGHT}px`;
      target.style.overflowY = "auto";
    } else {
      target.style.height = `${scrollHeight}px`;
      target.style.overflowY = "hidden";
    }
  };

  useEffect(() => {
    if (!promptRef.current) return;
    promptRef.current.style.height = "auto";
    const scrollHeight = promptRef.current.scrollHeight;
    if (scrollHeight > MAX_HEIGHT) {
      promptRef.current.style.height = `${MAX_HEIGHT}px`;
      promptRef.current.style.overflowY = "auto";
    } else {
      promptRef.current.style.height = `${scrollHeight}px`;
      promptRef.current.style.overflowY = "hidden";
    }
  }, [prompt]);

  return (
    <section className={compact
      ? "border-t border-ink-900/10 bg-surface px-3 py-3"
      : "fixed bottom-0 left-0 right-0 bg-gradient-to-t from-surface via-surface to-transparent pb-6 px-2 lg:pb-8 pt-8 lg:ml-[280px]"
    }>
      {/* CWD bar — shown in local mode only (non-compact) */}
      {sessionMode === "local" && !compact && (
        <div className="mx-auto flex w-full max-w-full items-center gap-1.5 lg:max-w-3xl mb-2 px-1">
          <button
            type="button"
            onClick={handleBrowse}
            className="flex items-center gap-1 rounded-lg border border-ink-900/10 bg-surface px-2 py-1 text-[11px] font-medium text-ink-700 hover:bg-surface-tertiary transition-colors shrink-0"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
            </svg>
            Browse
          </button>
          {recentCwds.length > 0 && (
            <>
              <span className="text-[10px] font-medium text-muted shrink-0">Recent:</span>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {recentCwds.slice(0, 3).map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setCwd(path)}
                    className={`truncate rounded-full border px-2.5 py-0.5 text-[11px] transition-colors whitespace-nowrap ${
                      cwd === path
                        ? "border-accent/60 bg-accent/10 text-ink-800"
                        : "border-ink-900/10 bg-surface text-muted hover:border-ink-900/20 hover:text-ink-700"
                    }`}
                    title={path}
                  >
                    {path.replace(/^\/Users\/[^/]+/, "~")}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className={compact
        ? "flex w-full items-end gap-2"
        : "mx-auto flex w-full max-w-full items-end gap-3 rounded-2xl border border-ink-900/10 bg-surface px-4 py-3 shadow-card lg:max-w-3xl"
      }>
        <textarea
          rows={1}
          className="flex-1 resize-none bg-transparent py-1.5 text-sm text-ink-800 placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          placeholder={disabled ? "Create/select a task to start..." : "Describe what you want agent to handle..."}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          ref={promptRef}
          disabled={disabled && !isRunning}
        />
        <button
          type="button"
          onClick={toggleMode}
          className="flex h-7 items-center gap-1 rounded-xl border border-ink-900/10 bg-surface-tertiary px-2 text-[11px] font-medium text-ink-700 hover:bg-surface-secondary transition-colors shrink-0"
          title={sessionMode === "cloud" ? "Cloud mode — tools run in Daytona" : "Local mode — tools run on your machine"}
        >
          {sessionMode === "cloud" ? (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg>
          )}
          {sessionMode === "cloud" ? "Cloud" : "Local"}
        </button>
        <button
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isRunning ? "bg-error text-white hover:bg-error/90" : "bg-accent text-white hover:bg-accent-hover"}`}
          onClick={handleButtonClick}
          aria-label={isRunning ? "Stop session" : "Send prompt"}
          disabled={disabled && !isRunning}
        >
          {isRunning ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path d="M3.4 20.6 21 12 3.4 3.4l2.8 7.2L16 12l-9.8 1.4-2.8 7.2Z" fill="currentColor" /></svg>
          )}
        </button>
      </div>
    </section>
  );
}
