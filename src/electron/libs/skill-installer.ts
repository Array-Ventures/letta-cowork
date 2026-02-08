import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDev } from "../util.js";
import { createLogger } from "./logger.js";

const log = createLogger("skill-installer");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getSkillsDir(): string {
  if (isDev()) {
    // Dev: src/skills/ relative to dist-electron/electron/libs/
    return join(__dirname, "../../../src/skills");
  }
  // Production: extraResources/skills (copied by electron-builder)
  return join(process.resourcesPath, "skills");
}

/** Install all bundled skills into an agent's skill directory */
export function installSkillsForAgent(agentId: string): void {
  const skillsDir = getSkillsDir();
  const agentSkillsDir = join(homedir(), ".letta", "agents", agentId, "skills");

  if (!existsSync(skillsDir)) {
    log.warn("Bundled skills directory not found:", skillsDir);
    return;
  }

  mkdirSync(agentSkillsDir, { recursive: true });

  const skills = readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of skills) {
    if (!entry.isDirectory()) continue;

    const src = join(skillsDir, entry.name);
    const dest = join(agentSkillsDir, entry.name);

    if (existsSync(dest)) continue; // already installed

    cpSync(src, dest, { recursive: true });
    log.info(`Installed skill "${entry.name}" for agent ${agentId}`);
  }
}
