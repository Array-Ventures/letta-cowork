import { BrowserWindow } from "electron";
import type { ClientEvent, ServerEvent } from "./types.js";
import { runLetta, type RunnerHandle } from "./libs/runner.js";
import { runCloudAgent } from "./libs/cloud-runner.js";
import { createLogger } from "./libs/logger.js";

const log = createLogger("ipc");
import {
  createRuntimeSession,
  getSession,
  getAllSessions,
  updateSession,
  deleteSession,
} from "./libs/runtime-state.js";
import {
  fetchConversations,
  fetchMessagePage,
  fetchLastRun,
  transformLettaMessages,
  updateAgent,
  deleteAgentOnServer,
  sendApprovalResponse,
  type Run,
  type Conversation,
} from "./libs/letta-api.js";
import { getLettaClient } from "./libs/letta-client.js";
import {
  fetchAgents,
  createNewAgent,
  ensureCloudReady,
} from "./libs/agent-store.js";
import { listArtifacts, ensureArtifactAgents, createArtifact, getArtifactBundlePath } from "./libs/artifact-store.js";
import {
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  listFiles,
  uploadFile,
  deleteFile,
  listFolderAgents,
  attachFolderToAgent,
  detachFolderFromAgent,
  listEmbeddingModels,
} from "./libs/letta-folders.js";
import { addRecentCwd } from "./libs/recent-cwds.js";
import { loadConfig, saveConfig, deleteConfig, applyConfigToEnv, redactConfig } from "./libs/config-store.js";
import { resetLettaClient } from "./libs/letta-client.js";
import { resetDaytonaClient } from "./libs/daytona.js";
import { Letta } from "@letta-ai/letta-client";
import { Daytona } from "@daytonaio/sdk";
import { watch, type FSWatcher } from "node:fs";
import { dirname, basename } from "node:path";

// Track active runner handles
const runnerHandles = new Map<string, RunnerHandle>();

// Track active file watcher for artifact live reload
let activeArtifactWatcher: FSWatcher | null = null;

// After SDK run completes (or after approval response), fetch the true state from REST
// and push it to the UI. This replaces ephemeral SDK stream messages with canonical data.
async function emitSessionRefresh(conversationId: string) {
  try {
    const [{ items: apiMsgs, hasMore }, lastRun] = await Promise.all([
      fetchMessagePage(conversationId),
      fetchLastRun(conversationId),
    ]);
    const pendingRunId = lastRun?.stop_reason === "requires_approval" ? lastRun.id : undefined;
    const hasPendingApproval = !!pendingRunId;
    const status = pendingRunId
      ? "idle"
      : lastRun?.status === "failed"
        ? "error"
        : "completed";
    const messages = transformLettaMessages(apiMsgs, pendingRunId);
    // Use oldest message ID as cursor for scroll-up pagination
    const cursor = apiMsgs.length > 0 ? apiMsgs[apiMsgs.length - 1].id : undefined;

    log.debug("emitSessionRefresh", { conversationId, messageCount: messages.length, status, hasPendingApproval });
    emit({
      type: "session.refresh",
      payload: { sessionId: conversationId, messages, cursor, hasMore, status, hasPendingApproval },
    });
  } catch (error) {
    log.error("Failed to refresh session after run:", error);
  }
}

// Derive session status from server run state, with runtime override
function deriveSessionStatus(
  runtimeStatus: string | undefined,
  lastRun: Run | null
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
  // --- Config / Onboarding ---

  if (event.type === "config.get") {
    const config = loadConfig();
    log.debug("config.get", { configured: !!config });
    if (config) {
      emit({ type: "config.status", payload: { configured: true, config: redactConfig(config) } });
    } else {
      emit({ type: "config.status", payload: { configured: false } });
    }
    return;
  }

  if (event.type === "config.testServer") {
    const { baseUrl, apiKey } = event.payload;
    log.info("config.testServer", { baseUrl, hasApiKey: !!apiKey });
    try {
      const tempClient = new Letta({ baseURL: baseUrl, ...(apiKey ? { apiKey } : {}) });
      const health = await tempClient.health();
      log.info("config.testServer success", { version: health.version });
      emit({ type: "config.testServer.result", payload: { success: true, version: health.version } });
    } catch (error) {
      log.error("config.testServer failed:", error);
      emit({ type: "config.testServer.result", payload: { success: false, error: String(error) } });
    }
    return;
  }

  if (event.type === "config.listOrgs") {
    const { baseUrl, apiKey } = event.payload;
    log.debug("config.listOrgs", { baseUrl });
    try {
      // Organizations are identities with identity_type=org in Letta
      const resp = await fetch(`${baseUrl}/v1/identities/?identity_type=org&limit=100`, {
        headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), "Content-Type": "application/json" },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      const orgs = (await resp.json()) as Array<{ id: string; name: string }>;
      log.info("config.listOrgs", { count: orgs.length, names: orgs.map((o) => o.name) });
      emit({ type: "config.listOrgs.result", payload: { success: true, orgs: orgs.map((o) => ({ id: o.id, name: o.name })) } });
    } catch (error) {
      log.error("config.listOrgs failed:", error);
      emit({ type: "config.listOrgs.result", payload: { success: false, error: String(error) } });
    }
    return;
  }

  if (event.type === "config.listIdentities") {
    const { baseUrl, apiKey } = event.payload;
    log.debug("config.listIdentities", { baseUrl });
    try {
      const resp = await fetch(`${baseUrl}/v1/identities/?identity_type=user&limit=100`, {
        headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), "Content-Type": "application/json" },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      const identities = (await resp.json()) as Array<{ id: string; name: string; identifier_key: string }>;
      log.info("config.listIdentities", { count: identities.length, names: identities.map((i) => i.name) });
      emit({
        type: "config.listIdentities.result",
        payload: { success: true, identities: identities.map((i) => ({ id: i.id, name: i.name, identifierKey: i.identifier_key })) },
      });
    } catch (error) {
      log.error("config.listIdentities failed:", error);
      emit({ type: "config.listIdentities.result", payload: { success: false, error: String(error) } });
    }
    return;
  }

  if (event.type === "config.createIdentity") {
    const { baseUrl, apiKey, name, identifierKey } = event.payload;
    log.info("config.createIdentity", { name, identifierKey });
    try {
      const resp = await fetch(`${baseUrl}/v1/identities/`, {
        method: "PUT",
        headers: { ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), "Content-Type": "application/json" },
        body: JSON.stringify({ name, identifier_key: identifierKey, identity_type: "user" }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      const identity = (await resp.json()) as { id: string };
      log.info("config.createIdentity success", { identityId: identity.id });
      emit({ type: "config.createIdentity.result", payload: { success: true, identityId: identity.id } });
    } catch (error) {
      log.error("config.createIdentity failed:", error);
      emit({ type: "config.createIdentity.result", payload: { success: false, error: String(error) } });
    }
    return;
  }

  if (event.type === "config.testDaytona") {
    const { apiKey, apiUrl } = event.payload;
    log.info("config.testDaytona", { apiUrl, hasApiKey: !!apiKey });
    try {
      const tempClient = new Daytona({ apiKey, ...(apiUrl ? { apiUrl } : {}) });
      await tempClient.list();
      log.info("config.testDaytona success");
      emit({ type: "config.testDaytona.result", payload: { success: true } });
    } catch (error) {
      log.error("config.testDaytona failed:", error);
      emit({ type: "config.testDaytona.result", payload: { success: false, error: String(error) } });
    }
    return;
  }

  if (event.type === "config.save") {
    log.info("config.save");
    try {
      saveConfig(event.payload);
      applyConfigToEnv(event.payload);
      resetLettaClient();
      resetDaytonaClient();
      log.info("config.save success");
      emit({ type: "config.saved", payload: { success: true } });
    } catch (error) {
      log.error("config.save failed:", error);
      emit({ type: "config.saved", payload: { success: false, error: String(error) } });
    }
    return;
  }

  if (event.type === "config.reset") {
    log.info("config.reset");
    deleteConfig();
    resetLettaClient();
    resetDaytonaClient();
    emit({ type: "config.reset.result", payload: { success: true } });
    return;
  }

  // Model listing
  if (event.type === "models.list") {
    try {
      const client = getLettaClient();
      const models = await client.models.list();
      const llmModels = models
        .filter((m) => m.model_type === "llm")
        .map((m) => ({
          handle: m.handle ?? "",
          name: m.name,
          display_name: m.display_name ?? "",
          provider_type: m.provider_type,
          max_context_window: m.max_context_window,
        }));
      emit({ type: "models.list", payload: { models: llmModels } });
    } catch (error) {
      log.error("Failed to fetch models:", error);
      emit({ type: "models.list", payload: { models: [] } });
    }
    return;
  }

  // Artifacts
  if (event.type === "artifacts.list") {
    await ensureArtifactAgents();
    const artifacts = listArtifacts();
    emit({ type: "artifacts.list", payload: { artifacts } });
    // Refresh agent list since new agents may have been created
    try {
      const agents = await fetchAgents();
      emit({ type: "agent.list", payload: { agents } });
    } catch (error) {
      log.error("Failed to refresh agents after artifact list:", error);
    }
    return;
  }

  if (event.type === "artifact.create") {
    try {
      const artifact = await createArtifact(event.payload);
      emit({ type: "artifact.created", payload: { artifact } });
      // Refresh both lists
      emit({ type: "artifacts.list", payload: { artifacts: listArtifacts() } });
      const agents = await fetchAgents();
      emit({ type: "agent.list", payload: { agents } });
    } catch (error) {
      emit({ type: "runner.error", payload: { message: `Failed to create app: ${error}` } });
    }
    return;
  }

  if (event.type === "artifact.watch") {
    // Clean up previous watcher
    if (activeArtifactWatcher) {
      activeArtifactWatcher.close();
      activeArtifactWatcher = null;
    }

    if (event.payload.artifactId) {
      const bundlePath = getArtifactBundlePath(event.payload.artifactId);
      if (bundlePath) {
        // Watch the directory, not the file — atomic mv replaces the inode,
        // which breaks fs.watch on the file after the first replacement.
        const dir = dirname(bundlePath);
        const filename = basename(bundlePath);
        activeArtifactWatcher = watch(dir, (_eventType, changedFile) => {
          if (changedFile === filename) {
            emit({ type: "artifact.reload", payload: { artifactId: event.payload.artifactId! } });
          }
        });
      }
    }
    return;
  }

  // Agent management
  if (event.type === "agent.list") {
    try {
      const agents = await fetchAgents();
      emit({ type: "agent.list", payload: { agents } });
    } catch (error) {
      log.error("Failed to list agents:", error);
      emit({ type: "agent.list", payload: { agents: [] } });
    }
    return;
  }

  if (event.type === "agent.create") {
    try {
      const agent = await createNewAgent({
        name: event.payload.name,
        icon: event.payload.icon,
        color: event.payload.color,
        model: event.payload.model,
      });
      emit({ type: "agent.created", payload: agent });
    } catch (error) {
      log.error("Failed to create agent:", error);
      emit({ type: "runner.error", payload: { message: `Failed to create agent: ${error}` } });
    }
    return;
  }

  if (event.type === "agent.delete") {
    try {
      await deleteAgentOnServer(event.payload.lettaAgentId);
      emit({ type: "agent.deleted", payload: { lettaAgentId: event.payload.lettaAgentId } });
    } catch (error) {
      log.error("Failed to delete agent:", error);
      emit({ type: "runner.error", payload: { message: `Failed to delete agent: ${error}` } });
    }
    return;
  }

  if (event.type === "agent.rename") {
    try {
      await updateAgent(event.payload.lettaAgentId, { name: event.payload.name });
      emit({ type: "agent.renamed", payload: { lettaAgentId: event.payload.lettaAgentId, name: event.payload.name } });
    } catch (error) {
      log.error("Failed to rename agent:", error);
      emit({ type: "runner.error", payload: { message: `Failed to rename agent: ${error}` } });
    }
    return;
  }

  if (event.type === "session.list") {
    try {
      const agents = await fetchAgents();
      const runtimeSessions = getAllSessions();

      const results = await Promise.allSettled(
        agents.map((agent) => fetchConversations(agent.lettaAgentId))
      );

      // Collect all conversations
      const allConvs: Array<{ conv: Conversation; runtimeStatus?: string }> = [];
      for (let i = 0; i < agents.length; i++) {
        const result = results[i];
        if (result.status !== "fulfilled") {
          log.error(`Failed to fetch conversations for agent ${agents[i].lettaAgentId}:`, result.reason);
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
          createdAt: conv.created_at ? new Date(conv.created_at).getTime() : 0,
          updatedAt: conv.updated_at ? new Date(conv.updated_at).getTime() : 0,
        };
      });

      log.debug("session.list", { agentCount: agents.length, conversationCount: allConvs.length });
      emit({ type: "session.list", payload: { sessions: allSessions } });
    } catch (error) {
      log.error("Failed to list sessions:", error);
      emit({ type: "session.list", payload: { sessions: [] } });
    }
    return;
  }

  if (event.type === "session.history") {
    const { sessionId: conversationId, before, limit } = event.payload;
    const isScrollUp = !!before;
    log.debug("session.history", { conversationId, before, limit, isScrollUp });

    try {
      const [{ items: apiMsgs, hasMore }, lastRun] = await Promise.all([
        fetchMessagePage(conversationId, { before, limit }),
        fetchLastRun(conversationId),
      ]);
      const pendingRunId = lastRun?.stop_reason === "requires_approval" ? lastRun.id : undefined;
      const messages = transformLettaMessages(apiMsgs, pendingRunId);
      // Use oldest message ID as cursor for the next scroll-up fetch
      const cursor = apiMsgs.length > 0 ? apiMsgs[apiMsgs.length - 1].id : undefined;

      if (isScrollUp) {
        emit({
          type: "session.history",
          payload: { sessionId: conversationId, status: "idle", messages, cursor, hasMore, append: true },
        });
      } else {
        const hasPendingApproval = !!pendingRunId;
        const runtimeStatus = getSession(conversationId)?.status;
        const status = deriveSessionStatus(runtimeStatus, lastRun);

        emit({
          type: "session.history",
          payload: { sessionId: conversationId, status, hasPendingApproval, messages, cursor, hasMore },
        });
      }
    } catch (error) {
      log.error(`Failed to fetch history for ${conversationId}:`, error);
      const status = getSession(conversationId)?.status || "idle";
      emit({
        type: "session.history",
        payload: { sessionId: conversationId, status, messages: [] },
      });
    }
    return;
  }

  if (event.type === "session.start") {
    const mode = event.payload.mode ?? "cloud";
    const isCloud = mode === "cloud";
    log.debug("session.start", { agentId: event.payload.agentId, mode, isCloud, promptLength: event.payload.prompt.length });
    if (event.payload.cwd) addRecentCwd(event.payload.cwd);

    try {
      // For cloud mode, ensure the agent has a sandbox (legacy fallback)
      if (isCloud && event.payload.agentId) {
        await ensureCloudReady(event.payload.agentId);
      }

      let conversationId: string | null = null;
      let handle: RunnerHandle | null = null;

      const onSessionUpdate = (updates: { lettaConversationId?: string; agentId?: string }) => {
        if (updates.lettaConversationId && !conversationId) {
          conversationId = updates.lettaConversationId;

          createRuntimeSession(conversationId);
          updateSession(conversationId, { status: "running", agentId: event.payload.agentId, mode });
          if (handle) runnerHandles.set(conversationId, handle);

          emit({
            type: "session.status",
            payload: { sessionId: conversationId, status: "running", title: conversationId, cwd: event.payload.cwd, agentId: event.payload.agentId },
          });
          emit({
            type: "stream.user_prompt",
            payload: { sessionId: conversationId, prompt: event.payload.prompt },
          });
        }
      };

      const onEvent = (e: ServerEvent) => {
        if (conversationId && "sessionId" in e.payload) {
          const payload = e.payload as { sessionId: string };
          payload.sessionId = conversationId;
        }
        emit(e);
      };

      const runnerOptions = {
        prompt: event.payload.prompt,
        agentId: event.payload.agentId,
        session: {
          id: "pending",
          title: event.payload.title,
          status: "running",
          cwd: event.payload.cwd,
        },
        onEvent,
        onSessionUpdate,
        onComplete: (convId: string) => emitSessionRefresh(convId),
      };

      if (isCloud) {
        handle = await runCloudAgent(runnerOptions);
      } else {
        handle = await runLetta(runnerOptions);
      }
    } catch (error) {
      log.error("Failed to start session:", error);
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

    // Per-message mode: prefer payload mode, fall back to runtime state, default cloud
    const mode = event.payload.mode ?? runtimeSession.mode ?? "cloud";
    const isCloud = mode === "cloud";
    log.debug("session.continue", { conversationId, payloadMode: event.payload.mode, runtimeMode: runtimeSession.mode, resolvedMode: mode, isCloud });
    if (event.payload.cwd) addRecentCwd(event.payload.cwd);

    updateSession(conversationId, { status: "running", mode });
    emit({
      type: "session.status",
      payload: { sessionId: conversationId, status: "running" },
    });

    emit({
      type: "stream.user_prompt",
      payload: { sessionId: conversationId, prompt: event.payload.prompt },
    });

    try {
      // Ensure cloud infra exists when switching to cloud mid-session
      if (isCloud && runtimeSession.agentId) {
        await ensureCloudReady(runtimeSession.agentId);
      }

      const runnerOptions = {
        prompt: event.payload.prompt,
        session: {
          id: conversationId,
          title: conversationId,
          status: "running",
          cwd: event.payload.cwd,
        },
        resumeConversationId: conversationId,
        onEvent: emit,
        onSessionUpdate: () => {},
        onComplete: (convId: string) => emitSessionRefresh(convId),
      };

      log.debug("session.continue runner", { conversationId, isCloud: isCloud ? "cloud-runner" : "local-runner" });
      const handle = isCloud
        ? await runCloudAgent(runnerOptions)
        : await runLetta(runnerOptions);
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
    log.debug("approval.response", { sessionId: event.payload.sessionId, approvalCount: event.payload.approvals.length });
    const { sessionId, approvals } = event.payload;

    emit({
      type: "session.status",
      payload: { sessionId, status: "running" },
    });

    try {
      await sendApprovalResponse(sessionId, approvals);
      // After approval, refresh from REST to get the true state
      await emitSessionRefresh(sessionId);
    } catch (error) {
      log.error("Failed to send approval response:", error);
      emit({
        type: "session.status",
        payload: { sessionId, status: "error", error: String(error) },
      });
    }
    return;
  }

  // --- Folder / File management ---

  if (event.type === "folder.list") {
    try {
      const folders = await listFolders();
      emit({ type: "folder.list", payload: { folders } });
    } catch (error) {
      log.error("Failed to list folders:", error);
      emit({ type: "folder.list", payload: { folders: [] } });
    }
    return;
  }

  if (event.type === "folder.create") {
    try {
      const folder = await createFolder(event.payload.name, {
        description: event.payload.description,
        instructions: event.payload.instructions,
        embedding: event.payload.embedding,
      });
      emit({ type: "folder.created", payload: folder });
    } catch (error) {
      log.error("Failed to create folder:", error);
      emit({ type: "runner.error", payload: { message: `Failed to create folder: ${error}` } });
    }
    return;
  }

  if (event.type === "folder.update") {
    try {
      const folder = await updateFolder(event.payload.folderId, {
        name: event.payload.name,
        description: event.payload.description,
        instructions: event.payload.instructions,
      });
      emit({ type: "folder.updated", payload: folder });
    } catch (error) {
      log.error("Failed to update folder:", error);
      emit({ type: "runner.error", payload: { message: `Failed to update folder: ${error}` } });
    }
    return;
  }

  if (event.type === "folder.delete") {
    try {
      await deleteFolder(event.payload.folderId);
      emit({ type: "folder.deleted", payload: { folderId: event.payload.folderId } });
    } catch (error) {
      log.error("Failed to delete folder:", error);
      emit({ type: "runner.error", payload: { message: `Failed to delete folder: ${error}` } });
    }
    return;
  }

  if (event.type === "folder.files") {
    try {
      const files = await listFiles(event.payload.folderId);
      emit({ type: "folder.files", payload: { folderId: event.payload.folderId, files } });
    } catch (error) {
      log.error("Failed to list files:", error);
      emit({ type: "folder.files", payload: { folderId: event.payload.folderId, files: [] } });
    }
    return;
  }

  if (event.type === "folder.upload") {
    try {
      const file = await uploadFile(event.payload.folderId, event.payload.filePath);
      emit({ type: "folder.file.uploaded", payload: { folderId: event.payload.folderId, file } });
    } catch (error) {
      log.error("Failed to upload file:", error);
      emit({ type: "runner.error", payload: { message: `Failed to upload file: ${error}` } });
    }
    return;
  }

  if (event.type === "folder.file.delete") {
    try {
      await deleteFile(event.payload.folderId, event.payload.fileId);
      emit({ type: "folder.file.deleted", payload: { folderId: event.payload.folderId, fileId: event.payload.fileId } });
    } catch (error) {
      log.error("Failed to delete file:", error);
      emit({ type: "runner.error", payload: { message: `Failed to delete file: ${error}` } });
    }
    return;
  }

  if (event.type === "folder.agents") {
    try {
      const agentIds = await listFolderAgents(event.payload.folderId);
      emit({ type: "folder.agents", payload: { folderId: event.payload.folderId, agentIds } });
    } catch (error) {
      log.error("Failed to list folder agents:", error);
      emit({ type: "folder.agents", payload: { folderId: event.payload.folderId, agentIds: [] } });
    }
    return;
  }

  if (event.type === "folder.attach") {
    try {
      await attachFolderToAgent(event.payload.folderId, event.payload.agentId);
      emit({ type: "folder.attached", payload: { folderId: event.payload.folderId, agentId: event.payload.agentId } });
    } catch (error) {
      log.error("Failed to attach folder:", error);
      emit({ type: "runner.error", payload: { message: `Failed to attach folder: ${error}` } });
    }
    return;
  }

  if (event.type === "folder.detach") {
    try {
      await detachFolderFromAgent(event.payload.folderId, event.payload.agentId);
      emit({ type: "folder.detached", payload: { folderId: event.payload.folderId, agentId: event.payload.agentId } });
    } catch (error) {
      log.error("Failed to detach folder:", error);
      emit({ type: "runner.error", payload: { message: `Failed to detach folder: ${error}` } });
    }
    return;
  }

  if (event.type === "embedding_models.list") {
    try {
      const models = await listEmbeddingModels();
      emit({ type: "embedding_models.list", payload: { models } });
    } catch (error) {
      log.error("Failed to list embedding models:", error);
      emit({ type: "embedding_models.list", payload: { models: [] } });
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
