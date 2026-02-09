import { join, dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createAgent } from "@letta-ai/letta-code-sdk";
import { updateAgent } from "./letta-api.js";
import { installSkillsForAgent, getSkillsDir } from "./skill-installer.js";
import { getLettaClient } from "./letta-client.js";
import { isDev } from "../util.js";
import { createLogger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger("agent-store");

export type AgentEntry = {
  name: string;
  lettaAgentId: string;
  icon: string;
  color: string;
  model?: string;
  createdAt: string;
  type?: "local" | "cloud";
  sandboxId?: string;
};

type AgentStoreData = {
  agents: AgentEntry[];
};

const STORE_DIR = join(homedir(), ".letta-cowork");
const STORE_PATH = join(STORE_DIR, "agents.json");

function ensureDir() {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function readStore(): AgentStoreData {
  ensureDir();
  if (!existsSync(STORE_PATH)) {
    return { agents: [] };
  }
  try {
    return JSON.parse(readFileSync(STORE_PATH, "utf-8"));
  } catch {
    return { agents: [] };
  }
}

function writeStore(data: AgentStoreData) {
  ensureDir();
  writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function loadAgents(): AgentEntry[] {
  return readStore().agents;
}

export function saveAgent(entry: AgentEntry): void {
  const data = readStore();
  data.agents.push(entry);
  writeStore(data);
}

export function deleteAgent(lettaAgentId: string): void {
  const data = readStore();
  data.agents = data.agents.filter((a) => a.lettaAgentId !== lettaAgentId);
  writeStore(data);
}

export function renameAgent(lettaAgentId: string, newName: string): void {
  const data = readStore();
  const agent = data.agents.find((a) => a.lettaAgentId === lettaAgentId);
  if (agent) {
    agent.name = newName;
    writeStore(data);
  }
}

/**
 * Get the SDK's built-in skills directory (node_modules/@letta-ai/letta-code/skills/).
 * These are the 11 skills shipped with the letta-code package.
 */
function getBuiltinSkillsDir(): string {
  if (isDev()) {
    // Dev: node_modules relative to dist-electron/electron/libs/
    return join(__dirname, "../../../node_modules/@letta-ai/letta-code/skills");
  }
  // Production: asar-unpacked (already in asarUnpack config for @letta-ai/letta-code)
  return join(process.resourcesPath, "app.asar.unpacked/node_modules/@letta-ai/letta-code/skills");
}

/**
 * Parse SKILL.md frontmatter for name and description.
 */
function parseSkillFrontmatter(content: string, fallbackName: string): { name: string; description: string } {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let name = fallbackName;
  let description = "No description available";
  if (fmMatch) {
    const fm = fmMatch[1];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    const descMatch = fm.match(/^description:\s*["']?(.+?)["']?\s*$/m);
    if (nameMatch) name = nameMatch[1].trim();
    if (descMatch) description = descMatch[1].trim();
  }
  return { name, description };
}

/**
 * Upload skills from a directory to a Daytona sandbox.
 * Only uploads SKILL.md files (not scripts/, references/, etc.).
 */
async function uploadSkillsDirToSandbox(
  sandbox: any,
  localDir: string,
  sandboxId: string,
): Promise<{ id: string; name: string; description: string }[]> {
  if (!existsSync(localDir)) {
    log.debug("Skills directory not found:", localDir);
    return [];
  }

  const entries = readdirSync(localDir, { withFileTypes: true });
  const skills: { id: string; name: string; description: string }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillMdPath = join(localDir, entry.name, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    const content = readFileSync(skillMdPath, "utf-8");

    // Create dir in sandbox and upload SKILL.md
    const sandboxDir = `/home/daytona/.skills/${entry.name}`;
    const sandboxPath = `${sandboxDir}/SKILL.md`;
    await sandbox.process.executeCommand(`mkdir -p ${sandboxDir}`);
    await sandbox.fs.uploadFile(Buffer.from(content, "utf-8"), sandboxPath);
    log.info(`Uploaded skill "${entry.name}" to sandbox ${sandboxId}`);

    const { name, description } = parseSkillFrontmatter(content, entry.name);
    skills.push({ id: entry.name, name, description });
  }

  return skills;
}

/**
 * Upload all skills (built-in SDK + project bundled) to a Daytona sandbox.
 * Built-in SDK skills are uploaded first, then project skills override if same ID.
 */
async function uploadSkillsToSandbox(sandboxId: string): Promise<{ id: string; name: string; description: string }[]> {
  const { getDaytonaClient } = await import("./daytona.js");
  const daytona = getDaytonaClient();
  const sandbox = await daytona.get(sandboxId);

  // Upload built-in SDK skills first (11 skills from @letta-ai/letta-code)
  const builtinDir = getBuiltinSkillsDir();
  const builtinSkills = await uploadSkillsDirToSandbox(sandbox, builtinDir, sandboxId);

  // Upload project-bundled skills (override if same ID)
  const projectDir = getSkillsDir();
  const projectSkills = await uploadSkillsDirToSandbox(sandbox, projectDir, sandboxId);

  // Merge: project skills override built-in if same ID
  const skillMap = new Map<string, { id: string; name: string; description: string }>();
  for (const s of builtinSkills) skillMap.set(s.id, s);
  for (const s of projectSkills) skillMap.set(s.id, s);

  return Array.from(skillMap.values());
}

/**
 * Populate the agent's `skills` memory block via Letta REST API.
 * Matches SDK's formatSkillsWithMetadata() output format.
 */
async function populateSkillsBlock(agentId: string, skills: { id: string; name: string; description: string }[]): Promise<void> {
  const client = getLettaClient();
  const skillsDir = "/home/daytona/.skills";

  let formatted = `Skills Directory: ${skillsDir}\n\n`;

  if (skills.length === 0) {
    formatted += "[NO SKILLS AVAILABLE]";
  } else {
    formatted += "Available Skills:\n\n";
    for (const skill of skills) {
      formatted += `### ${skill.name} (bundled)\n`;
      formatted += `ID: \`${skill.id}\`\n`;
      formatted += `Description: ${skill.description}\n\n`;
    }
  }

  await client.agents.blocks.update("skills", { agent_id: agentId, value: formatted.trim() });
  log.info(`Populated skills block for agent ${agentId} (${skills.length} skills)`);

  // Reset loaded_skills block to clean state
  await client.agents.blocks.update("loaded_skills", { agent_id: agentId, value: "No skills currently loaded." });
  log.info(`Reset loaded_skills block for agent ${agentId}`);
}

/** Shared agent creation: SDK create → install skills → set name → save to store */
export async function createAndSaveAgent(opts: {
  name: string;
  icon: string;
  color: string;
  model?: string;
  type?: "local" | "cloud";
}): Promise<AgentEntry> {
  const lettaAgentId = await createAgent(
    opts.model ? { model: opts.model } : undefined
  );

  // Only install skills locally for local agents
  if (opts.type !== "cloud") {
    installSkillsForAgent(lettaAgentId);
  }

  await updateAgent(lettaAgentId, { name: opts.name }).catch((err) =>
    log.warn("Failed to set agent name on server:", err)
  );

  let sandboxId: string | undefined;

  // Cloud mode: create Daytona sandbox + upload skills + attach tools
  if (opts.type === "cloud") {
    const { createSandbox } = await import("./daytona.js");
    const { attachSandboxToolsToAgent } = await import("./sandbox-tools.js");
    const result = await createSandbox(opts.name);

    // Upload bundled skills to sandbox filesystem
    const skills = await uploadSkillsToSandbox(result.sandboxId);

    // Populate skills block and reset loaded_skills block
    await populateSkillsBlock(lettaAgentId, skills);

    await attachSandboxToolsToAgent(lettaAgentId, result.sandboxId);
    sandboxId = result.sandboxId;
  }

  log.debug("Created agent", { name: opts.name, lettaAgentId, type: opts.type ?? "local", sandboxId });
  const entry: AgentEntry = {
    name: opts.name,
    lettaAgentId,
    icon: opts.icon,
    color: opts.color,
    model: opts.model,
    createdAt: new Date().toISOString(),
    type: opts.type ?? "local",
    sandboxId,
  };
  saveAgent(entry);
  return entry;
}
