// Reproducible browser-memory baseline for the standalone engine preview.
// Requires a built preview and Playwright + Chromium available globally (same prerequisite as e2e-preview.mjs).
// Reports JS heap for the page renderer and private memory of Chrome processes separately.
import { spawn, spawnSync } from "node:child_process";
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
      const result = await browserSession.send("SystemInfo.getProcessInfo");
      const processes = result.processInfo ?? [];
      return {
        privateMemoryMB: mb(processes.reduce((sum, p) => sum + Number(p.memory ?? 0) * 1024, 0)),
        processes: processes.map((p) => ({ type: p.type, id: p.id, privateMemoryMB: mb(Number(p.memory ?? 0) * 1024) })),
        note: "Soma de memória privada reportada pelo CDP para processos Chrome listados; não somar ao heap JS.",
      };
    } catch (error) {
      return { unavailable: String(error), note: "SystemInfo.getProcessInfo não suportado por este Chromium." };
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

  // Sample again after undo/redo to expose the current history footprint.
  await page.click('[data-testid="editor"] p');
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
