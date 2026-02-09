import { getLettaClient } from "./letta-client.js";
import { createLogger } from "./logger.js";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const log = createLogger("letta-folders");

export type FolderInfo = {
  id: string;
  name: string;
  description?: string;
  instructions?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type FileInfo = {
  id: string;
  folderId: string;
  fileName: string;
  fileSize?: number;
  fileType?: string;
  processingStatus?: "pending" | "parsing" | "embedding" | "completed" | "error";
  errorMessage?: string;
  totalChunks?: number;
  chunksEmbedded?: number;
  createdAt?: string;
};

export async function listFolders(): Promise<FolderInfo[]> {
  const client = getLettaClient();
  const page = await client.folders.list({ limit: 100 });
  log.debug("listFolders", { count: page.items.length });
  return page.items.map((f) => ({
    id: f.id,
    name: f.name,
    description: f.description ?? undefined,
    instructions: f.instructions ?? undefined,
    metadata: f.metadata ?? undefined,
    createdAt: f.created_at ?? undefined,
    updatedAt: f.updated_at ?? undefined,
  }));
}

export async function createFolder(
  name: string,
  opts?: { description?: string; instructions?: string; embedding?: string },
): Promise<FolderInfo> {
  const client = getLettaClient();
  const folder = await client.folders.create({
    name,
    ...(opts?.description ? { description: opts.description } : {}),
    ...(opts?.instructions ? { instructions: opts.instructions } : {}),
    ...(opts?.embedding ? { embedding: opts.embedding } : {}),
  });
  log.info("createFolder", { id: folder.id, name: folder.name });
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description ?? undefined,
    instructions: folder.instructions ?? undefined,
    metadata: folder.metadata ?? undefined,
    createdAt: folder.created_at ?? undefined,
    updatedAt: folder.updated_at ?? undefined,
  };
}

export async function updateFolder(
  folderId: string,
  updates: { name?: string; description?: string; instructions?: string },
): Promise<FolderInfo> {
  const client = getLettaClient();
  const folder = await client.folders.update(folderId, {
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.description !== undefined ? { description: updates.description } : {}),
    ...(updates.instructions !== undefined ? { instructions: updates.instructions } : {}),
  });
  log.info("updateFolder", { folderId, updates });
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description ?? undefined,
    instructions: folder.instructions ?? undefined,
    metadata: folder.metadata ?? undefined,
    createdAt: folder.created_at ?? undefined,
    updatedAt: folder.updated_at ?? undefined,
  };
}

export async function deleteFolder(folderId: string): Promise<void> {
  const client = getLettaClient();
  await client.folders.delete(folderId);
  log.info("deleteFolder", { folderId });
}

export async function listFiles(folderId: string): Promise<FileInfo[]> {
  const client = getLettaClient();
  const page = await client.folders.files.list(folderId, { limit: 100 });
  log.debug("listFiles", { folderId, count: page.items.length });
  return page.items.map((f) => ({
    id: f.id,
    folderId: f.source_id ?? folderId,
    fileName: f.file_name ?? "unknown",
    fileSize: f.file_size ?? undefined,
    fileType: f.file_type ?? undefined,
    processingStatus: f.processing_status ?? undefined,
    errorMessage: f.error_message ?? undefined,
    totalChunks: f.total_chunks ?? undefined,
    chunksEmbedded: f.chunks_embedded ?? undefined,
    createdAt: f.created_at ?? undefined,
  }));
}

export async function uploadFile(
  folderId: string,
  filePath: string,
): Promise<FileInfo> {
  const client = getLettaClient();
  const fileName = basename(filePath);
  const fileBuffer = readFileSync(filePath);
  const file = new File([fileBuffer], fileName);

  const result = await client.folders.files.upload(folderId, { file });
  log.info("uploadFile", { folderId, fileName, id: result.id });
  return {
    id: result.id,
    folderId: result.source_id ?? folderId,
    fileName: result.file_name ?? fileName,
    fileSize: result.file_size ?? undefined,
    fileType: result.file_type ?? undefined,
    processingStatus: result.processing_status ?? undefined,
    errorMessage: result.error_message ?? undefined,
    totalChunks: result.total_chunks ?? undefined,
    chunksEmbedded: result.chunks_embedded ?? undefined,
    createdAt: result.created_at ?? undefined,
  };
}

export async function deleteFile(
  folderId: string,
  fileId: string,
): Promise<void> {
  const client = getLettaClient();
  await client.folders.files.delete(fileId, { folder_id: folderId });
  log.info("deleteFile", { folderId, fileId });
}

export async function listFolderAgents(
  folderId: string,
): Promise<string[]> {
  const client = getLettaClient();
  const result = await client.folders.agents.list(folderId);
  log.debug("listFolderAgents", { folderId, count: result.length });
  return result;
}

export async function attachFolderToAgent(
  folderId: string,
  agentId: string,
): Promise<void> {
  const client = getLettaClient();
  await client.agents.folders.attach(folderId, { agent_id: agentId });
  log.info("attachFolderToAgent", { folderId, agentId });
}

export async function detachFolderFromAgent(
  folderId: string,
  agentId: string,
): Promise<void> {
  const client = getLettaClient();
  await client.agents.folders.detach(folderId, { agent_id: agentId });
  log.info("detachFolderFromAgent", { folderId, agentId });
}

export async function listEmbeddingModels(): Promise<
  { handle: string; name: string; provider_type: string }[]
> {
  const client = getLettaClient();
  const models = await client.models.embeddings.list();
  return models.map((m) => ({
    handle: m.handle ?? "",
    name: m.name,
    provider_type: m.provider_type,
  }));
}
