/**
 * Daytona client singleton + sandbox creation helpers.
 * Used for creating cloud sandboxes when agents are created in "cloud" mode.
 */

import { Daytona } from "@daytonaio/sdk";
import { createLogger } from "./logger.js";

const log = createLogger("daytona");

let client: Daytona | null = null;

export function resetDaytonaClient(): void {
  client = null;
  log.info("Reset Daytona client singleton");
}

export function getDaytonaClient(): Daytona {
  if (!client) {
    const apiKey = process.env.DAYTONA_API_KEY;
    if (!apiKey) {
      throw new Error("DAYTONA_API_KEY environment variable is required for cloud agents");
    }
    const apiUrl = process.env.DAYTONA_API_URL;
    client = new Daytona({ apiKey, ...(apiUrl ? { apiUrl } : {}) });
    log.info("Initialized Daytona client", { apiUrl: apiUrl || "(default)" });
  }
  return client;
}

/**
 * Create a Daytona sandbox for a cloud agent.
 * Returns the sandbox ID for storing in the agent entry.
 */
export async function createSandbox(
  agentName: string,
  opts?: { language?: string; envVars?: Record<string, string> },
): Promise<{ sandboxId: string }> {
  const daytona = getDaytonaClient();
  log.info("Creating sandbox for agent:", agentName);

  const sandbox = await daytona.create({
    language: opts?.language ?? "python",
    envVars: { AGENT_NAME: agentName, ...opts?.envVars },
  });

  log.info("Sandbox created:", { sandboxId: sandbox.id, agentName });
  return { sandboxId: sandbox.id };
}

/** Get an existing sandbox by ID */
export async function getSandbox(sandboxId: string) {
  const daytona = getDaytonaClient();
  return daytona.get(sandboxId);
}

