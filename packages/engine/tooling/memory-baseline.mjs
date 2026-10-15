// Reproducible browser-memory baseline for the standalone engine preview.
// Requires a built preview and Playwright + Chromium available globally (same prerequisite as e2e-preview.mjs).
// Reports JS heap for the page renderer and private memory of Chrome processes separately.
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const globalRoot = spawnSync("npm", ["root", "-g"], { encoding: "utf8" }).stdout.trim();
const require = createRequire(join(globalRoot || root, "noop.js"));
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright não está disponível. Instale Playwright e Chromium para medir a RAM real; nenhuma estimativa será apresentada como medição.");
  process.exit(2);
}

const port = Number(process.env.MEMORY_BASELINE_PORT ?? 5198);
const server = spawn(process.execPath, [join(root, "packages/engine-preview/serve.mjs")], {
  env: { ...process.env, PORT: String(port) },
  stdio: "ignore",
});
let browser;
const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
async function waitForServer(url) {
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await wait(250);
  }
  throw new Error("Preview não iniciou a tempo.");
}
function mb(bytes) { return Number((bytes / 1024 / 1024).toFixed(2)); }

try {
  const url = `http://127.0.0.1:${port}/`;
  await waitForServer(url);
  browser = await chromium.launch({ headless: true });
  const browserSession = await browser.newBrowserCDPSession();
  const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  const page = await context.newPage();
  const pageSession = await context.newCDPSession(page);
  await pageSession.send("Runtime.enable");

  async function processMemory() {
    try {
      // Enumerate the Chromium process group via ps; CDP process IDs can be
      // outside the runner's visible PID namespace, so do not depend on them.
      const ps = spawnSync("ps", ["-eo", "pid=,rss=,args="], { encoding: "utf8" });
      if (ps.error || ps.status !== 0) throw new Error(ps.error?.message ?? ps.stderr ?? "ps failed");
      const rows = (ps.stdout ?? "").split("\n").map((line) => {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
        return match ? { id: Number(match[1]), rssKb: Number(match[2]), command: match[3] } : null;
      }).filter((row) => row && /(?:^|[\/\s])(?:chrome-headless-shell|chrome|chromium)(?:\s|$)/i.test(row.command));
      const processes = await Promise.all(rows.map(async (p) => {
        let privateMemoryMB = null;
        let privateSource = "unavailable";
        try {
          const status = await readFile("/proc/" + p.id + "/smaps_rollup", "utf8");
          const values = [...status.matchAll(/^Private_(?:Clean|Dirty|Hugetlb):\s+(\d+) kB$/gm)]
            .map((match) => Number(match[1]));
          if (values.length) {
            privateMemoryMB = mb(values.reduce((sum, value) => sum + value, 0) * 1024);
            privateSource = "proc-smaps_rollup";
          }
        } catch { /* /proc private-page accounting can be restricted */ }
        const type = /--type=renderer/.test(p.command) ? "renderer"
          : /--type=gpu-process/.test(p.command) ? "GPU"
          : /--type=utility/.test(p.command) ? "utility"
          : "browser-or-other";
        return {
          type,
          id: p.id,
          residentMemoryMB: mb(p.rssKb * 1024),
          privateMemoryMB,
          privateSource,
        };
      }));
      const privateComplete = processes.length > 0 && processes.every((p) => p.privateMemoryMB !== null);
      return {
        privateMemoryMB: privateComplete ? Number(processes.reduce((sum, p) => sum + p.privateMemoryMB, 0).toFixed(2)) : null,
        totalResidentMemoryMB: processes.length ? Number(processes.reduce((sum, p) => sum + p.residentMemoryMB, 0).toFixed(2)) : null,
        processes,
        note: "RSS é memória residente por processo; a soma pode contar páginas compartilhadas mais de uma vez. privateMemoryMB só é informado quando todos os processos Chrome têm medição privada disponível.",
      };
    } catch (error) {
      return { privateMemoryMB: null, totalResidentMemoryMB: null, unavailable: String(error), note: "Medição de memória de processos não suportada neste ambiente." };
    }
  }

  async function snapshot(label) {
    const heap = await pageSession.send("Runtime.getHeapUsage").catch(() => null);
    const processes = await processMemory();
    const model = await page.evaluate(() => {
      const doc = window.__nexusPreview?.document;
      if (!doc) return null;
      let nodes = 0;
      const visit = (node) => {
        nodes++;
        if (Array.isArray(node.children)) for (const child of node.children) visit(child);
      };
      for (const block of doc.content ?? []) visit(block);
      return {
        blocks: doc.content?.length ?? 0,
        nodes,
        resources: doc.resources?.length ?? 0,
        textCharacters: (doc.content ?? []).reduce((sum, block) => {
          const count = (node) => (node.text ?? "") + (node.children ?? []).map(count).join("");
          return sum + count(block).length;
        }, 0),
      };
    });
    return {
      phase: label,
      timestamp: new Date().toISOString(),
      rendererJsHeapUsedMB: heap ? mb(heap.usedSize) : null,
      rendererJsHeapTotalMB: heap ? mb(heap.totalSize) : null,
      chromeProcessMemory: processes,
      document: model,
    };
  }

  const samples = [];
  samples.push(await snapshot("chrome-launched-no-page"));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="editor"] .page');
  await wait(1200);
  samples.push(await snapshot("empty-document"));

  // Load the repository's existing 400-paragraph fixture through the real UI.
  await page.click('[data-panel-tab="diagnostics"]');
  await page.selectOption('[data-testid="fixture-select"]', "large");
  await page.click('[data-action="load-fixture"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="editor"] p').length >= 400);
  await wait(1200);
  samples.push(await snapshot("fixture-400-paragraphs"));

  // Create a real edit so undo/redo exercise the history path rather than no-op on a clean fixture.
  await page.click('[data-testid="editor"] p');
  await page.keyboard.type("x");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+y");
  await wait(500);
  samples.push(await snapshot("fixture-400-after-undo-redo"));

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      browserVersion: browser.version(),
      viewport: "1400x860",
      fixture: "built-in large fixture (at least 400 paragraphs)",
    },
    methodology: [
      "Headless Chromium; waits for app readiness and short stabilization windows.",
      "Runtime.getHeapUsage reports the page renderer's JavaScript heap, not total renderer RAM.",
      "SystemInfo.getProcessInfo reports private memory of Chrome processes; includes browser-wide processes and is not additive to JS heap.",
      "This is a baseline for the standalone engine preview, not a direct measurement of the production React editor.",
      "Run at least 3 times on the same machine and compare medians; avoid comparing unlike browser versions or environments.",
    ],
    samples,
  };
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error("Falha na medição de memória:", error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
