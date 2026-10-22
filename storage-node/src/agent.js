import { mkdir, readFile, readdir, realpath, rename, stat, statfs, writeFile, copyFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const DEFAULT_API_BASE = "https://kzdoc.onrender.com/api/v1";
const HEARTBEAT_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const VAULT_SYNC_INTERVAL_MS = 15 * 60_000;
const SHARED_STORAGE_DIR = join(homedir(), "storage", "shared");

export function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error("A configuração do nó deve ser um objeto JSON.");
  }
  const apiBase = config.apiBase ?? DEFAULT_API_BASE;
  const nodeId = config.nodeId;
  const nodeToken = config.nodeToken;
  if (typeof apiBase !== "string") throw new Error("apiBase inválido.");
  const parsed = new URL(apiBase);
  if (parsed.protocol !== "https:" && parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error("A API do nó deve usar HTTPS fora de localhost.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("apiBase não pode conter credenciais, query ou fragmento.");
  }
  if (typeof nodeId !== "string" || !/^[0-9a-f-]{36}$/i.test(nodeId)) {
    throw new Error("nodeId inválido.");
  }
  if (typeof nodeToken !== "string" || !/^knode_[A-Za-z0-9_-]{50,100}$/.test(nodeToken)) {
    throw new Error("nodeToken inválido.");
  }
  return { apiBase: apiBase.replace(/\/+$/, ""), nodeId, nodeToken };
}

export async function loadConfig(configPath = join(homedir(), ".config", "korczak-nexus", "node.json")) {
  const info = await stat(configPath);
  if (!info.isFile()) throw new Error("O arquivo de configuração do nó não é um arquivo regular.");
  if (process.platform !== "win32" && (info.mode & 0o077) !== 0) {
    throw new Error("Permissões inseguras no arquivo de configuração; execute chmod 600 no arquivo.");
  }
  const parsed = JSON.parse(await readFile(configPath, "utf8"));
  return validateConfig(parsed);
}

async function resolveNexusRoot() {
  let sharedRoot;
  try {
    sharedRoot = await realpath(SHARED_STORAGE_DIR);
  } catch {
    throw new Error("Armazenamento compartilhado do Android indisponível. Execute termux-setup-storage e conceda a permissão de arquivos.");
  }
  if (sharedRoot !== "/storage/emulated/0" && sharedRoot !== "/storage/self/primary") {
    throw new Error("O caminho de armazenamento compartilhado não aponta para a memória interna do Android.");
  }
  return join(sharedRoot, ".vault");
}

function safePathSegment(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error("Identificador inválido para diretório de " + label + ".");
  }
  return value;
}

export const VAULT_PRODUCTS = Object.freeze(["Nexus", "Nexa", "Veya", "Korvo", "Klash", "Acta", "Web", "People", "Memo", "Meet", "Pulse", "Chrona", "Formly"]);

export function safeVaultProduct(value) {
  const product = String(value || "Nexus");
  if (!VAULT_PRODUCTS.includes(product)) throw new Error("Produto inválido para diretório do Vault.");
  return product;
}

export function getUserDocumentsDir(userId, vaultRoot = join(SHARED_STORAGE_DIR, ".vault")) {
  // Kept as a directory helper for callers; the product folder is appended by the write path.
  return join(vaultRoot, "usuarios", safePathSegment(userId, "usuário"));
}

export async function readStorageMetrics(storageDir, nodeId) {
  const targetDir = storageDir ?? await resolveNexusRoot();
  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  await mkdir(join(targetDir, "usuarios"), { recursive: true, mode: 0o700 });
  await mkdir(join(targetDir, "system"), { recursive: true, mode: 0o700 });
  if (nodeId) await mkdir(join(targetDir, "system", "nodes", safePathSegment(nodeId, "nó")), { recursive: true, mode: 0o700 });
  const fs = await statfs(targetDir);
  return { free_bytes: Number(fs.bavail) * Number(fs.bsize), total_bytes: Number(fs.blocks) * Number(fs.bsize), internet_connected: true };
}

export async function sendHeartbeat(config, fetchImpl = globalThis.fetch, metrics = { free_bytes: 0, total_bytes: 0, internet_connected: true }) {
  const endpoint = `${config.apiBase}/storage/nodes/${encodeURIComponent(config.nodeId)}/heartbeat`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.nodeToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metrics),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error("Credencial do nó inválida ou revogada; o agente será encerrado.");
    error.permanent = true;
    throw error;
  }
  if (!response.ok) {
    const details = typeof response.text === "function" ? await response.text().catch(() => "") : "";
    throw new Error(`Heartbeat recusado pela API (HTTP ${response.status})${details ? ": " + details.slice(0, 300) : ""}.`);
  }
  const payload = await response.json();
  if (payload.node_id !== config.nodeId || payload.status !== "online") {
    throw new Error("Resposta de heartbeat inesperada.");
  }
  return payload;
}

export async function provisionVaultUsers(config, { fetchImpl = globalThis.fetch, vaultRoot, log = console } = {}) {
  const root = vaultRoot || await resolveNexusRoot();
  const response = await fetchImpl(`${config.apiBase}/storage/nodes/${encodeURIComponent(config.nodeId)}/vault-users`, {
    method: "GET",
    headers: { Authorization: "Bearer " + config.nodeToken, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error("Credencial do nó inválida ou revogada durante a sincronização de usuários.");
    error.permanent = true;
    throw error;
  }
  if (!response.ok) throw new Error("Não foi possível sincronizar usuários do Vault (HTTP " + response.status + ").");
  const payload = await response.json();
  if (!Array.isArray(payload.user_ids)) throw new Error("Resposta inválida na sincronização de usuários do Vault.");
  await mkdir(join(root, "usuarios"), { recursive: true, mode: 0o700 });
  await mkdir(join(root, "system"), { recursive: true, mode: 0o700 });
  let provisioned = 0;
  for (const rawId of payload.user_ids) {
    const userId = safePathSegment(String(rawId), "usuário");
    const userRoot = join(root, "usuarios", userId);
    await mkdir(userRoot, { recursive: true, mode: 0o700 });
    await Promise.all(VAULT_PRODUCTS.map(product => mkdir(join(userRoot, product), { recursive: true, mode: 0o700 })));
    provisioned += 1;
  }

  // One-time, non-destructive migration: copy legacy Nexus files into the new Nexus product folder.
  // Originals are retained so this migration cannot destroy existing user data.
  const legacyRoot = join(await realpath(SHARED_STORAGE_DIR), ".Nexus", "users");
  try {
    const legacyUsers = await readdir(legacyRoot, { withFileTypes: true });
    for (const entry of legacyUsers) {
      if (!entry.isDirectory() || !/^[A-Za-z0-9_-]{1,128}$/.test(entry.name)) continue;
      const oldDocs = join(legacyRoot, entry.name, "documents");
      const newDocs = join(root, "usuarios", entry.name, "Nexus");
      await mkdir(newDocs, { recursive: true, mode: 0o700 });
      let files = [];
      try { files = await readdir(oldDocs, { withFileTypes: true }); } catch { continue; }
      for (const file of files) {
        if (!file.isFile()) continue;
        const source = join(oldDocs, file.name);
        let destinationName = safeStoredFilename(file.name);
        const match = destinationName.match(/^(.*?)-([0-9a-f]{8}-[0-9a-f-]{27})\.nsx$/i);
        if (!match) {
          const base = destinationName.replace(/\.nsx$/i, "");
          destinationName = base + "-legacy-" + Buffer.from(file.name).toString("hex").slice(0, 12) + ".nsx";
        }
        const destination = join(newDocs, destinationName);
        try { await stat(destination); } catch { await copyFile(source, destination); }
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  log.info?.(`Vault sincronizado: ${provisioned} usuários, ${VAULT_PRODUCTS.length} pastas por usuário.`);
  return { users: provisioned, products: VAULT_PRODUCTS.length };
}

export function normalizeReportedStoragePath(storedPath) {
  return storedPath?.replace(/^\/storage\/self\/primary\//, "/storage/emulated/0/") ?? null;
}

export function safeStoredFilename(name) {
  const basename = String(name || "arquivo").replace(/\\/g, "/").split("/").pop() || "arquivo";
  const cleaned = basename.replace(/[\x00-\x1f<>:"|?*]/g, "_").replace(/^\.+$/, "arquivo").slice(0, 180);
  return cleaned || "arquivo";
}

export async function claimAndStoreJob(config, { fetchImpl = globalThis.fetch, storageDir, nexusRoot: configuredNexusRoot, log = console } = {}) {
  const headers = { Authorization: "Bearer " + config.nodeToken, Accept: "application/json", "Content-Type": "application/json" };
  const base = config.apiBase + "/storage/nodes/" + encodeURIComponent(config.nodeId);
  const response = await fetchImpl(base + "/jobs/claim", { method: "POST", headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (response.status === 401 || response.status === 403) { const error = new Error("Credencial do nó inválida ou revogada; o agente será encerrado."); error.permanent = true; throw error; }
  if (!response.ok) {
    const details = typeof response.text === "function" ? await response.text().catch(() => "") : "";
    throw new Error("Consulta de tarefas recusada pela API (HTTP " + response.status + ")" + (details ? ": " + details.slice(0, 500) : "") + ".");
  }
  const data = await response.json(); const job = data.job;
  if (!job) return null;
  let status = "failed"; let errorMessage = null; let storedPath = null;
  try {
    let targetDir = storageDir;
    if (!targetDir) {
      const nexusRoot = configuredNexusRoot ?? await resolveNexusRoot();
      const userId = safePathSegment(job.user_id, "usuário");
      const nodeId = safePathSegment(config.nodeId, "nó");
      const userVaultDir = getUserDocumentsDir(userId, nexusRoot);
      await mkdir(userVaultDir, { recursive: true, mode: 0o700 });
      await Promise.all(VAULT_PRODUCTS.map(product => mkdir(join(userVaultDir, product), { recursive: true, mode: 0o700 })));
      targetDir = join(userVaultDir, safeVaultProduct(job.product));
      await mkdir(join(nexusRoot, "system", "nodes", nodeId), { recursive: true, mode: 0o700 });
    }
    await mkdir(targetDir, { recursive: true, mode: 0o700 });
    // The requested name is the stable document filename (name + dID), not a transient job ID.
    const fileName = safeStoredFilename(job.name);
    storedPath = join(targetDir, fileName);
    const expectedContent = String(job.content ?? "");
    // Write to a per-job temporary file, then atomically replace the stable document file.
    // A retry of the same job and later saves of the same document both converge on one path.
    const tempPath = storedPath + "." + safeStoredFilename(job.id) + ".tmp";
    await writeFile(tempPath, expectedContent, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, storedPath);
    // A rename changes the path, but not the document identity. Remove stale
    // filenames carrying the same trailing UUID only after the new file exists.
    const identityMatch = fileName.match(/^(.*?)-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\\.nsx$/i);
    if (identityMatch) {
      const entries = await readdir(targetDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || entry.name === fileName) continue;
        const priorMatch = entry.name.match(/^(.*?)-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\\.nsx$/i);
        if (priorMatch && priorMatch[2].toLowerCase() === identityMatch[2].toLowerCase()) {
          await unlink(join(targetDir, entry.name)).catch(() => {});
        }
      }
    }
    status = "completed"; log.info?.("Arquivo armazenado/atualizado no nó: " + fileName);
  } catch (err) { errorMessage = err instanceof Error ? err.message.slice(0, 500) : "Falha ao gravar o arquivo."; storedPath = null; }
  const reportedPath = normalizeReportedStoragePath(storedPath);
  let completed;
  let completionError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      completed = await fetchImpl(base + "/jobs/" + encodeURIComponent(job.id) + "/complete", {
        method: "POST", headers,
        body: JSON.stringify({ status, error: errorMessage, stored_path: reportedPath }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (completed.ok) break;
      const details = typeof completed.text === "function" ? await completed.text().catch(() => "") : "";
      const message = "Confirmação da tarefa recusada pela API (HTTP " + completed.status + ")" + (details ? ": " + details.slice(0, 500) : "") + ".";
      if (completed.status === 401 || completed.status === 403) {
        const authError = new Error(message);
        authError.permanent = true;
        throw authError;
      }
      completionError = new Error(message);
      if (completed.status < 500 && completed.status !== 408 && completed.status !== 429) break;
    } catch (requestError) {
      if (requestError?.permanent) throw requestError;
      completionError = requestError instanceof Error ? requestError : new Error(String(requestError));
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 500 * (2 ** (attempt - 1))));
  }
  if (!completed?.ok) throw completionError ?? new Error("Não foi possível confirmar a gravação na API.");

  if (status !== "completed") throw new Error("Não foi possível gravar o arquivo no nó: " + errorMessage);
  return { job_id: job.id, status, stored_path: storedPath };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runAgent(config, {
  fetchImpl = globalThis.fetch,
  log = console,
  signal,
  intervalMs = HEARTBEAT_INTERVAL_MS,
  maxBackoffMs = MAX_BACKOFF_MS,
} = {}) {
  let failures = 0;
  let connected = false;
  let recovering = false;
  let lastVaultSyncAt = 0;
  while (!signal?.aborted) {
    try {
      const metrics = await readStorageMetrics(undefined, config.nodeId);
      const result = await sendHeartbeat(config, fetchImpl, metrics);
      if (Date.now() - lastVaultSyncAt >= VAULT_SYNC_INTERVAL_MS) {
        try {
          await provisionVaultUsers(config, { fetchImpl, log });
          lastVaultSyncAt = Date.now();
        } catch (syncError) {
          if (syncError?.permanent) throw syncError;
          log.warn?.("Falha ao sincronizar diretórios de usuários do Vault; a gravação continuará criando a pasta do usuário quando necessário: " + (syncError instanceof Error ? syncError.message : String(syncError)));
        }
      }
      try { await claimAndStoreJob(config, { fetchImpl, log }); }
      catch (jobError) {
        if (jobError?.permanent) throw jobError;
        log.warn?.("Falha ao processar tarefa de armazenamento: " + (jobError instanceof Error ? jobError.message : String(jobError)));
      }
      if (!connected || recovering) {
        log.info?.(`Nó Nexus online: ${result.node_id}`);
      }
      connected = true;
      recovering = false;
      failures = 0;
      await sleep(intervalMs);
    } catch (error) {
      if (error?.permanent) {
        log.error?.(error.message);
        return 2;
      }
      recovering = connected;
      failures += 1;
      const backoff = Math.min(maxBackoffMs, 1_000 * (2 ** Math.min(failures - 1, 8)));
      log.warn?.(`Ciclo do agente falhou: ${error instanceof Error ? error.message : String(error)}; nova tentativa em ${Math.ceil(backoff / 1000)}s.`);
      await sleep(backoff);
    }
  }
  return 0;
}

async function main() {
  let config;
  try {
    config = await loadConfig();
  } catch (error) {
    console.error(`Configuração do nó recusada: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  process.exitCode = await runAgent(config, { signal: controller.signal });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
