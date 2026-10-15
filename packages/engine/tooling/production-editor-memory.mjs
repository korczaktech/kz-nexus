// Measures the production React editor with a mocked API and a deterministic 400-paragraph document.
// Requires frontend build output and globally installed Playwright + Chromium.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const frontend = join(root, "frontend");
const globalRoot = spawnSync("npm", ["root", "-g"], { encoding: "utf8" }).stdout.trim();
const require = createRequire(join(globalRoot || root, "noop.js"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright não está disponível. Instale Playwright e Chromium para medir o editor React.");
  process.exit(2);
}

const port = Number(process.env.PRODUCTION_MEMORY_PORT ?? 5197);
const server = spawn(process.execPath, [
  join(frontend, "node_modules/vite/bin/vite.js"),
  "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort",
], { cwd: frontend, stdio: "ignore" });
let browser;
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
async function waitForServer(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await wait(250);
  }
  throw new Error("Frontend de produção não iniciou a tempo.");
}
function mb(bytes) { return Number((bytes / 1024 / 1024).toFixed(2)); }

const user = {
  id: "memory-user", name: "Baseline", email: "baseline@example.invalid", phone: null,
  email_verified: true, phone_verified: true, role: "user", status: "active",
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
};
const html = Array.from({ length: 400 }, (_, i) =>
  "<p>Parágrafo " + (i + 1) + ": texto de referência para medir renderização, seleção e memória do editor Korczak Nexus.</p>"
).join("");
const documentRecord = {
  id: "memory-doc", owner_id: user.id, name: "Baseline de memória (400 parágrafos)",
  document_type: "html", description: "Fixture sintético para medição", folder_id: null,
  current_version_id: "memory-version", status: "active", favorite: false, tag_names: [],
  created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
  content: html, native_content: null,
};

try {
  const url = "http://127.0.0.1:" + port + "/";
  await waitForServer(url);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  const page = await context.newPage();
  const pageSession = await context.newCDPSession(page);
  await pageSession.send("Runtime.enable");

  await page.addInitScript(() => {
    localStorage.setItem("korczak_documents_token", "memory-baseline-token");
    localStorage.setItem("kz_nexus_last_view", "editor");
    localStorage.setItem("kz_nexus_last_editor_document", "memory-doc");
    localStorage.setItem("kz_storage_selection_v1", JSON.stringify({
      provider: "local", label: "Pasta deste dispositivo", connectedAt: "2026-01-01T00:00:00.000Z",
    }));
  });

  // All backend responses are deterministic; no production account or data is accessed.
  await page.route("**/*", async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin === url.slice(0, -1)) {
      await route.continue();
      return;
    }
    if (requestUrl.hostname !== "kzdoc.onrender.com") {
      await route.abort();
      return;
    }
    const path = requestUrl.pathname;
    let body = [];
    if (path === "/api/v1/users/me") body = user;
    else if (path === "/api/v1/documents/memory-doc") body = documentRecord;
    else if (path === "/api/v1/documents/memory-doc/versions") body = [];
    else if (path === "/api/v1/documents") body = [];
    else if (path.endsWith("/tags") || path.endsWith("/folders") ||
             path.endsWith("/notifications") || path.endsWith("/events")) body = [];
    else if (path.includes("search")) body = { items: [], total: 0, page: 1, page_size: 20 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  async function processMemory() {
    try {
      const ps = spawnSync("ps", ["-eo", "pid=,rss=,args="], { encoding: "utf8" });
      if (ps.error || ps.status !== 0) throw new Error(ps.error?.message ?? ps.stderr ?? "ps failed");
      const rows = (ps.stdout ?? "").split("\n").map((line) => {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
        return match ? { id: Number(match[1]), rssKb: Number(match[2]), command: match[3] } : null;
      }).filter((row) => row && /(?:^|[\/\s])(?:chrome-headless-shell|chrome|chromium)(?:\s|$)/i.test(row.command));
      const processes = await Promise.all(rows.map(async (p) => {
        let privateMemoryMB = null;
        try {
          const status = await readFile("/proc/" + p.id + "/smaps_rollup", "utf8");
          const values = [...status.matchAll(/^Private_(?:Clean|Dirty|Hugetlb):\s+(\d+) kB$/gm)].map((m) => Number(m[1]));
          if (values.length) privateMemoryMB = mb(values.reduce((sum, value) => sum + value, 0) * 1024);
        } catch { /* private page accounting may be restricted */ }
        const type = /--type=renderer/.test(p.command) ? "renderer"
          : /--type=gpu-process/.test(p.command) ? "GPU"
          : /--type=utility/.test(p.command) ? "utility"
          : "browser-or-other";
        return { type, id: p.id, residentMemoryMB: mb(p.rssKb * 1024), privateMemoryMB };
      }));
      const privateComplete = processes.length > 0 && processes.every((p) => p.privateMemoryMB !== null);
      return {
        privateMemoryMB: privateComplete ? Number(processes.reduce((sum, p) => sum + p.privateMemoryMB, 0).toFixed(2)) : null,
        totalResidentMemoryMB: processes.length ? Number(processes.reduce((sum, p) => sum + p.residentMemoryMB, 0).toFixed(2)) : null,
        processes,
        note: "RSS total pode contar páginas compartilhadas mais de uma vez; memória privada soma páginas privadas dos processos Chromium encontrados.",
      };
    } catch (error) {
      return { privateMemoryMB: null, totalResidentMemoryMB: null, unavailable: String(error) };
    }
  }

  async function snapshot(phase) {
    const heap = await pageSession.send("Runtime.getHeapUsage").catch(() => null);
    const chrome = await processMemory();
    const documentState = await page.evaluate(() => {
      const stack = document.querySelector(".editor-pages-stack");
      return {
        pages: stack?.querySelectorAll(".editor-page").length ?? 0,
        paragraphs: stack?.querySelectorAll("p").length ?? 0,
        textCharacters: stack?.textContent?.length ?? 0,
        editorReady: Boolean(stack && stack.querySelectorAll("p").length >= 400),
      };
    });
    return {
      phase,
      timestamp: new Date().toISOString(),
      rendererJsHeapUsedMB: heap ? mb(heap.usedSize) : null,
      rendererJsHeapTotalMB: heap ? mb(heap.totalSize) : null,
      chromeProcessMemory: chrome,
      document: documentState,
    };
  }

  const samples = [];
  samples.push(await snapshot("chrome-launched-no-page"));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(document.querySelector(".editor-pages-stack")));
  await page.waitForFunction(() => document.querySelectorAll(".editor-pages-stack p").length >= 400, null, { timeout: 90000 });
  await wait(1200);
  samples.push(await snapshot("production-react-editor-400-paragraphs"));

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version, platform: process.platform, arch: process.arch,
      browserVersion: browser.version(), viewport: "1400x860",
      app: "frontend React production build", document: "400 synthetic HTML paragraphs",
      api: "mocked locally in Playwright; no production data or account used",
    },
    methodology: [
      "Loads the actual production React frontend build with a deterministic mocked API and restores a synthetic editor document.",
      "Runtime.getHeapUsage measures the page renderer JavaScript heap, not total renderer RAM.",
      "Process RSS and private memory are measured separately for Chromium processes; summed RSS may double-count shared pages.",
      "Run three times and compare medians; CI headless measurements are a baseline, not a guarantee for a physical Chromebook.",
    ],
    samples,
  };
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error("Falha na medição do editor React de produção:", error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
