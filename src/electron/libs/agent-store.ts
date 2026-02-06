import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";

export type AgentEntry = {
  name: string;
  lettaAgentId: string;
  icon: string;
  color: string;
  model?: string;
  createdAt: string;
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
