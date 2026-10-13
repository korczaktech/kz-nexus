// Real-browser end-to-end check of the built preview (Playwright + headless Chromium).
// Requires: `npm run build` first, and Playwright with a Chromium build available.
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const globalRoot = spawnSync("npm", ["root", "-g"], { encoding: "utf8" }).stdout.trim();
const require = createRequire(join(globalRoot || root, "noop.js"));
let chromium;
try { ({ chromium } = require("playwright")); } catch { console.error("Playwright not available; cannot run E2E."); process.exit(2); }

const port = 5199;
const server = spawn(process.execPath, [join(root, "packages/engine-preview/serve.mjs")], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 600));

const results = [];
const check = (name, cond, extra = "") => { results.push({ name, ok: !!cond }); console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const shots = process.env.E2E_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 860 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(m.text()); });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector('[data-testid="editor"] .page');

  // Reads the model WITHOUT moving focus away from the editor.
  const liveModel = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__nexusPreview.document)));
  // Reads the model as the inspector panel displays it (proves the panel reflects the engine).
  const modelJson = async () => {
    await page.click('[data-tab="json"]');
    const shown = JSON.parse(await page.textContent('[data-testid="model-json"]'));
    const live = await liveModel();
    if (JSON.stringify(shown) !== JSON.stringify(live)) throw new Error("inspector JSON differs from the engine document");
    return shown;
  };
  const plain = (doc) => doc.content.map((b) => (b.children ?? []).map((r) => r.text ?? "").join("")).join("|");

  // typing
  await page.click('[data-testid="editor"] p');
  await page.keyboard.type("Olá mundo açaí");
  let doc = await liveModel();
  check("typing reaches the engine model", plain(doc) === "Olá mundo açaí", plain(doc));
  check("DOM mirrors the model", (await page.textContent('[data-testid="editor"] .page')).includes("Olá mundo açaí"));

  // bold via keyboard shortcut on a selection
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("Control+b");
  doc = await liveModel();
  check("Ctrl+B applies a bold mark in the model", JSON.stringify(doc).includes('"bold"'));
  check("bold button reflects state", (await page.getAttribute('[data-cmd="bold"]', "aria-pressed")) === "true");

  // enter + undo/redo
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("segunda linha");
  doc = await liveModel();
  check("Enter creates a second paragraph", doc.content.length === 2 && plain(doc).endsWith("segunda linha"));
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  doc = await liveModel();
  check("Ctrl+Z undoes through the engine history", doc.content.length === 1);
  const afterUndo = JSON.stringify(doc);
  await page.keyboard.press("Control+y");
  await page.keyboard.press("Control+y");
  doc = await liveModel();
  check("Ctrl+Y redoes", doc.content.length === 2 && plain(doc).endsWith("segunda linha") && JSON.stringify(doc) !== afterUndo);
  check("inspector panel shows exactly the engine document", !!(await modelJson()));

  // toolbar: heading, list, table
  await page.selectOption('[data-cmd="blockType"]', "2");
  doc = await modelJson();
  check("block type select creates a heading in the model", doc.content.some((b) => b.type === "heading" && b.level === 2));
  await page.click('[data-cmd="table"]');
  check("table is rendered", (await page.locator('[data-testid="editor"] table td').count()) === 9);
  await page.click('[data-testid="editor"] td p');
  await page.click('[data-cmd="row-add"]');
  check("add row works inside a cell", (await page.locator('[data-testid="editor"] table tr').count()) === 4);

  // inspector tree
  await page.click('[data-tab="tree"]');
  check("inspector tree shows engine nodes", (await page.textContent('[data-testid="tree"]')).includes("table"));

  // diagnostics: validate
  await page.click('[data-panel-tab="diagnostics"]');
  await page.click('[data-action="validate"]');
  check("validate reports real success", (await page.textContent('[data-testid="notice-log"]')).includes("nenhum problema"));

  // save → download
  const [download] = await Promise.all([page.waitForEvent("download"), page.click('[data-action="save"]')]);
  const dir = mkdtempSync(join(tmpdir(), "nsx-"));
  const saved = join(dir, "saida.nsx");
  await download.saveAs(saved);
  const text = readFileSync(saved, "utf8");
  const env = JSON.parse(text);
  check("download is a .nsx envelope", download.suggestedFilename().endsWith(".nsx") && env.format === "korczak-nexus" && env.formatVersion === 1);
  check("success message appears only after the hand-off", (await page.textContent('[data-testid="notice-log"]')).includes("entregue ao navegador"));

  // new + open
  await page.click('[data-action="new"]');
  await page.click('[data-panel-tab="inspector"]');
  doc = await modelJson();
  check("new document is empty", plain(doc) === "");
  await page.click('[data-panel-tab="diagnostics"]');
  await page.setInputFiles('[data-testid="open-input"]', saved);
  await page.waitForFunction(() => document.querySelector('[data-testid="file-name"]')?.textContent?.includes("saida.nsx"));
  await page.click('[data-panel-tab="inspector"]');
  doc = await modelJson();
  const same = JSON.stringify(doc) === JSON.stringify(env.document);
  if (!same) console.log("DIFF opened:", JSON.stringify(doc).slice(0, 400), "\nDIFF saved :", JSON.stringify(env.document).slice(0, 400));
  check("opening the .nsx restores the document", same);
  check("opened document renders", (await page.textContent('[data-testid="editor"] .page')).includes("Olá mundo açaí"));

  // invalid file
  const bad = join(dir, "ruim.nsx");
  writeFileSync(bad, text.slice(0, 100));
  const before = JSON.stringify(await modelJson());
  await page.click('[data-panel-tab="diagnostics"]');
  await page.setInputFiles('[data-testid="open-input"]', bad);
  await page.waitForSelector('.notice.error');
  await page.click('[data-panel-tab="inspector"]');
  check("invalid file is rejected without touching the document", JSON.stringify(await modelJson()) === before);
  check("rejection is shown as an error", (await page.textContent('.notice.error')).includes("Não foi possível abrir"));

  // fixtures + round-trip
  await page.click('[data-panel-tab="diagnostics"]');
  await page.selectOption('[data-testid="fixture-select"]', "structures");
  await page.click('[data-action="load-fixture"]');
  await page.click('[data-action="roundtrip"]');
  check("fixture renders list+table", (await page.locator('[data-testid="editor"] ul li').count()) >= 1 && (await page.locator('[data-testid="editor"] table').count()) === 1);
  check("round-trip preserves structure", (await page.textContent('[data-testid="notice-log"]')).includes("Round-trip .nsx preservou"));
  if (shots) await page.screenshot({ path: join(shots, "preview-structures.png") });

  // image upload
  const png = join(dir, "pixel.png");
  writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64"));
  await page.setInputFiles('[data-testid="image-input"]', png);
  await page.waitForSelector('[data-testid="editor"] figure img');
  check("image upload becomes an engine resource + image block", true);

  // large fixture
  await page.selectOption('[data-testid="fixture-select"]', "large");
  const t0 = Date.now();
  await page.click('[data-action="load-fixture"]');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="editor"] p').length >= 400);
  console.log(`INFO  large fixture (400 paragraphs) built+rendered in ${Date.now() - t0} ms`);
  check("large fixture renders", true);
  if (shots) await page.screenshot({ path: join(shots, "preview-large.png") });

  check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
} finally {
  await browser.close();
  server.kill();
}
const failed = results.filter((r) => !r.ok);
console.log(`\nE2E: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
