import { join, dirname } from "node:path";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createAgent } from "@letta-ai/letta-code-sdk";
import { updateAgent } from "./letta-api.js";
import { installSkillsForAgent, getSkillsDir } from "./skill-installer.js";
import { getLettaClient } from "./letta-client.js";
import { isDev } from "../util.js";
import { createLogger } from "./logger.js";
import type { AgentInfo, AppRepoConfig } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger("agent-store");

// Re-export AgentInfo as the canonical agent type (replaces old AgentEntry)
export type AgentEntry = AgentInfo;

/**
 * Transform a Letta server AgentState into our AgentInfo.
 * Reads UI metadata (icon, color) from agent.metadata and
 * sandbox ID from agent.secrets.
 */
function agentStateToInfo(agent: any): AgentInfo {
  const sandboxSecret = agent.secrets?.find((s: any) => s.key === "SANDBOX_ID");
  return {
    lettaAgentId: agent.id,
    name: agent.name ?? "Unnamed Agent",
    icon: agent.metadata?.icon ?? "bot",
    color: agent.metadata?.color ?? "#3B28CC",
    model: agent.model ?? undefined,
    createdAt: agent.created_at ?? new Date().toISOString(),
    sandboxId: sandboxSecret?.value,
    appConfig: agent.metadata?.appConfig,
  };
}

/**
 * Fetch all agents from the Letta server and transform to AgentInfo[].
 * Includes secrets so we can extract SANDBOX_ID.
 */
export async function fetchAgents(): Promise<AgentInfo[]> {
  const client = getLettaClient();
  const page = await client.agents.list({ include: ["agent.secrets"] });
  return page.items.map(agentStateToInfo);
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

/**
 * Provision cloud infra for an agent: create Daytona sandbox, upload skills, attach tools.
 * Shared by both createNewAgent and ensureCloudReady.
 */
async function provisionCloud(lettaAgentId: string, agentName: string, language?: string): Promise<string> {
  const { createSandbox } = await import("./daytona.js");
  const { attachSandboxToolsToAgent } = await import("./sandbox-tools.js");
  const result = await createSandbox(agentName, { language });

  const skills = await uploadSkillsToSandbox(result.sandboxId);
  await populateSkillsBlock(lettaAgentId, skills);
  await attachSandboxToolsToAgent(lettaAgentId, result.sandboxId);

  return result.sandboxId;
}

/**
 * Create a new agent: SDK create → install skills → set name + metadata on server → cloud provision.
 * No local persistence — server is the single source of truth.
 */
export async function createNewAgent(opts: {
  name: string;
  icon: string;
  color: string;
  model?: string;
  appConfig?: AppRepoConfig;
}): Promise<AgentInfo> {
  const lettaAgentId = await createAgent(
    opts.model ? { model: opts.model } : undefined
  );

  // Always install skills locally (for local mode)
  installSkillsForAgent(lettaAgentId);

  // Set name and UI metadata on server
  await updateAgent(lettaAgentId, {
    name: opts.name,
    metadata: {
      icon: opts.icon,
      color: opts.color,
      ...(opts.appConfig ? { appConfig: opts.appConfig } : {}),
    },
  }).catch((err) =>
    log.warn("Failed to set agent name/metadata on server:", err)
  );

  // Always set up cloud (Daytona sandbox + skills + tools) so mode switching is instant
  let sandboxId: string | undefined;
  const language = opts.appConfig ? "javascript" : undefined;
  try {
    sandboxId = await provisionCloud(lettaAgentId, opts.name, language);
  } catch (err) {
    log.warn("Cloud setup failed (agent will work in local mode only):", err);
  }

  log.debug("Created agent", { name: opts.name, lettaAgentId, sandboxId });
  return {
    name: opts.name,
    lettaAgentId,
    icon: opts.icon,
    color: opts.color,
    model: opts.model,
    createdAt: new Date().toISOString(),
    sandboxId,
    appConfig: opts.appConfig,
  };
}

/** Read skill metadata from local directories (no sandbox interaction). */
function readLocalSkillMetadata(): { id: string; name: string; description: string }[] {
  const skillMap = new Map<string, { id: string; name: string; description: string }>();

  for (const dir of [getBuiltinSkillsDir(), getSkillsDir()]) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMdPath = join(dir, entry.name, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;
      const content = readFileSync(skillMdPath, "utf-8");
      const { name, description } = parseSkillFrontmatter(content, entry.name);
      skillMap.set(entry.name, { id: entry.name, name, description });
    }
  }

  return Array.from(skillMap.values());
}

/**
 * Ensure an agent is cloud-ready. Provisions sandbox if missing,
 * and always refreshes the skills memory block before cloud runs.
 * Reads sandbox ID from the Letta server secrets (not local JSON).
 */
export async function ensureCloudReady(lettaAgentId: string): Promise<string> {
  log.info("ensureCloudReady", { lettaAgentId });
  const client = getLettaClient();
  const agentState = await client.agents.retrieve(lettaAgentId, { include: ["agent.secrets"] });
  const sandboxSecret = agentState.secrets?.find((s: any) => s.key === "SANDBOX_ID");
  const sandboxId = sandboxSecret?.value;

  if (!sandboxId) {
    log.info("ensureCloudReady: no sandbox, provisioning", { lettaAgentId });
    const newSandboxId = await provisionCloud(lettaAgentId, agentState.name ?? lettaAgentId);
    log.info("ensureCloudReady: provisioned", { lettaAgentId, sandboxId: newSandboxId });
    return newSandboxId;
  }

  // Existing sandbox: check state and start if needed
  const { getDaytonaClient } = await import("./daytona.js");
  const daytona = getDaytonaClient();
  const sandbox = await daytona.get(sandboxId);
  log.info("ensureCloudReady: sandbox state", { sandboxId, state: sandbox.state });

  if (sandbox.state === "started") {
    log.info("ensureCloudReady: sandbox already started", { sandboxId });
  } else if (sandbox.state === "stopped") {
    log.info("ensureCloudReady: starting stopped sandbox", { sandboxId });
    await sandbox.start();
    log.info("ensureCloudReady: sandbox started", { sandboxId });
  } else if (sandbox.state === "error" && sandbox.recoverable) {
    log.info("ensureCloudReady: recovering errored sandbox", { sandboxId });
    await sandbox.recover();
    log.info("ensureCloudReady: recovered, now starting", { sandboxId });
    await sandbox.start();
    log.info("ensureCloudReady: sandbox started after recovery", { sandboxId });
  } else if (sandbox.state === "archived") {
    log.info("ensureCloudReady: recovering archived sandbox", { sandboxId });
    await sandbox.recover();
    log.info("ensureCloudReady: recovered, now starting", { sandboxId });
    await sandbox.start();
    log.info("ensureCloudReady: sandbox started after recovery", { sandboxId });
  } else {
    log.warn("ensureCloudReady: unrecoverable state, reprovisioning", { sandboxId, state: sandbox.state });
    const newSandboxId = await provisionCloud(lettaAgentId, agentState.name ?? lettaAgentId);
    log.info("ensureCloudReady: reprovisioned", { lettaAgentId, sandboxId: newSandboxId });
    return newSandboxId;
  }

  // Refresh skills memory block
  const skills = readLocalSkillMetadata();
  await populateSkillsBlock(lettaAgentId, skills);
  return sandboxId;
}

