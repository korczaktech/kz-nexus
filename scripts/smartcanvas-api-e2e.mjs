import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { chromium } from "../frontend/node_modules/playwright/index.mjs";

const baseUrl = process.env.SMARTCANVAS_E2E_BASE_URL || "http://localhost:5173";
const apiUrl = process.env.SMARTCANVAS_E2E_API_URL || "http://127.0.0.1:8000";
const runId = Date.now().toString(36);
const initialSentinel = "SMARTCANVAS_API_E2E_" + runId;
const autosaveSentinel = "SMARTCANVAS_AUTOSAVE_E2E_" + runId;
const conflictSentinel = "SMARTCANVAS_LOCAL_CONFLICT_E2E_" + runId;
const email = "smartcanvas-e2e-" + runId + "@example.com";
const password = "KortexE2E!Password2026";

async function apiDocument(id, token) {
  const response = await fetch(apiUrl + "/api/v1/documents/" + encodeURIComponent(id), {
    headers: { Authorization: "Bearer " + token },
  });
  if (!response.ok) throw new Error("GET document API returned " + response.status + ": " + await response.text());
  return response.json();
}

async function waitForEditorProjection(page, sentinel) {
  await page.waitForFunction(
    value => document.querySelector(".rich-editor")?.textContent?.includes(value) ?? false,
    sentinel,
    { timeout: 15000 },
  );
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ acceptDownloads: true });
  await context.addInitScript(() => {
    localStorage.setItem("kz_storage_selection_v1", JSON.stringify({
      provider: "local",
      label: "SmartCanvas CI",
      connectedAt: new Date().toISOString(),
    }));
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  page.setDefaultTimeout(15000);
  page.on("pageerror", error => console.error("[browser page error]", error.message));

  await page.goto(baseUrl + "/?smartCanvas=1", { waitUntil: "domcontentloaded" });
  // The app intentionally opens in guest mode when no session exists. Open the
  // registration overlay first; clicking the overlay toggle here would switch
  // registration back to login and invalidate the required registration fields.
  await page.locator(".top-actions .header-account-actions button.primary").click();
  await page.getByLabel("E-mail").waitFor();
  await page.getByLabel("Nome").fill("SmartCanvas API E2E");
  await page.getByLabel("E-mail").fill(email);
  await page.locator(".auth-card form input[type=password]").nth(0).fill(password);
  await page.getByLabel("Confirmar senha").fill(password);
  await page.locator('input[name="acceptTerms"]').check();
  await page.locator('input[name="acceptPrivacy"]').check();
  await page.locator(".auth-card form button[type='submit']").click();
  await page.getByRole("button", { name: /Novo documento/ }).first().waitFor();

  const createResponsePromise = page.waitForResponse(response =>
    response.request().method() === "POST" && /\/api\/v1\/documents(?:\?.*)?$/.test(new URL(response.url()).pathname + new URL(response.url()).search),
  );
  await page.getByRole("button", { name: /Novo documento/ }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome").fill("SmartCanvas API E2E " + runId);
  await dialog.getByLabel("Tipo de documento").selectOption("html");
  await dialog.getByLabel("Conteúdo").fill("<p>BASE_CONTENT</p>");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  const createResponse = await createResponsePromise;
  if (!createResponse.ok()) throw new Error("Create document API returned " + createResponse.status() + ": " + await createResponse.text());
  const created = await createResponse.json();
  assert.ok(created.id, "document creation should return an id");

  await page.getByRole("button", { name: "Editar documento", exact: true }).click();
  const input = page.locator('textarea[aria-label="Entrada de texto do SmartCanvas"]');
  await input.waitFor();
  await input.evaluate(element => element.focus());
  await page.keyboard.type(initialSentinel);
  await page.waitForFunction(
    ({ selector, value }) => document.querySelector(selector)?.value?.includes(value) ?? false,
    { selector: 'textarea[aria-label="Entrada de texto do SmartCanvas"]', value: initialSentinel },
  );

  // Force the same hidden-tab checkpoint used by the editor to preserve a recoverable draft.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.visibilityState;
  });
  await page.locator('button[aria-label="Sair"]').click({ force: true });
  await page.getByRole("button", { name: "Editar documento", exact: true }).waitFor();
  await page.getByRole("button", { name: "Editar documento", exact: true }).click();
  await waitForEditorProjection(page, initialSentinel);

  const token = await page.evaluate(() => localStorage.getItem("korczak_documents_token"));
  assert.ok(token, "registration should persist an API session token");

  const firstSavePromise = page.waitForResponse(response =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/save"),
  );
  await page.locator("button.editor-save").click({ force: true });
  const firstSave = await firstSavePromise;
  if (!firstSave.ok()) throw new Error("SmartCanvas save returned " + firstSave.status() + ": " + await firstSave.text());

  let persisted = await apiDocument(created.id, token);
  assert.ok(persisted.content?.includes(initialSentinel), "real API should persist the SmartCanvas HTML projection");
  assert.ok(persisted.native_content?.includes(initialSentinel), "real API should persist the canonical native SmartCanvas payload");

  // Verify that DOCX and PDF export use the same canonical content as the real API save.
  await page.getByRole("button", { name: "Arquivo", exact: true }).click();
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Word \(\.docx\)/ }).click();
  const download = await downloadPromise;
  const downloadedPath = await download.path();
  assert.ok(downloadedPath, "DOCX export should create a downloadable file");
  assert.ok((await stat(downloadedPath)).size > 100, "DOCX export should not be empty");

  await page.getByRole("button", { name: "Arquivo", exact: true }).click();
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: /PDF \(\.pdf\)/ }).click();
  const pdfWindow = await popupPromise;
  await pdfWindow.waitForLoadState("domcontentloaded").catch(() => undefined);
  await pdfWindow.waitForFunction(value => document.body?.textContent?.includes(value) ?? false, initialSentinel, { timeout: 15000 });
  await pdfWindow.close();

  // The eight-second editor autosave must persist the native payload through the real API.
  await input.evaluate(element => element.focus());
  await page.keyboard.type(" " + autosaveSentinel);
  await page.waitForTimeout(9000);
  persisted = await apiDocument(created.id, token);
  assert.ok(persisted.content?.includes(autosaveSentinel), "autosave should persist updated HTML through the real API");
  assert.ok(persisted.native_content?.includes(autosaveSentinel), "autosave should persist updated native SmartCanvas content");

  // Create an external version with the current version id; the editor's next autosave must surface a conflict.
  const externalSave = await fetch(apiUrl + "/api/v1/documents/" + encodeURIComponent(created.id) + "/save", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      name: persisted.name,
      document_type: persisted.document_type,
      content: "<p>EXTERNAL_VERSION_" + runId + "</p>",
      native_content: persisted.native_content,
      base_version_id: persisted.current_version_id,
      create_version: true,
    }),
  });
  if (!externalSave.ok) throw new Error("External version setup returned " + externalSave.status + ": " + await externalSave.text());
  await input.evaluate(element => element.focus());
  await page.keyboard.type(" " + conflictSentinel);
  await page.waitForTimeout(9000);
  await page.getByText(/Conflito: o documento foi alterado em outra sessão/).waitFor({ timeout: 15000 });

  console.log(JSON.stringify({
    ok: true,
    documentId: created.id,
    checks: ["real API save", "native payload roundtrip", "draft recovery", "DOCX export", "PDF export", "real API autosave", "version conflict"],
  }));
  await context.close();
} finally {
  await browser.close();
}
