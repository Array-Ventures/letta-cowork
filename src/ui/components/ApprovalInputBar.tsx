import { useState, useCallback } from "react";
import type { ApprovalRequestMessage } from "../types";

function getToolSummary(tc: ApprovalRequestMessage["toolCalls"][0]): string | null {
  try {
    const args = JSON.parse(tc.arguments) as Record<string, unknown>;
    return (args.command as string) || (args.file_path as string) || (args.pattern as string) || (args.url as string) || null;
  } catch { return null; }
}

export function ApprovalInputBar({
  pendingApproval,
  isRunning,
  onRespond,
}: {
  pendingApproval: ApprovalRequestMessage;
  isRunning: boolean;
  onRespond: (decisions: Array<{ toolCallId: string; approve: boolean; reason?: string }>) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [decisions, setDecisions] = useState<Array<{ toolCallId: string; approve: boolean; reason?: string }>>([]);
  const [reason, setReason] = useState("");

  const toolCalls = pendingApproval.toolCalls;
  const current = toolCalls[currentIndex];
  const total = toolCalls.length;
  const isLast = currentIndex === total - 1;

  const handleDecision = useCallback((approve: boolean) => {
    const decision = {
      toolCallId: current.toolCallId,
      approve,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };

    if (isLast) {
      // All decisions made — send batch
      onRespond([...decisions, decision]);
    } else {
      // Store decision and move to next
      setDecisions((prev) => [...prev, decision]);
      setCurrentIndex((prev) => prev + 1);
      setReason("");
    }
  }, [current, reason, isLast, decisions, onRespond]);

  if (!current) return null;

  return (
    <section className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-surface via-surface to-transparent pb-6 px-2 lg:pb-8 pt-8 lg:ml-[280px]">
      <div className="mx-auto flex w-full max-w-full flex-col gap-3 rounded-2xl border border-ink-900/10 bg-surface px-4 py-3 shadow-card lg:max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
          <span className="text-xs font-semibold text-amber-600">
            Tool approval required{total > 1 ? ` (${currentIndex + 1}/${total})` : ""}
          </span>
        </div>

        {/* Current tool call */}
        <div className="flex items-center gap-2 rounded-xl bg-surface-tertiary px-3 py-2 overflow-hidden min-w-0">
          <span className="text-sm font-medium text-accent shrink-0">{current.name}</span>
          <span className="text-sm text-muted font-mono truncate">{getToolSummary(current)}</span>
        </div>

        {/* Reason input + buttons */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Add a reason (optional)..."
            disabled={isRunning}
            className="flex-1 rounded-xl bg-surface-tertiary px-3 py-2 text-sm text-ink-700 placeholder:text-muted outline-none border-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleDecision(true);
              }
            }}
          />
          <button
            onClick={() => handleDecision(true)}
            disabled={isRunning}
            className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {isRunning ? "Processing..." : isLast ? "Approve" : "Approve & Next"}
          </button>
          <button
            onClick={() => handleDecision(false)}
            disabled={isRunning}
            className="rounded-xl border border-ink-900/10 bg-surface px-5 py-2 text-sm font-semibold text-muted hover:bg-surface-tertiary transition-colors disabled:opacity-50"
          >
            {isLast ? "Deny" : "Deny & Next"}
          </button>
        </div>
      </div>
    </section>
  );
}
