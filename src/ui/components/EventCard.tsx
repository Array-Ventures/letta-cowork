import { useEffect, useRef, useState } from "react";
import type {
  CanUseToolResponse,
  SDKMessage,
  SDKToolCallMessage,
  SDKToolResultMessage,
  SDKReasoningMessage,
  SDKInitMessage,
  SDKAssistantMessage,
  StreamMessage,
  ApprovalRequestMessage,
} from "../types";
import type { PermissionRequest } from "../store/useAppStore";
import MDContent from "../render/markdown";
import { DecisionPanel } from "./DecisionPanel";

type ToolStatus = "pending" | "success" | "error";
const toolStatusMap = new Map<string, ToolStatus>();
const toolStatusListeners = new Set<() => void>();
const MAX_VISIBLE_LINES = 3;

type AskUserQuestionInput = {
  questions?: Array<{
    question: string;
    header?: string;
    options?: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }>;
};

const getAskUserQuestionSignature = (input?: AskUserQuestionInput | null) => {
  if (!input?.questions?.length) return "";
  return input.questions.map((question) => {
    const options = (question.options ?? []).map((o) => `${o.label}|${o.description ?? ""}`).join(",");
    return `${question.question}|${question.header ?? ""}|${question.multiSelect ? "1" : "0"}|${options}`;
  }).join("||");
};

const setToolStatus = (toolCallId: string | undefined, status: ToolStatus) => {
  if (!toolCallId) return;
  toolStatusMap.set(toolCallId, status);
  toolStatusListeners.forEach((listener) => listener());
};

const useToolStatus = (toolCallId: string | undefined) => {
  const [status, setStatus] = useState<ToolStatus | undefined>(() =>
    toolCallId ? toolStatusMap.get(toolCallId) : undefined
  );
  useEffect(() => {
    if (!toolCallId) return;
    const handleUpdate = () => setStatus(toolStatusMap.get(toolCallId));
    toolStatusListeners.add(handleUpdate);
    return () => { toolStatusListeners.delete(handleUpdate); };
  }, [toolCallId]);
  return status;
};

const StatusDot = ({ variant = "accent", isActive = false, isVisible = true }: {
  variant?: "accent" | "success" | "error" | "muted"; isActive?: boolean; isVisible?: boolean;
}) => {
  if (!isVisible) return null;
  const colorClass = variant === "success" ? "bg-success" : variant === "error" ? "bg-error" : variant === "muted" ? "bg-muted" : "bg-accent";
  return (
    <span className="relative flex h-2 w-2">
      {isActive && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colorClass} opacity-75`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${colorClass}`} />
    </span>
  );
};



// eslint-disable-next-line react-refresh/only-export-components
export function isMarkdown(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  const patterns: RegExp[] = [/^#{1,6}\s+/m, /```[\s\S]*?```/];
  return patterns.some((pattern) => pattern.test(text));
}

function extractTagContent(input: string, tag: string): string | null {
  const match = input.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? match[1] : null;
}

// Tool Result Card (for tool_result messages)
const ToolResultCard = ({ message }: { message: SDKToolResultMessage }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isFirstRender = useRef(true);
  
  const isError = message.isError;
  let lines: string[];

  if (isError) {
    lines = [extractTagContent(message.content, "tool_use_error") || message.content];
  } else {
    lines = message.content.split("\n");
  }

  const isMarkdownContent = isMarkdown(lines.join("\n"));
  const hasMoreLines = lines.length > MAX_VISIBLE_LINES;
  const visibleContent = hasMoreLines && !isExpanded ? lines.slice(0, MAX_VISIBLE_LINES).join("\n") : lines.join("\n");

  useEffect(() => { setToolStatus(message.toolCallId, isError ? "error" : "success"); }, [message.toolCallId, isError]);
  useEffect(() => {
    if (!hasMoreLines || isFirstRender.current) { isFirstRender.current = false; return; }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [hasMoreLines, isExpanded]);

  return (
    <div className="flex flex-col mt-4">
      <div className="header text-accent">Output</div>
      <div className="mt-2 rounded-xl bg-surface-tertiary p-3">
        <pre className={`text-sm whitespace-pre-wrap break-words font-mono ${isError ? "text-red-500" : "text-ink-700"}`}>
          {isMarkdownContent ? <MDContent text={visibleContent} /> : visibleContent}
        </pre>
        {hasMoreLines && (
          <button onClick={() => setIsExpanded(!isExpanded)} className="mt-2 text-sm text-accent hover:text-accent-hover transition-colors flex items-center gap-1">
            <span>{isExpanded ? "▲" : "▼"}</span>
            <span>{isExpanded ? "Collapse" : `Show ${lines.length - MAX_VISIBLE_LINES} more lines`}</span>
          </button>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

// Assistant Message Card
const AssistantCard = ({ message, showIndicator = false, agentName }: { message: SDKAssistantMessage; showIndicator?: boolean; agentName?: string }) => (
  <div className="flex flex-col mt-4">
    <div className="header text-accent flex items-center gap-2">
      <StatusDot variant="success" isActive={showIndicator} isVisible />
      {agentName || "Assistant"}
    </div>
    <MDContent text={message.content} />
  </div>
);

// Reasoning Card (collapsible — expanded while streaming, auto-collapses after)
const ReasoningCard = ({ message, showIndicator = false }: { message: SDKReasoningMessage; showIndicator?: boolean }) => {
  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const isExpanded = userToggled ?? showIndicator;

  return (
    <div className="flex flex-col mt-4">
      <button
        className="header text-accent flex items-center gap-2 cursor-pointer hover:opacity-80 text-left"
        onClick={() => setUserToggled(isExpanded ? false : true)}
      >
        <StatusDot variant="muted" isActive={showIndicator} isVisible />
        Thinking
        <svg
          viewBox="0 0 24 24"
          className={`h-3 w-3 text-muted transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`}
          fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {isExpanded && <MDContent text={message.content} />}
    </div>
  );
};

// Tool Call Card
const ToolCallCard = ({ 
  message, 
  showIndicator = false,
  permissionRequest,
  onPermissionResult
}: { 
  message: SDKToolCallMessage; 
  showIndicator?: boolean;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId: string, result: CanUseToolResponse) => void;
}) => {
  const toolStatus = useToolStatus(message.toolCallId);
  const statusVariant = toolStatus === "error" ? "error" : "success";
  const isPending = !toolStatus || toolStatus === "pending";
  const shouldShowDot = toolStatus === "success" || toolStatus === "error" || showIndicator;

  useEffect(() => {
    if (message.toolCallId && !toolStatusMap.has(message.toolCallId)) {
      setToolStatus(message.toolCallId, "pending");
    }
  }, [message.toolCallId]);

  const getToolInfo = (): string | null => {
    const input = message.toolInput as Record<string, unknown>;
    switch (message.toolName) {
      case "Bash": return (input?.command as string) || null;
      case "Read": case "Write": case "Edit": return (input?.file_path as string) || null;
      case "Glob": case "Grep": return (input?.pattern as string) || null;
      case "Task": return (input?.description as string) || null;
      case "WebFetch": return (input?.url as string) || null;
      default: return null;
    }
  };

  // Handle AskUserQuestion specially
  if (message.toolName === "AskUserQuestion") {
    const input = message.toolInput as AskUserQuestionInput | null;
    const questions = input?.questions ?? [];
    const currentSignature = getAskUserQuestionSignature(input);
    const requestSignature = getAskUserQuestionSignature(permissionRequest?.input as AskUserQuestionInput | undefined);
    const isActiveRequest = permissionRequest && currentSignature === requestSignature;

    if (isActiveRequest && onPermissionResult) {
      return (
        <div className="mt-4">
          <DecisionPanel
            request={permissionRequest}
            onSubmit={(result) => onPermissionResult(permissionRequest.toolUseId, result)}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2 rounded-[1rem] bg-surface-tertiary px-3 py-2 mt-4">
        <div className="flex flex-row items-center gap-2">
          <StatusDot variant="success" isActive={false} isVisible={true} />
          <span className="inline-flex items-center rounded-md text-accent py-0.5 text-sm font-medium">AskUserQuestion</span>
        </div>
        {questions.map((q, idx) => (
          <div key={idx} className="text-sm text-ink-700 ml-4">{q.question}</div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[1rem] bg-surface-tertiary px-3 py-2 mt-4 overflow-hidden">
      <div className="flex flex-row items-center gap-2 min-w-0">
        <StatusDot variant={statusVariant} isActive={isPending && showIndicator} isVisible={shouldShowDot} />
        <div className="flex flex-row items-center gap-2 tool-use-item min-w-0 flex-1">
          <span className="inline-flex items-center rounded-md text-accent py-0.5 text-sm font-medium shrink-0">{message.toolName}</span>
          <span className="text-sm text-muted truncate">{getToolInfo()}</span>
        </div>
      </div>
    </div>
  );
};

// InfoItem helper component
const InfoItem = ({ name, value }: { name: string; value: string }) => (
  <div className="text-[14px]">
    <span className="mr-4 font-normal">{name}</span>
    <span className="font-light">{value}</span>
  </div>
);

// Init Card
const InitCard = ({ message, showIndicator = false }: { message: SDKInitMessage; showIndicator?: boolean }) => {
  return (
    <div className="flex flex-col gap-2 mt-2">
      <div className="header text-accent flex items-center gap-2">
        <StatusDot variant="success" isActive={showIndicator} isVisible={showIndicator} />
        Session Started
      </div>
      <div className="flex flex-col rounded-xl px-4 py-2 border border-ink-900/10 bg-surface-secondary space-y-1">
        <InfoItem name="Conversation ID" value={message.conversationId || "-"} />
        <InfoItem name="Model" value={message.model || "-"} />
      </div>
    </div>
  );
};

// User Prompt Card
const UserPromptCard = ({ message, showIndicator = false }: { message: { type: "user_prompt"; prompt: string }; showIndicator?: boolean }) => (
  <div className="flex flex-col mt-4">
    <div className="header text-accent flex items-center gap-2">
      <StatusDot variant="accent" isActive={showIndicator} isVisible />
      User
    </div>
    <MDContent text={message.prompt} />
  </div>
);

// Approval Request Card (minimal inline indicator for server-side HITL)
const ApprovalCard = ({ message }: { message: ApprovalRequestMessage }) => {
  const getToolSummary = (tc: ApprovalRequestMessage["toolCalls"][0]): string | null => {
    try {
      const args = JSON.parse(tc.arguments) as Record<string, unknown>;
      return (args.command as string) || (args.file_path as string) || (args.pattern as string) || (args.url as string) || null;
    } catch { return null; }
  };

  return (
    <>
      {message.toolCalls.map((tc, idx) => (
        <div key={idx} className="flex flex-row items-center gap-2 rounded-[1rem] bg-surface-tertiary px-3 py-2 mt-4 overflow-hidden min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            {message.isPending && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${message.isPending ? "bg-amber-500" : "bg-success"}`} />
          </span>
          <span className={`text-sm font-medium shrink-0 ${message.isPending ? "text-amber-500" : "text-success"}`}>
            {message.isPending ? "Pending Approval" : "Approved"}
          </span>
          <span className="text-sm font-medium text-accent shrink-0">{tc.name}</span>
          <span className="text-sm text-muted truncate">{getToolSummary(tc)}</span>
        </div>
      ))}
    </>
  );
};

export function MessageCard({
  message,
  isLast = false,
  isRunning = false,
  agentName,
  permissionRequest,
  onPermissionResult,
}: {
  message: StreamMessage;
  isLast?: boolean;
  isRunning?: boolean;
  agentName?: string;
  permissionRequest?: PermissionRequest;
  onPermissionResult?: (toolUseId: string, result: CanUseToolResponse) => void;
}) {
  const showIndicator = isLast && isRunning;

  // User prompt (local type, not from SDK)
  if (message.type === "user_prompt") {
    return <UserPromptCard message={message} showIndicator={showIndicator} />;
  }

  // Server-side HITL approval request (minimal inline indicator)
  if (message.type === "approval_request") {
    return <ApprovalCard message={message} />;
  }

  // SDK message types
  const sdkMessage = message as SDKMessage;

  switch (sdkMessage.type) {
    case "init":
      return <InitCard message={sdkMessage} showIndicator={showIndicator} />;
    
    case "assistant":
      return <AssistantCard message={sdkMessage} showIndicator={showIndicator} agentName={agentName} />;
    
    case "reasoning":
      return <ReasoningCard message={sdkMessage} showIndicator={showIndicator} />;
    
    case "tool_call":
      return <ToolCallCard message={sdkMessage} showIndicator={showIndicator} permissionRequest={permissionRequest} onPermissionResult={onPermissionResult} />;
    
    case "tool_result":
      return <ToolResultCard message={sdkMessage} />;
    
    case "result":
      // Don't render session result
      if (sdkMessage.success) {
        return null;
      }
      // Only show errors
      return (
        <div className="flex flex-col gap-2 mt-4">
          <div className="header text-error">Error</div>
          <div className="rounded-xl bg-error-light p-3">
            <pre className="text-sm text-error whitespace-pre-wrap">{sdkMessage.error || "Unknown error"}</pre>
          </div>
        </div>
      );
    
    default:
      return null;
  }
}

export { MessageCard as EventCard };
