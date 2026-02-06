import { BrowserWindow } from "electron";
import type { ClientEvent, ServerEvent } from "./types.js";
import { runLetta, type RunnerHandle } from "./libs/runner.js";
import type { PendingPermission } from "./libs/runtime-state.js";
import {
  createRuntimeSession,
  getSession,
  getAllSessions,
  updateSession,
  deleteSession,
} from "./libs/runtime-state.js";
import {
  fetchConversations,
  fetchConversationMessages,
  fetchLastRun,
  transformLettaMessages,
  updateAgent,
  sendApprovalResponse,
} from "./libs/letta-api.js";
import { createAgent } from "@letta-ai/letta-code-sdk";
import {
  loadAgents,
  saveAgent,
  deleteAgent as deleteAgentFromStore,
  renameAgent as renameAgentInStore,
} from "./libs/agent-store.js";

// Track active runner handles
const runnerHandles = new Map<string, RunnerHandle>();

// After SDK run completes, check if server stopped at approval and emit missing messages.
// The SDK doesn't stream approval_request_message (it's a server-side HITL concept),
// so we need to fetch it from the API and emit it to the UI.
async function emitMissingApprovalMessages(conversationId: string) {
  try {
    const lastRun = await fetchLastRun(conversationId);
    if (!lastRun || lastRun.stop_reason !== "requires_approval") return;

    const apiMessages = await fetchConversationMessages(conversationId);
    const transformed = transformLettaMessages(apiMessages, lastRun.id);

    // Find approval_request messages for this run that the UI is missing
    const approvalMsgs = transformed.filter(
      (m) => m.type === "approval_request" && m.runId === lastRun.id
    );

    for (const msg of approvalMsgs) {
      emit({
        type: "stream.message",
        payload: { sessionId: conversationId, message: msg },
      });
    }

    // Update session status to reflect pending approval
    emit({
      type: "session.status",
      payload: { sessionId: conversationId, status: "idle" },
    });
  } catch (error) {
    console.error("Failed to fetch approval messages after run:", error);
  }
}

// Derive session status from server run state, with runtime override
function deriveSessionStatus(
  runtimeStatus: string | undefined,
  lastRun: { status: string; stop_reason: string | null } | null
): "idle" | "running" | "completed" | "error" {
  if (runtimeStatus && runtimeStatus !== "idle") return runtimeStatus as "running" | "completed" | "error";
  if (!lastRun) return "idle";
  if (lastRun.status === "failed") return "error";
  if (lastRun.status === "running") return "running";
  if (lastRun.status === "completed") return "completed";
  return "idle";
}

function broadcast(event: ServerEvent) {
  const payload = JSON.stringify(event);
  const windows = BrowserWindow.getAllWindows();
  for (const win of windows) {
    win.webContents.send("server-event", payload);
  }
}

function emit(event: ServerEvent) {
  // Update runtime state on status changes
  if (event.type === "session.status") {
    updateSession(event.payload.sessionId, { status: event.payload.status });
  }
  broadcast(event);
}

export async function handleClientEvent(event: ClientEvent) {
  // Model listing
  if (event.type === "models.list") {
    try {
      const baseUrl = process.env.LETTA_BASE_URL || "http://localhost:8283";
      const res = await fetch(`${baseUrl}/v1/models/`);
      const models = await res.json();
      const llmModels = (models as Array<{ handle: string; name: string; display_name: string; provider_type: string; model_type: string; max_context_window: number }>)
        .filter((m) => m.model_type === "llm")
        .map((m) => ({ handle: m.handle, name: m.name, display_name: m.display_name, provider_type: m.provider_type, max_context_window: m.max_context_window }));
      emit({ type: "models.list", payload: { models: llmModels } });
    } catch (error) {
      console.error("Failed to fetch models:", error);
      emit({ type: "models.list", payload: { models: [] } });
    }
    return;
  }

  // Agent management
  if (event.type === "agent.list") {
    const agents = loadAgents();
    emit({ type: "agent.list", payload: { agents } });
    return;
  }

  if (event.type === "agent.create") {
    try {
      const lettaAgentId = await createAgent(
        event.payload.model ? { model: event.payload.model } : undefined
      );
      // SDK creates agents as "Nameless Agent" — set the user's chosen name via REST API
      await updateAgent(lettaAgentId, { name: event.payload.name }).catch((err) =>
        console.warn("Failed to set agent name on server:", err)
      );
      const entry = {
        name: event.payload.name,
        lettaAgentId,
        icon: event.payload.icon,
        color: event.payload.color,
        model: event.payload.model,
        createdAt: new Date().toISOString(),
      };
      saveAgent(entry);
      emit({ type: "agent.created", payload: entry });
    } catch (error) {
      console.error("Failed to create agent:", error);
      emit({ type: "runner.error", payload: { message: `Failed to create agent: ${error}` } });
    }
    return;
  }

  if (event.type === "agent.delete") {
    deleteAgentFromStore(event.payload.lettaAgentId);
    emit({ type: "agent.deleted", payload: { lettaAgentId: event.payload.lettaAgentId } });
    return;
  }

  if (event.type === "agent.rename") {
    renameAgentInStore(event.payload.lettaAgentId, event.payload.name);
    await updateAgent(event.payload.lettaAgentId, { name: event.payload.name }).catch((err) =>
      console.warn("Failed to sync agent rename to server:", err)
    );
    emit({ type: "agent.renamed", payload: { lettaAgentId: event.payload.lettaAgentId, name: event.payload.name } });
    return;
  }

  if (event.type === "session.list") {
    try {
      const agents = loadAgents();
      const runtimeSessions = getAllSessions();

      const results = await Promise.allSettled(
        agents.map((agent) => fetchConversations(agent.lettaAgentId))
      );

      // Collect all conversations
      const allConvs: Array<{ conv: { id: string; agent_id: string; created_at: string; updated_at: string }; runtimeStatus?: string }> = [];
      for (let i = 0; i < agents.length; i++) {
        const result = results[i];
        if (result.status !== "fulfilled") {
          console.error(`Failed to fetch conversations for agent ${agents[i].lettaAgentId}:`, result.reason);
          continue;
        }
        for (const conv of result.value) {
          allConvs.push({ conv, runtimeStatus: runtimeSessions.get(conv.id)?.status });
        }
      }

      // Fetch last run for each conversation in parallel to detect pending approvals
      const lastRuns = await Promise.allSettled(
        allConvs.map(({ conv }) => fetchLastRun(conv.id))
      );

      const allSessions = allConvs.map(({ conv, runtimeStatus }, idx) => {
        const lastRun = lastRuns[idx].status === "fulfilled" ? lastRuns[idx].value : null;
        return {
          id: conv.id,
          title: conv.id,
          status: deriveSessionStatus(runtimeStatus, lastRun),
          hasPendingApproval: lastRun?.stop_reason === "requires_approval",
          agentId: conv.agent_id,
          createdAt: new Date(conv.created_at).getTime(),
          updatedAt: new Date(conv.updated_at).getTime(),
        };
      });

      emit({ type: "session.list", payload: { sessions: allSessions } });
    } catch (error) {
      console.error("Failed to list sessions:", error);
      emit({ type: "session.list", payload: { sessions: [] } });
    }
    return;
  }

  if (event.type === "session.history") {
    const conversationId = event.payload.sessionId;

    try {
      const [apiMessages, lastRun] = await Promise.all([
        fetchConversationMessages(conversationId),
        fetchLastRun(conversationId),
      ]);
      // Only pending if the last run stopped because it requires approval
      const pendingRunId = lastRun?.stop_reason === "requires_approval" ? lastRun.id : undefined;
      const hasPendingApproval = !!pendingRunId;
      const messages = transformLettaMessages(apiMessages, pendingRunId);

      // Derive status from server (lastRun), with runtime override if actively running
      const runtimeStatus = getSession(conversationId)?.status;
      const status = deriveSessionStatus(runtimeStatus, lastRun);

      emit({
        type: "session.history",
        payload: { sessionId: conversationId, status, hasPendingApproval, messages },
      });
    } catch (error) {
      console.error(`Failed to fetch history for ${conversationId}:`, error);
      const status = getSession(conversationId)?.status || "idle";
      emit({
        type: "session.history",
        payload: { sessionId: conversationId, status, messages: [] },
      });
    }
    return;
  }

  if (event.type === "session.start") {
    const pendingPermissions = new Map<string, PendingPermission>();

    try {
      let conversationId: string | null = null;
      let handle: RunnerHandle | null = null;
      
      handle = await runLetta({
        prompt: event.payload.prompt,
        agentId: event.payload.agentId,
        session: {
          id: "pending",
          title: event.payload.title,
          status: "running",
          cwd: event.payload.cwd,
          pendingPermissions,
        },
        onEvent: (e) => {
          // Use conversationId for all events
          if (conversationId && "sessionId" in e.payload) {
            const payload = e.payload as { sessionId: string };
            payload.sessionId = conversationId;
          }
          emit(e);
        },
        onSessionUpdate: (updates) => {
          // Called when session is initialized with conversationId
          if (updates.lettaConversationId && !conversationId) {
            conversationId = updates.lettaConversationId;

            createRuntimeSession(conversationId);
            updateSession(conversationId, { status: "running" });
            if (handle) runnerHandles.set(conversationId, handle);

            // Emit session.status to unblock UI - use conversationId as title
            emit({
              type: "session.status",
              payload: { sessionId: conversationId, status: "running", title: conversationId, cwd: event.payload.cwd, agentId: event.payload.agentId },
            });
            emit({
              type: "stream.user_prompt",
              payload: { sessionId: conversationId, prompt: event.payload.prompt },
            });
          }
        },
        onComplete: (convId) => emitMissingApprovalMessages(convId),
      });
    } catch (error) {
      console.error("Failed to start session:", error);
      emit({
        type: "runner.error",
        payload: { message: String(error) },
      });
    }
    return;
  }

  if (event.type === "session.continue") {
    const conversationId = event.payload.sessionId;
    let runtimeSession = getSession(conversationId);
    
    if (!runtimeSession) {
      runtimeSession = createRuntimeSession(conversationId);
    }

    updateSession(conversationId, { status: "running" });
    emit({
      type: "session.status",
      payload: { sessionId: conversationId, status: "running" },
    });

    emit({
      type: "stream.user_prompt",
      payload: { sessionId: conversationId, prompt: event.payload.prompt },
    });

    try {
      const handle = await runLetta({
        prompt: event.payload.prompt,
        session: {
          id: conversationId,
          title: conversationId,
          status: "running",
          cwd: event.payload.cwd,
          pendingPermissions: runtimeSession.pendingPermissions,
        },
        resumeConversationId: conversationId,
        onEvent: emit,
        onSessionUpdate: () => {},
        onComplete: (convId) => emitMissingApprovalMessages(convId),
      });
      runnerHandles.set(conversationId, handle);
    } catch (error) {
      updateSession(conversationId, { status: "error" });
      emit({
        type: "session.status",
        payload: { sessionId: conversationId, status: "error", error: String(error) },
      });
    }
    return;
  }

  if (event.type === "session.stop") {
    const conversationId = event.payload.sessionId;
    const handle = runnerHandles.get(conversationId);
    if (handle) {
      handle.abort();
      runnerHandles.delete(conversationId);
    }
    updateSession(conversationId, { status: "idle" });
    emit({
      type: "session.status",
      payload: { sessionId: conversationId, status: "idle" },
    });
    return;
  }

  if (event.type === "session.delete") {
    const conversationId = event.payload.sessionId;
    const handle = runnerHandles.get(conversationId);
    if (handle) {
      handle.abort();
      runnerHandles.delete(conversationId);
    }
    deleteSession(conversationId);
    
    // Note: Letta client may not have a delete method for conversations
    // The conversation will remain in Letta but be removed from our UI
    
    emit({ type: "session.deleted", payload: { sessionId: conversationId } });
    return;
  }

  if (event.type === "approval.response") {
    const { sessionId, approvals } = event.payload;

    emit({
      type: "session.status",
      payload: { sessionId, status: "running" },
    });

    try {
      const responseMessages = await sendApprovalResponse(sessionId, approvals);

      // Check if the continuation run also stopped at approval
      const lastRun = await fetchLastRun(sessionId);
      const pendingRunId = lastRun?.stop_reason === "requires_approval" ? lastRun.id : undefined;
      const transformed = transformLettaMessages(responseMessages, pendingRunId);

      for (const msg of transformed) {
        emit({
          type: "stream.message",
          payload: { sessionId, message: msg },
        });
      }

      const status = pendingRunId ? "idle" : "completed";
      emit({
        type: "session.status",
        payload: { sessionId, status },
      });
    } catch (error) {
      console.error("Failed to send approval response:", error);
      emit({
        type: "session.status",
        payload: { sessionId, status: "error", error: String(error) },
      });
    }
    return;
  }

  if (event.type === "permission.response") {
    const session = getSession(event.payload.sessionId);
    if (!session) return;

    const pending = session.pendingPermissions.get(event.payload.toolUseId);
    if (pending) {
      pending.resolve(event.payload.result);
    }
    return;
  }
}

export function cleanupAllSessions(): void {
  for (const [, handle] of runnerHandles) {
    handle.abort();
  }
  runnerHandles.clear();
}
