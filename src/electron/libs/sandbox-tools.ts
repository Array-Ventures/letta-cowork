/**
 * Python tool source code for Daytona sandbox operations.
 * These tools replicate the letta-code-sdk built-in tools (Bash, Read, Write, Glob, Grep, Edit, Skill)
 * so cloud agents have the same tool interface as local agents.
 * They use the Daytona Python SDK to interact with the sandbox.
 * Agent secrets (SANDBOX_ID, DAYTONA_API_KEY) route to the correct sandbox.
 *
 * Python source is read from src/sandbox-tools/*.py files (not inline strings)
 * so they can be tested independently and avoid JS template literal escaping issues.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getLettaClient } from "./letta-client.js";
import { createLogger } from "./logger.js";
import { isDev } from "../util.js";

const log = createLogger("sandbox-tools");

// pip dependency for all sandbox tools
const PIP_REQUIREMENTS = [{ name: "daytona_sdk" }, { name: "letta_client" }];

// --- Resolve sandbox-tools directory (dev vs production) ---

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getSandboxToolsDir(): string {
  if (isDev()) {
    // Dev: src/sandbox-tools/ relative to dist-electron/electron/libs/
    return join(__dirname, "../../../src/sandbox-tools");
  }
  // Production: extraResources/sandbox-tools (copied by electron-builder)
  return join(process.resourcesPath, "sandbox-tools");
}

function readToolSource(filename: string): string {
  const filePath = join(getSandboxToolsDir(), filename);
  return readFileSync(filePath, "utf-8");
}

// --- Tool name -> source file mapping ---

const TOOL_FILES = [
  { name: "Bash", file: "bash.py" },
  { name: "Read", file: "read.py" },
  { name: "Write", file: "write.py" },
  { name: "Glob", file: "glob.py" },
  { name: "Grep", file: "grep.py" },
  { name: "Edit", file: "edit.py" },
  { name: "Skill", file: "skill.py" },
] as const;

// Cache tool IDs so we only register once per app lifecycle
let cachedToolIds: string[] | null = null;

/**
 * Ensure sandbox tools are registered on the Letta server.
 * Returns tool IDs. Creates tools if they don't exist, reuses if they do.
 */
export async function ensureSandboxTools(): Promise<string[]> {
  if (cachedToolIds) return cachedToolIds;

  const client = getLettaClient();
  const existingPage = await client.tools.list();
  const existingTools = existingPage.items;

  const toolIds: string[] = [];

  for (const def of TOOL_FILES) {
    const source = readToolSource(def.file);

    // Check if tool already exists by name
    const existing = existingTools.find((t) => t.name === def.name);
    if (existing) {
      // Update source code in case it changed
      await client.tools.update(existing.id, {
        source_code: source,
        pip_requirements: PIP_REQUIREMENTS,
      });
      log.debug(`Tool "${def.name}" updated: ${existing.id}`);
      toolIds.push(existing.id);
      continue;
    }

    // Create new tool
    const tool = await client.tools.create({
      source_code: source,
      pip_requirements: PIP_REQUIREMENTS,
    });
    log.info(`Registered tool "${def.name}": ${tool.id}`);
    toolIds.push(tool.id);
  }

  cachedToolIds = toolIds;
  return toolIds;
}

/**
 * Attach sandbox tools to an agent and set its secrets for sandbox routing.
 */
export async function attachSandboxToolsToAgent(
  agentId: string,
  sandboxId: string,
): Promise<void> {
  const client = getLettaClient();
  const toolIds = await ensureSandboxTools();

  // Attach each tool to the agent
  for (const toolId of toolIds) {
    await client.agents.tools.attach(toolId, { agent_id: agentId });
  }
  log.info(`Attached ${toolIds.length} sandbox tools to agent ${agentId}`);

  // Attach Letta built-in web_search tool (Exa-powered)
  const allTools = await client.tools.list();
  const webSearch = allTools.items.find((t) => t.name === "web_search");
  if (webSearch) {
    await client.agents.tools.attach(webSearch.id, { agent_id: agentId });
    log.info(`Attached web_search to agent ${agentId}`);
  } else {
    log.warn("web_search tool not found on server — skipping attachment");
  }

  // Set agent secrets for sandbox routing + Letta API access
  // (client injection doesn't work on self-hosted Docker, so Skill tool constructs its own client)
  const secrets: Record<string, string> = {
    DAYTONA_API_KEY: process.env.DAYTONA_API_KEY!,
    SANDBOX_ID: sandboxId,
    LETTA_BASE_URL: process.env.LETTA_BASE_URL || "http://localhost:8283",
  };
  if (process.env.DAYTONA_API_URL) {
    secrets.DAYTONA_API_URL = process.env.DAYTONA_API_URL;
  }
  if (process.env.LETTA_API_KEY) {
    secrets.LETTA_API_KEY = process.env.LETTA_API_KEY;
  }
  await client.agents.update(agentId, { secrets });
  log.info(`Set sandbox secrets for agent ${agentId} (sandbox: ${sandboxId})`);
}
