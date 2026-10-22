import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { chromium, firefox, webkit } from "../frontend/node_modules/playwright/index.mjs";

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
  try {
    await page.locator(".kortex-canvas-page").first().waitFor({ state: "attached", timeout: 15000 });
    await page.waitForFunction(
      value => [...document.querySelectorAll(".kortex-canvas-page")]
        .some(canvas => (canvas.getAttribute("aria-label") ?? "").includes(value)),
      sentinel,
      { timeout: 15000 },
    );
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      canvasLabels: [...document.querySelectorAll(".kortex-canvas-page")].map(canvas => canvas.getAttribute("aria-label")),
      inputValue: document.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]')?.value ?? null,
      status: document.querySelector(".editor-status, [role=status]")?.textContent ?? null,
      bodyText: document.body.innerText.slice(-2500),
    }));
    throw new Error("SmartCanvas accessibility projection did not contain inserted text. " + JSON.stringify(diagnostic) + ". " + String(error));
  }
}

const browserName = process.env.SMARTCANVAS_E2E_BROWSER || "chromium";
const browserType = { chromium, firefox, webkit }[browserName];
if (!browserType) throw new Error("Unsupported SMARTCANVAS_E2E_BROWSER: " + browserName);
const browser = await browserType.launch({ headless: true });
try {
  const context = await browser.newContext({
    acceptDownloads: true,
    // Service workers can bypass Playwright's route interception, especially
    // in WebKit. Block them so the deliberate network-failure test is reliable.
    serviceWorkers: "block",
  });
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
  page.on("console", message => { if (message.type() === "error") console.error("[browser console error]", message.text()); });

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
  await page.locator(".auth-card form button.button-primary").click();
  // Wait for registration to complete before navigating; the guest home also
  // exposes a "Novo documento" action, but that action does not open the modal.
  await page.locator(".auth-card").waitFor({ state: "detached" });
  await page.locator("nav button").filter({ hasText: "Documentos" }).first().click();
  const newDocumentButton = page.locator(".page-head button").filter({ hasText: "Novo documento" });
  await newDocumentButton.waitFor();

  const createResponsePromise = page.waitForResponse(response =>
    response.request().method() === "POST" && /\/api\/v1\/documents(?:\?.*)?$/.test(new URL(response.url()).pathname + new URL(response.url()).search),
  );
  await newDocumentButton.click();
  const dialog = page.locator('.modal[role="dialog"]');
  await dialog.getByLabel("Nome").fill("SmartCanvas API E2E " + runId);
  await dialog.getByLabel("Tipo de documento").selectOption("html");
  await dialog.getByLabel("Conteúdo").fill("<p>BASE_CONTENT</p>");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  const createResponse = await createResponsePromise;
  if (!createResponse.ok()) throw new Error("Create document API returned " + createResponse.status() + ": " + await createResponse.text());
  const created = await createResponse.json();
  assert.ok(created.id, "document creation should return an id");

  await page.getByRole("button", { name: "Editar documento", exact: true }).click();
  assert.equal(await page.locator(".editor-pages-stack, .rich-editor").count(), 0, "production SmartCanvas must not mount the legacy editor DOM");
  assert.equal(await page.locator('.editor-workspace [contenteditable="true"]').count(), 0, "production SmartCanvas body must not use contentEditable");
  const input = page.locator('textarea[aria-label="Entrada de texto do SmartCanvas"]');
  await input.waitFor();
  await page.locator(".kortex-canvas-page").first().click({ position: { x: 120, y: 110 } });
  await input.evaluate(element => element.focus());
  await page.keyboard.type(initialSentinel);
  // SmartCanvas deliberately clears its hidden keyboard-capture textarea after
  // each input event; assert the canvas accessibility projection, not that transient buffer.
  await waitForEditorProjection(page, initialSentinel);

  // Exercise real browser keyboard events against the canonical engine selection:
  // Backspace at the end must delete one grapheme and typing must restore the exact text.
  const finalCharacter = initialSentinel.slice(-1);
  await input.evaluate(element => element.focus());
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await waitForEditorProjection(page, initialSentinel.slice(0, -1));
  await page.keyboard.type(finalCharacter);
  await waitForEditorProjection(page, initialSentinel);

  // Exercise a real shift-selection replacement at the caret boundary. Replacing
  // the selected final character with itself proves the selection is editable
  // without making the expected canonical text depend on browser-specific layout.
  await input.evaluate(element => element.focus());
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.type(finalCharacter);
  await waitForEditorProjection(page, initialSentinel);

  // Force the same hidden-tab checkpoint used by the editor to preserve a recoverable draft.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.visibilityState;
  });
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".editor-head .editor-actions button").filter({ hasText: "Sair" }).click({ force: true });
  await page.getByRole("button", { name: "Editar documento", exact: true }).waitFor();
  await page.getByRole("button", { name: "Editar documento", exact: true }).click();
  await waitForEditorProjection(page, initialSentinel);

  const token = await page.evaluate(() => localStorage.getItem("korczak_documents_token"));
  assert.ok(token, "registration should persist an API session token");

  const firstSavePromise = page.waitForResponse(response =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/save"),
  );
  await page.locator("button.editor-save").click({ force: true });
  await page.getByRole("button", { name: /Salvar no Korczak Vault/ }).click();
  const firstSave = await firstSavePromise;
  if (!firstSave.ok()) throw new Error("SmartCanvas save returned " + firstSave.status() + ": " + await firstSave.text());
  // A successful save opens a result dialog; dismiss it before interacting with ribbon controls.
  await page.locator(".nexus-save-result-dialog .nexus-dialog-close").click();

  let persisted = await apiDocument(created.id, token);
  assert.ok(persisted.content?.includes(initialSentinel), "real API should persist the SmartCanvas HTML projection");
  assert.ok(persisted.native_content?.includes(initialSentinel), "real API should persist the canonical native SmartCanvas payload");

  // Verify that DOCX and PDF export use the same canonical content as the real API save.
  await page.getByRole("button", { name: "Arquivo", exact: true }).click();
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: /Word \(\.docx\)/ }).click();
  const exportErrorPromise = page.getByRole("alert").waitFor({ state: "visible", timeout: 30000 })
    .then(async () => {
      const message = await page.getByRole("alert").innerText();
      throw new Error("DOCX export did not download a file: " + message);
    });
  const download = await Promise.race([downloadPromise, exportErrorPromise]);
  const downloadedPath = await download.path();
  assert.ok(downloadedPath, "DOCX export should create a downloadable file");
  assert.ok((await stat(downloadedPath)).size > 100, "DOCX export should not be empty");

  await page.getByRole("button", { name: "Arquivo", exact: true }).click();
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const popupPromise = page.waitForEvent("popup", { timeout: 15000 });
  await page.getByRole("button", { name: /PDF \(\.pdf\)/ }).click();
  const pdfWindow = await popupPromise;
  await pdfWindow.waitForLoadState("domcontentloaded").catch(() => undefined);
  await pdfWindow.waitForFunction(value => document.body?.textContent?.includes(value) ?? false, initialSentinel, { timeout: 15000 });
  await pdfWindow.close();

  // A blocked popup is a real export failure mode. Verify that PDF export
  // reports an accessible error and leaves the current canonical draft intact.
  await page.evaluate(() => {
    window.__smartCanvasOriginalOpen = window.open;
    window.open = () => null;
  });
  await page.getByRole("button", { name: "Arquivo", exact: true }).click();
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await page.getByRole("button", { name: /PDF \\(\\.pdf\\)/ }).click();
  const blockedPdfAlert = page.getByRole("alert");
  await blockedPdfAlert.waitFor({ state: "visible", timeout: 10000 });
  assert.match(await blockedPdfAlert.innerText(), /bloqueou a janela de impressão|Permita pop-ups/i,
    "blocked PDF export must explain how to recover");
  await page.evaluate(() => {
    if (window.__smartCanvasOriginalOpen) window.open = window.__smartCanvasOriginalOpen;
    delete window.__smartCanvasOriginalOpen;
  });
  await waitForEditorProjection(page, initialSentinel);
  persisted = await apiDocument(created.id, token);
  assert.ok(persisted.content?.includes(initialSentinel), "failed export must not alter the saved HTML content");
  assert.ok(persisted.native_content?.includes(initialSentinel), "failed export must not alter the saved native payload");

  // The eight-second editor autosave must persist the native payload through the real API.
  await input.evaluate(element => element.focus());
  await page.keyboard.type(" " + autosaveSentinel);
  await page.waitForTimeout(9000);
  persisted = await apiDocument(created.id, token);
  assert.ok(persisted.content?.includes(autosaveSentinel), "autosave should persist updated HTML through the real API");
  assert.ok(persisted.native_content?.includes(autosaveSentinel), "autosave should persist updated native SmartCanvas content");

  // Verify durable recovery after a full page reload, not only leaving and reopening
  // the editor component. The authenticated session and saved draft must survive reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  // Authentication and persisted navigation restore asynchronously after reload.
  // Wait until either the editor or the document list is actually ready.
  await page.waitForFunction(() => {
    const isVisible = (element) => element instanceof HTMLElement
      && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== "hidden";
    const buttons = [...document.querySelectorAll("button")].filter(isVisible);
    const editorReady = buttons.some(button =>
      button.closest(".editor-head .editor-actions") && button.innerText.includes("Sair")
    );
    const documentListReady = buttons.some(button => button.innerText.trim() === "Editar documento");
    return editorReady || documentListReady;
  }, null, { timeout: 20000 });
  // Depending on the app's persisted navigation state, reload may restore the
  // editor directly or return to the document list. Support both routes, but
  // only treat visible controls as ready; hidden stale buttons can survive while
  // authentication/navigation state is being rehydrated.
  const editorExit = page.locator(".editor-head .editor-actions button").filter({ hasText: "Sair" }).first();
  if (!(await editorExit.isVisible().catch(() => false))) {
    const editDocument = page.getByRole("button", { name: "Editar documento", exact: true }).first();
    if (!(await editDocument.isVisible().catch(() => false))) {
      const diagnostic = await page.evaluate(() => ({
        title: document.title,
        url: location.href,
        bodyText: document.body.innerText.slice(-3000),
        tokenPresent: Boolean(localStorage.getItem("korczak_documents_token")),
        visibleButtons: [...document.querySelectorAll("button")]
          .filter(button => button instanceof HTMLElement && button.getClientRects().length > 0)
          .map(button => button.innerText.trim()).filter(Boolean).slice(-40),
      }));
      throw new Error("Document/editor navigation did not recover after reload: " + JSON.stringify(diagnostic));
    }
    await editDocument.click();
  }
  await waitForEditorProjection(page, autosaveSentinel);
  persisted = await apiDocument(created.id, token);
  assert.ok(persisted.content?.includes(autosaveSentinel), "reload recovery should preserve the saved HTML draft");
  assert.ok(persisted.native_content?.includes(autosaveSentinel), "reload recovery should preserve the saved native draft");

  // Simulate a dropped connection during a real save, then reconnect and retry.
  // The first request is deliberately aborted at the browser boundary; the second
  // must persist the exact same canonical draft without silently reverting text.
  const reconnectSentinel = "SMARTCANVAS_RECONNECT_E2E_" + runId;
  let interruptedSave = false;
  let resolveInterruptedRoute;
  const interruptedRoutePromise = new Promise(resolve => {
    resolveInterruptedRoute = resolve;
  });
  // Match broadly and inspect the parsed URL ourselves. WebKit can omit
  // requests from a narrow glob when the save URL carries a query string.
  const saveRoutePattern = "**/*";
  await page.route(saveRoutePattern, async route => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const isSave = request.method() === "POST" && requestUrl.pathname.endsWith("/save");
    if (!interruptedSave && isSave) {
      interruptedSave = true;
      console.log("[reconnect E2E] intercepting save request in " + browserName + ": " + requestUrl.pathname);
      try {
        await route.abort("internetdisconnected");
      } finally {
        // Synchronize on the interception itself rather than Playwright's
        // requestfailed event, which is inconsistently emitted by WebKit.
        resolveInterruptedRoute();
      }
      return;
    }
    await route.continue();
  });
  await input.evaluate(element => element.focus());
  await page.keyboard.type(" " + reconnectSentinel);
  await page.locator("button.editor-save").click({ force: true });
  await page.getByRole("button", { name: /Salvar no Korczak Vault/ }).click();
  let interruptionTimeout;
  try {
    await Promise.race([
      interruptedRoutePromise,
      new Promise((_, reject) => {
        interruptionTimeout = setTimeout(() => reject(new Error(
          "Timed out waiting for the browser to intercept the deliberate save interruption in " + browserName
        )), 20000);
      }),
    ]);
  } finally {
    if (interruptionTimeout) clearTimeout(interruptionTimeout);
  }
  assert.equal(interruptedSave, true, "the network interruption must hit the actual save request");
  // Failed saves also open a modal; close it so the retry can reach the editor controls.
  await page.locator(".nexus-save-result-dialog .nexus-dialog-close").click();
  await page.unroute(saveRoutePattern);
  const recoveredSavePromise = page.waitForResponse(response =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/save"),
  );
  await page.locator("button.editor-save").click({ force: true });
  await page.getByRole("button", { name: /Salvar no Korczak Vault/ }).click();
  const recoveredSave = await recoveredSavePromise;
  if (!recoveredSave.ok()) throw new Error("Save after reconnection returned " + recoveredSave.status() + ": " + await recoveredSave.text());
  await page.locator(".nexus-save-result-dialog .nexus-dialog-close").click();
  persisted = await apiDocument(created.id, token);
  assert.ok(persisted.content?.includes(reconnectSentinel), "reconnected save must persist the draft text in HTML");
  assert.ok(persisted.native_content?.includes(reconnectSentinel), "reconnected save must persist the same canonical native draft");

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
    checks: ["real API save", "native payload roundtrip", "draft recovery", "DOCX export", "PDF export", "real API autosave", "full page reload recovery", "network interruption and reconnect recovery", "version conflict"],
  }));
  await context.close();
} finally {
  await browser.close();
}
