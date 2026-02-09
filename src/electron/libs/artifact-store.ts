import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDev } from "../util.js";
import { fetchAgents, createNewAgent } from "./agent-store.js";
import type { ArtifactInfo } from "../types.js";
import { createLogger } from "./logger.js";

const log = createLogger("artifact-store");

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ARTIFACTS_DIR = join(homedir(), ".letta-cowork", "artifacts");

/** Directories to skip when copying bundled artifacts (dev builds, deps) */
const SKIP_DIRS = new Set(["node_modules", "dist", ".parcel-cache"]);
const copyFilter = (src: string): boolean => !SKIP_DIRS.has(src.split("/").pop()!);

function getBundledArtifactsDir(): string {
  if (isDev()) {
    // Dev: src/artifacts/ relative to dist-electron/electron/libs/
    return join(__dirname, "../../../src/artifacts");
  }
  // Production: extraResources/artifacts (copied by electron-builder)
  return join(process.resourcesPath, "artifacts");
}

/** Seed built-in artifacts into user directory, with version-aware upgrades */
export function seedArtifacts(): void {
  const bundledDir = getBundledArtifactsDir();

  if (!existsSync(bundledDir)) {
    log.warn("Bundled artifacts directory not found:", bundledDir);
    return;
  }

  mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const entries = readdirSync(bundledDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const srcManifestPath = join(bundledDir, entry.name, "manifest.json");
    if (!existsSync(srcManifestPath)) continue;

    const dest = join(ARTIFACTS_DIR, entry.name);
    const destManifestPath = join(dest, "manifest.json");

    if (existsSync(dest) && existsSync(destManifestPath)) {
      // Existing install — check version for upgrade
      try {
        const srcManifest = JSON.parse(readFileSync(srcManifestPath, "utf-8"));
        const destManifest = JSON.parse(readFileSync(destManifestPath, "utf-8"));
        const srcVersion = srcManifest.version ?? "0.0.0";
        const destVersion = destManifest.version ?? "0.0.0";

        if (srcVersion <= destVersion) continue; // already up to date

        // Upgrade: preserve agentId from old manifest, copy new files over
        const preservedAgentId = destManifest.agentId;
        cpSync(join(bundledDir, entry.name), dest, { recursive: true, filter: copyFilter });
        if (preservedAgentId) {
          const updatedManifest = JSON.parse(readFileSync(destManifestPath, "utf-8"));
          updatedManifest.agentId = preservedAgentId;
          writeFileSync(destManifestPath, JSON.stringify(updatedManifest, null, 2), "utf-8");
        }
        log.info(`Upgraded "${entry.name}" from ${destVersion} to ${srcVersion}`);
      } catch {
        log.warn(`Failed to check version for "${entry.name}", skipping`);
      }
      continue;
    }

    // Fresh install
    cpSync(join(bundledDir, entry.name), dest, { recursive: true, filter: copyFilter });
    log.info(`Seeded artifact "${entry.name}"`);
  }
}

/** Create Letta agents for artifacts that have agent config but no agentId yet */
export async function ensureArtifactAgents(): Promise<void> {
  if (!existsSync(ARTIFACTS_DIR)) return;

  const entries = readdirSync(ARTIFACTS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = join(ARTIFACTS_DIR, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

      // Skip if no agent config, or agent already created
      if (!manifest.agent || manifest.agentId) continue;

      const agentName = `${manifest.name} maintainer`;

      // Check if agent already exists on server (e.g. from a previous partial run)
      const existingAgents = await fetchAgents();
      const existing = existingAgents.find((a) => a.name === agentName);
      if (existing) {
        // Link existing agent to manifest
        manifest.agentId = existing.lettaAgentId;
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
        log.info(`Linked existing agent "${agentName}" to artifact "${entry.name}"`);
        continue;
      }

      // Use first existing agent's model as fallback, or manifest agent.model
      const model = manifest.agent.model ?? existingAgents[0]?.model;

      const agentEntry = await createNewAgent({
        name: agentName,
        icon: manifest.agent.icon,
        color: manifest.agent.color,
        model,
      });

      // Persist agentId back to manifest
      manifest.agentId = agentEntry.lettaAgentId;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

      log.info(`Created agent "${agentName}" for artifact "${entry.name}"`);
    } catch (err) {
      log.error(`Failed to create agent for "${entry.name}":`, err);
    }
  }
}

/** List all installed artifacts from ~/.letta-cowork/artifacts/ */
export function listArtifacts(): ArtifactInfo[] {
  if (!existsSync(ARTIFACTS_DIR)) return [];

  const artifacts: ArtifactInfo[] = [];
  const entries = readdirSync(ARTIFACTS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = join(ARTIFACTS_DIR, entry.name, "manifest.json");
    if (!existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
      artifacts.push({
        id: manifest.id ?? entry.name,
        name: manifest.name ?? entry.name,
        icon: manifest.icon ?? "clipboard-list",
        agentId: manifest.agentId,
        path: join(ARTIFACTS_DIR, entry.name),
      });
    } catch {
      log.warn(`Failed to parse manifest for "${entry.name}"`);
    }
  }

  return artifacts;
}

function skeletonHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; background: #ffffff; color: #141414; }
    body.dark { background: #1d1d1d; color: #d6d6d6; }
    .container { text-align: center; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 600; }
    p { margin-top: 0.5rem; opacity: 0.6; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${name}</h1>
    <p>Ask the maintainer agent to build this app.</p>
  </div>
  <script>
    window.addEventListener("message", (e) => {
      if (e.data?.type === "theme") {
        document.body.classList.toggle("dark", e.data.value === "dark");
      }
    });
  </script>
</body>
</html>`;
}

/** Create a new artifact with skeleton bundle + manifest + maintainer agent */
export async function createArtifact(opts: {
  name: string;
  icon: string;
  agentIcon: string;
  agentColor: string;
  model?: string;
}): Promise<ArtifactInfo> {
  const id = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const dir = join(ARTIFACTS_DIR, id);
  mkdirSync(dir, { recursive: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manifest: any = {
    id,
    name: opts.name,
    icon: opts.icon,
    version: "1.0.0",
    agent: { icon: opts.agentIcon, color: opts.agentColor },
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  writeFileSync(join(dir, "bundle.html"), skeletonHtml(opts.name), "utf-8");

  const agentEntry = await createNewAgent({
    name: `${opts.name} maintainer`,
    icon: opts.agentIcon,
    color: opts.agentColor,
    model: opts.model,
  });

  manifest.agentId = agentEntry.lettaAgentId;
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

  log.info(`Created artifact "${opts.name}" with agent "${agentEntry.name}"`);
  return { id, name: opts.name, icon: opts.icon, agentId: agentEntry.lettaAgentId, path: dir };
}

/** Resolve the bundle.html path for an artifact, or null if not found */
export function getArtifactBundlePath(artifactId: string): string | null {
  const bundlePath = join(ARTIFACTS_DIR, artifactId, "bundle.html");
  return existsSync(bundlePath) ? bundlePath : null;
}
