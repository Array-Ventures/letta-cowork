/**
 * Cloud-native app manager for Daytona sandboxes.
 * Apps run inside Daytona sandboxes: git clone → install → dev server → preview URL.
 */

import { getSandbox } from "./daytona.js";
import { createLogger } from "./logger.js";
import type { AppRepoConfig } from "../types.js";

const log = createLogger("app-manager");

const APP_DIR = "/home/daytona/app";
const DEV_SERVER_SESSION = "dev-server";

/** Clone the app git repo into the sandbox at /home/daytona/app */
export async function cloneAppRepo(
  sandbox: any,
  repoUrl: string,
  branch?: string,
): Promise<void> {
  // Check if app dir already has a git repo (already cloned from a previous session)
  const check = await sandbox.process.executeCommand(`test -d ${APP_DIR}/.git && echo exists || echo missing`);
  if (check.result?.trim() === "exists") {
    log.info("Repo already cloned, pulling latest...", { sandboxId: sandbox.id });
    try {
      await sandbox.git.pull(APP_DIR);
    } catch (err) {
      log.warn("git pull failed (may be fine if no upstream configured):", err);
    }
    return;
  }

  log.info("Cloning repo", { repoUrl, branch: branch ?? "default", sandboxId: sandbox.id });
  await sandbox.git.clone(repoUrl, APP_DIR, branch);
  log.info("Clone complete", { sandboxId: sandbox.id });
}

/** Install dependencies in the sandbox */
export async function installAppDeps(
  sandbox: any,
  installCommand: string,
): Promise<boolean> {
  log.info("Installing deps", { sandboxId: sandbox.id, installCommand });

  const result = await sandbox.process.executeCommand(installCommand, APP_DIR, undefined, 300);
  const success = result.exitCode === 0;

  if (!success) {
    log.error(`Install failed (exit ${result.exitCode}):`, result.result);
  } else {
    log.info("Install complete", { sandboxId: sandbox.id });
  }
  return success;
}

/** Start the dev server as a persistent background session */
export async function startDevServer(
  sandbox: any,
  startCommand: string,
): Promise<string> {
  // Clean up stale session if it exists
  try {
    const sessions = await sandbox.process.listSessions();
    if (sessions.some((s: any) => s.sessionId === DEV_SERVER_SESSION)) {
      await sandbox.process.deleteSession(DEV_SERVER_SESSION);
    }
  } catch {
    // Session doesn't exist, fine
  }

  log.info("Starting dev server", { sandboxId: sandbox.id, startCommand });
  await sandbox.process.createSession(DEV_SERVER_SESSION);
  const resp = await sandbox.process.executeSessionCommand(DEV_SERVER_SESSION, {
    command: `cd ${APP_DIR} && ${startCommand}`,
    runAsync: true,
  });

  log.info("Dev server started", { sandboxId: sandbox.id, cmdId: resp.cmdId });
  return resp.cmdId ?? DEV_SERVER_SESSION;
}

/** Stop the dev server session */
export async function stopDevServer(sandboxId: string): Promise<void> {
  const sandbox = await getSandbox(sandboxId);
  try {
    await sandbox.process.deleteSession(DEV_SERVER_SESSION);
    log.info("Dev server stopped", { sandboxId });
  } catch (err) {
    log.warn("Failed to stop dev server", { sandboxId, error: err });
  }
}

/** Check if the dev server session exists */
export async function isDevServerRunning(sandboxId: string): Promise<boolean> {
  const sandbox = await getSandbox(sandboxId);
  try {
    const sessions = await sandbox.process.listSessions();
    return sessions.some((s: any) => s.sessionId === DEV_SERVER_SESSION);
  } catch {
    return false;
  }
}

/** Get a signed preview URL for the app's port (default TTL = 1 hour) */
export async function getAppPreviewUrl(
  sandboxId: string,
  port: number,
  ttlSeconds = 3600,
): Promise<{ url: string; token: string; expiresAt: number }> {
  const sandbox = await getSandbox(sandboxId);
  const signed = await sandbox.getSignedPreviewUrl(port, ttlSeconds);
  return {
    url: signed.url,
    token: signed.token,
    expiresAt: Date.now() + ttlSeconds * 1000,
  };
}

/** Poll until the dev server is listening on the port (max 30s) */
async function waitForPort(sandbox: any, port: number): Promise<void> {
  const maxAttempts = 30;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const result = await sandbox.process.executeCommand(
        `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port} 2>/dev/null || echo 000`
      );
      const code = result.result?.trim();
      if (code && /^[1-5]\d{2}$/.test(code)) {
        log.info("Dev server ready", { sandboxId: sandbox.id, port, attempt: i, httpCode: code });
        return;
      }
    } catch {
      // Command failed, server not ready yet
    }
    if (i < maxAttempts) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  log.warn("Dev server did not respond within 30s, proceeding anyway", { sandboxId: sandbox.id, port });
}

/**
 * Full setup pipeline: clone → install → start dev server → get preview URL.
 * Fetches the sandbox once and passes it through the pipeline.
 * Idempotent — safe to call on already-set-up sandboxes.
 */
export async function setupAndStartApp(
  sandboxId: string,
  appConfig: AppRepoConfig,
): Promise<{ previewUrl: string; token: string }> {
  const sandbox = await getSandbox(sandboxId);

  // 1. Clone (or pull if already cloned)
  await cloneAppRepo(sandbox, appConfig.repoUrl, appConfig.branch);

  // 2. Install dependencies
  const installed = await installAppDeps(sandbox, appConfig.installCommand);
  if (!installed) {
    throw new Error("Dependency installation failed");
  }

  // 3. Start dev server
  await startDevServer(sandbox, appConfig.startCommand);

  // 4. Wait for dev server to bind the port
  await waitForPort(sandbox, appConfig.port);

  // 5. Get preview URL
  const preview = await getAppPreviewUrl(sandboxId, appConfig.port);
  log.info("App ready", { sandboxId, previewUrl: preview.url });

  return { previewUrl: preview.url, token: preview.token };
}
