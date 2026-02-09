import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { createLogger } from "./logger.js";
import type { AppConfig } from "../types.js";

const log = createLogger("config-store");

const STORE_DIR = join(homedir(), ".letta-cowork");
const CONFIG_PATH = join(STORE_DIR, "config.json");

function ensureDir() {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

export function loadConfig(): AppConfig | null {
  try {
    if (!existsSync(CONFIG_PATH)) return null;
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw) as AppConfig;
    log.info("Loaded config from", CONFIG_PATH);
    return config;
  } catch (e) {
    log.warn("Failed to load config:", e);
    return null;
  }
}

export function saveConfig(config: AppConfig): void {
  ensureDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  log.info("Saved config to", CONFIG_PATH);
}

export function deleteConfig(): void {
  try {
    if (existsSync(CONFIG_PATH)) {
      unlinkSync(CONFIG_PATH);
      log.info("Deleted config at", CONFIG_PATH);
    }
  } catch (e) {
    log.warn("Failed to delete config:", e);
  }
}

/**
 * Write config values into process.env so all existing code
 * (letta-client, daytona, sandbox-tools, letta-code-sdk) works unchanged.
 */
export function applyConfigToEnv(config: AppConfig): void {
  process.env.LETTA_BASE_URL = config.letta.baseUrl;
  process.env.LETTA_API_KEY = config.letta.apiKey;
  process.env.DAYTONA_API_KEY = config.daytona.apiKey;
  process.env.DAYTONA_API_URL = config.daytona.apiUrl;
  log.info("Applied config to process.env");
}

/**
 * Redact API keys for sending to renderer (show last 4 chars).
 */
export function redactConfig(config: AppConfig): AppConfig {
  const mask = (key: string) =>
    key.length > 4 ? "•".repeat(key.length - 4) + key.slice(-4) : "••••";
  return {
    ...config,
    letta: { ...config.letta, apiKey: mask(config.letta.apiKey) },
    daytona: { ...config.daytona, apiKey: mask(config.daytona.apiKey) },
  };
}
