import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const DEFAULT_API_BASE = "https://kzdoc.onrender.com/api/v1";
const HEARTBEAT_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BACKOFF_MS = 5 * 60_000;

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

export async function sendHeartbeat(config, fetchImpl = globalThis.fetch) {
  const endpoint = `${config.apiBase}/storage/nodes/${encodeURIComponent(config.nodeId)}/heartbeat`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.nodeToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error("Credencial do nó inválida ou revogada; o agente será encerrado.");
    error.permanent = true;
    throw error;
  }
  if (!response.ok) {
    throw new Error(`Heartbeat recusado pela API (HTTP ${response.status}).`);
  }
  const payload = await response.json();
  if (payload.node_id !== config.nodeId || payload.status !== "online") {
    throw new Error("Resposta de heartbeat inesperada.");
  }
  return payload;
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
  while (!signal?.aborted) {
    try {
      const result = await sendHeartbeat(config, fetchImpl);
      failures = 0;
      log.info?.(`Nó Nexus online: ${result.node_id}`);
      await sleep(intervalMs);
    } catch (error) {
      if (error?.permanent) {
        log.error?.(error.message);
        return 2;
      }
      failures += 1;
      const backoff = Math.min(maxBackoffMs, 1_000 * (2 ** Math.min(failures - 1, 8)));
      log.warn?.(`Heartbeat falhou; nova tentativa em ${Math.ceil(backoff / 1000)}s.`);
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
