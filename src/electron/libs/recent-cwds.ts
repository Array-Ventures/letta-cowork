import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const STORE_DIR = join(homedir(), ".letta-cowork");
const STORE_PATH = join(STORE_DIR, "recent-cwds.json");
const MAX_RECENT = 10;

function ensureDir() {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

export function getRecentCwds(): string[] {
  ensureDir();
  if (!existsSync(STORE_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Add a CWD to the front of the recent list (deduped, capped at MAX_RECENT). */
export function addRecentCwd(cwd: string) {
  if (!cwd.trim()) return;
  ensureDir();
  const list = getRecentCwds().filter((p) => p !== cwd);
  list.unshift(cwd);
  if (list.length > MAX_RECENT) list.length = MAX_RECENT;
  writeFileSync(STORE_PATH, JSON.stringify(list, null, 2), "utf-8");
}
