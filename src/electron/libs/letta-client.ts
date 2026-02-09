import { Letta } from "@letta-ai/letta-client";
import { createLogger } from "./logger.js";

const log = createLogger("letta-client");

let client: Letta | null = null;

export function getLettaClient(): Letta {
  if (!client) {
    const baseURL = process.env.LETTA_BASE_URL || "http://localhost:8283";
    const apiKey = process.env.LETTA_API_KEY;
    client = new Letta({ baseURL, ...(apiKey ? { apiKey } : {}) });
    log.info("Initialized client", { baseURL });
  }
  return client;
}

export function resetLettaClient(): void {
  client = null;
  log.info("Reset client singleton");
}
