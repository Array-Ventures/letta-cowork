import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientEvent, CanUseToolResponse, ApprovalRequestMessage } from "../types";
import { useMessageWindow } from "../hooks/useMessageWindow";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../store/useAppStore";
import { PromptInput } from "./PromptInput";
import { MessageCard } from "./EventCard";
import { ApprovalInputBar } from "./ApprovalInputBar";
import MDContent from "../render/markdown";

const SCROLL_THRESHOLD = 50;

interface ChatPanelProps {
  sessionId: string | null;
  sendEvent: (event: ClientEvent) => void;
  compact?: boolean;
  agentId?: string;
  defaultCwd?: string;
  partialMessage?: string;
  showPartialMessage?: boolean;
  onSendMessage?: () => void;
  forceCloudMode?: boolean;
}

export function ChatPanel({
  sessionId,
  sendEvent,
  compact = false,
  agentId,
  defaultCwd,
  partialMessage = "",
  showPartialMessage = false,
  onSendMessage,
  forceCloudMode = false,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const prevMessagesLengthRef = useRef(0);
  const scrollHeightBeforeLoadRef = useRef(0);
  const shouldRestoreScrollRef = useRef(false);

  const { sessions, agents } = useAppStore(useShallow((s) => ({ sessions: s.sessions, agents: s.agents })));
  const resolvePermissionRequest = useAppStore((s) => s.resolvePermissionRequest);
  const markApprovalHandled = useAppStore((s) => s.markApprovalHandled);

  const session = sessionId ? sessions[sessionId] : undefined;
  const sessionAgentId = session?.agentId ?? agentId;
  const agentName = sessionAgentId ? agents.find((a) => a.lettaAgentId === sessionAgentId)?.name : undefined;
  const permissionRequests = session?.permissionRequests ?? [];
  const isRunning = session?.status === "running";

  const {
    visibleMessages,
    hasMoreHistory,
    isLoadingHistory,
    loadMoreMessages,
    totalMessages,
  } = useMessageWindow(sendEvent, sessionId);

  // Derive pending HITL approval from visible messages
  const pendingApproval = useMemo((): ApprovalRequestMessage | null => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      const msg = visibleMessages[i].message;
      if (msg.type === "approval_request" && msg.isPending) return msg;
      if (msg.type === "approval_request" && !msg.isPending) break;
    }
    return null;
  }, [visibleMessages]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - SCROLL_THRESHOLD;

    if (isAtBottom !== shouldAutoScroll) {
      setShouldAutoScroll(isAtBottom);
      if (isAtBottom) {
        setHasNewMessages(false);
      }
    }
  }, [shouldAutoScroll]);

  // IntersectionObserver for scroll-up pagination
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMoreHistory && !isLoadingHistory) {
          scrollHeightBeforeLoadRef.current = container.scrollHeight;
          shouldRestoreScrollRef.current = true;
          loadMoreMessages();
        }
      },
      {
        root: container,
        rootMargin: "100px 0px 0px 0px",
        threshold: 0,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreHistory, isLoadingHistory, loadMoreMessages]);

  // Restore scroll position after loading history
  useEffect(() => {
    if (shouldRestoreScrollRef.current && !isLoadingHistory) {
      const container = scrollContainerRef.current;
      if (container) {
        const newScrollHeight = container.scrollHeight;
        const scrollDiff = newScrollHeight - scrollHeightBeforeLoadRef.current;
        container.scrollTop += scrollDiff;
      }
      shouldRestoreScrollRef.current = false;
    }
  }, [visibleMessages, isLoadingHistory]);

  // Reset scroll state on session change
  useEffect(() => {
    queueMicrotask(() => {
      setShouldAutoScroll(true);
      setHasNewMessages(false);
    });
    prevMessagesLengthRef.current = 0;
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }, 100);
  }, [sessionId]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (totalMessages > prevMessagesLengthRef.current && prevMessagesLengthRef.current > 0) {
      queueMicrotask(() => setHasNewMessages(true));
    }
    prevMessagesLengthRef.current = totalMessages;
  }, [totalMessages, partialMessage, shouldAutoScroll]);

  // Also scroll on streaming partial messages
  useEffect(() => {
    if (shouldAutoScroll && partialMessage) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [partialMessage, shouldAutoScroll]);

  const scrollToBottom = useCallback(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handlePermissionResult = useCallback((toolUseId: string, result: CanUseToolResponse) => {
    if (!sessionId) return;
    sendEvent({ type: "permission.response", payload: { sessionId, toolUseId, result } });
    resolvePermissionRequest(sessionId, toolUseId);
  }, [sessionId, sendEvent, resolvePermissionRequest]);

  const handleApprovalResponse = useCallback((decisions: Array<{ toolCallId: string; approve: boolean; reason?: string }>) => {
    if (!sessionId || !pendingApproval) return;
    const approvals = decisions.map((d) => ({
      tool_call_id: d.toolCallId,
      approve: d.approve,
      ...(d.reason ? { reason: d.reason } : {}),
    }));
    markApprovalHandled(sessionId, pendingApproval.messageId);
    sendEvent({ type: "approval.response", payload: { sessionId, approvals } });
  }, [sessionId, pendingApproval, sendEvent, markApprovalHandled]);

  const handleSendMessage = useCallback(() => {
    setShouldAutoScroll(true);
    setHasNewMessages(false);
    onSendMessage?.();
  }, [onSendMessage]);

  const scrollPadding = compact ? "px-4 pb-32 pt-4" : "px-8 pb-40 pt-6";
  const maxWidth = compact ? "" : "mx-auto max-w-3xl";

  return (
    <div className="relative flex flex-1 flex-col min-h-0">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto ${scrollPadding}`}
      >
        <div className={maxWidth}>
          <div ref={topSentinelRef} className="h-1" />

          {!hasMoreHistory && totalMessages > 0 && (
            <div className="flex items-center justify-center py-4 mb-4">
              <div className="flex items-center gap-2 text-xs text-muted">
                <div className="h-px w-12 bg-ink-900/10" />
                <span>Beginning of conversation</span>
                <div className="h-px w-12 bg-ink-900/10" />
              </div>
            </div>
          )}

          {isLoadingHistory && (
            <div className="flex items-center justify-center py-4 mb-4">
              <div className="flex items-center gap-2 text-xs text-muted">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Loading...</span>
              </div>
            </div>
          )}

          {visibleMessages.length === 0 ? (
            <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-10" : "py-20"}`}>
              <div className={`font-medium text-ink-700 ${compact ? "text-sm" : "text-lg"}`}>No messages yet</div>
              <p className={`mt-2 text-muted ${compact ? "text-xs" : "text-sm"}`}>Start a conversation</p>
            </div>
          ) : (
            visibleMessages.map((item, idx) => (
              <MessageCard
                key={`${sessionId}-msg-${item.originalIndex}`}
                message={item.message}
                isLast={idx === visibleMessages.length - 1}
                isRunning={isRunning}
                agentName={agentName}
                permissionRequest={permissionRequests[0]}
                onPermissionResult={handlePermissionResult}
              />
            ))
          )}

          {/* Partial message display with skeleton loading */}
          {partialMessage && (
            <div className="partial-message mt-4">
              <div className="header text-accent">{agentName || "Assistant"}</div>
              <MDContent text={partialMessage} />
            </div>
          )}
          {showPartialMessage && !partialMessage && (
            <div className="mt-3 flex flex-col gap-2 px-1">
              <div className="relative h-3 w-2/12 overflow-hidden rounded-full bg-ink-900/10">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-ink-900/10">
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-ink-900/30 to-transparent animate-shimmer" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {pendingApproval && !isRunning ? (
        <ApprovalInputBar
          pendingApproval={pendingApproval}
          isRunning={isRunning}
          onRespond={handleApprovalResponse}
        />
      ) : (
        <PromptInput
          sendEvent={sendEvent}
          onSendMessage={handleSendMessage}
          disabled={!sessionId && !agentId}
          sessionIdOverride={compact ? sessionId : undefined}
          agentIdOverride={compact ? agentId : undefined}
          cwdOverride={compact ? defaultCwd : undefined}
          compact={compact}
          forceCloudMode={forceCloudMode}
        />
      )}

      {hasNewMessages && !shouldAutoScroll && (
        <button
          onClick={scrollToBottom}
          className={`absolute z-40 flex items-center gap-2 rounded-full bg-accent text-sm font-medium text-white shadow-lg transition-all hover:bg-accent-hover hover:scale-105 animate-bounce-subtle ${
            compact ? "bottom-20 right-4 px-3 py-1.5" : "bottom-28 left-1/2 -translate-x-1/2 px-4 py-2"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          {!compact && <span>New messages</span>}
        </button>
      )}
    </div>
  );
}
