// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocument, getPlainText, type NexusDocument, type SmartCanvasHitTarget } from "../../../packages/engine/src/index";
import type { DocumentItem } from "../services/api";
import { encodeNexusDocument, decodeNexusDocument } from "../services/nexusDocumentPersistence";
import { htmlFromNexusDocument } from "../services/nexusEngineAdapter";
import { Editor } from "./Editor";
import { recoverDraft, recoverNativeDraft } from "./editorPersistence";

vi.mock("./CanvasDocumentRenderer", async () => {
  const React = await import("react");
  return {
    CanvasDocumentRenderer: ({
      document,
      onHitTest,
    }: {
      document: NexusDocument;
      onHitTest?: (target: SmartCanvasHitTarget, clickCount?: number) => void;
    }) => {
      const block = document.content[0];
      return React.createElement("button", {
        type: "button",
        "data-testid": "editor-smartcanvas-hit",
        onClick: () => {
          if (block?.type === "paragraph" || block?.type === "heading") {
            onHitTest?.({
              kind: "text",
              pageIndex: 0,
              blockId: block.id,
              position: { blockId: block.id, offset: 0 },
              lineIndex: 0,
            }, 1);
          }
        },
      }, "Select SmartCanvas text");
    },
  };
});

vi.mock("./PagedPreview", async () => {
  const React = await import("react");
  return { PagedPreview: () => React.createElement("div", { "data-testid": "mock-paged-preview" }) };
});

describe("Editor SmartCanvas save integration", () => {
  let host: HTMLDivElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;
  let previousUrl = "/";

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    host?.remove();
    window.history.replaceState({}, "", previousUrl);
    localStorage.clear();
    host = undefined;
    root = undefined;
  });

  it("saves the edited canonical engine document to native NSX and HTML through the real editor save path", async () => {
    previousUrl = window.location.pathname + window.location.search + window.location.hash;
    window.history.replaceState({}, "", "/?smartCanvas=1");
    const model = createDocument({ title: "SmartCanvas save integration" });
    const paragraph = model.content[0];
    if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected initial paragraph");
    paragraph.children[0]!.text = "Before";
    const encoded = encodeNexusDocument(model);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const document: DocumentItem = {
      id: "smartcanvas-save-integration",
      owner_id: "owner",
      name: "SmartCanvas save integration",
      document_type: "document",
      folder_id: null,
      current_version_id: null,
      status: "active",
      favorite: false,
      created_at: "2026-10-16T00:00:00.000Z",
      updated_at: "2026-10-16T00:00:00.000Z",
      content: htmlFromNexusDocument(model),
      native_content: encoded.value,
    };
    let savedPayload: Parameters<Parameters<typeof Editor>[0]["onSave"]>[0] | undefined;
    let resolveSave: ((result: "saved") => void) | undefined;
    const onSave = vi.fn((payload: Parameters<Parameters<typeof Editor>[0]["onSave"]>[0]) => {
      savedPayload = payload;
      return new Promise<"saved">(resolve => { resolveSave = resolve; });
    });
    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(createElement(Editor, {
        document,
        versions: [],
        onSave,
        onClose: vi.fn(),
        onConflict: vi.fn(async () => document),
      }));
    });

    expect(host.querySelector(".editor-canvas")).toBeNull();
    expect(host.querySelector(".editor-canvas-legacy-fallback")).toBeNull();
    expect(host.querySelector('.editor-workspace [contenteditable="true"]')).toBeNull();
    // Production SmartCanvas must not mount a hidden native editor projection.
    expect(host.querySelector(".editor-pages-stack")).toBeNull();
    expect(host.querySelector(".rich-editor")).toBeNull();
    const hit = host.querySelector('[data-testid="editor-smartcanvas-hit"]') as HTMLButtonElement | null;
    expect(hit).not.toBeNull();
    await act(async () => { hit?.click(); });
    const input = host.querySelector('textarea[aria-label="Entrada de texto do SmartCanvas"]') as HTMLTextAreaElement | null;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (!input || !setter) throw new Error("SmartCanvas input surface was not mounted");
    await act(async () => {
      setter.call(input, "After ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const saveButton = host.querySelector("button.editor-save") as HTMLButtonElement | null;
    expect(saveButton).not.toBeNull();
    if (!saveButton) throw new Error("Editor save button was not mounted");
    await act(async () => {
      saveButton.click();
      await Promise.resolve();
    });
    const vaultSaveButton = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.includes("Salvar no Korczak Vault"));
    expect(vaultSaveButton).toBeDefined();
    await act(async () => {
      vaultSaveButton?.click();
      await Promise.resolve();
    });

    expect(host.querySelector(".save-state")?.textContent).toContain("Salvando");
    expect(saveButton.disabled).toBe(true);
    await act(async () => {
      if (!resolveSave) throw new Error("Save callback did not start");
      resolveSave("saved");
      await Promise.resolve();
    });

    expect(host.querySelector(".save-state")?.textContent).toContain("Salvo");
    expect(saveButton.disabled).toBe(false);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(savedPayload?.content).toContain("After Before");
    expect(savedPayload?.native_content).toBeTruthy();
    const restored = decodeNexusDocument(savedPayload!.native_content);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const restoredParagraph = restored.value.content[0];
    if (!restoredParagraph || restoredParagraph.type !== "paragraph") throw new Error("Expected saved paragraph");
    expect(getPlainText(restoredParagraph)).toBe("After Before");

    onSave.mockImplementationOnce(async () => { throw new Error("offline"); });
    await act(async () => {
      setter.call(input, "Retry ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      saveButton.click();
      await Promise.resolve();
    });
    const retryVaultButton = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.includes("Salvar no Korczak Vault"));
    expect(retryVaultButton).toBeDefined();
    await act(async () => {
      retryVaultButton?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(host.querySelector(".save-state")?.textContent).toContain("Erro ao salvar");
    expect(recoverDraft(localStorage, document.id)).not.toBeNull();
    expect(recoverNativeDraft(localStorage, document.id)).not.toBeNull();
  });

  it("finds and replaces canonical text with the legacy page DOM unmounted", async () => {
    previousUrl = window.location.pathname + window.location.search + window.location.hash;
    window.history.replaceState({}, "", "/?smartCanvas=1");
    const model = createDocument({ title: "SmartCanvas find replace without legacy DOM" });
    const paragraph = model.content[0];
    if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected initial paragraph");
    paragraph.children[0]!.text = "alpha alpha";
    const encoded = encodeNexusDocument(model);
    if (!encoded.ok) throw new Error("Could not encode test document");
    const document: DocumentItem = {
      id: "smartcanvas-find-replace",
      owner_id: "owner",
      name: "SmartCanvas find replace",
      document_type: "document",
      folder_id: null,
      current_version_id: null,
      status: "active",
      favorite: false,
      created_at: "2026-10-16T00:00:00.000Z",
      updated_at: "2026-10-16T00:00:00.000Z",
      content: htmlFromNexusDocument(model),
      native_content: encoded.value,
    };
    let savedPayload: Parameters<Parameters<typeof Editor>[0]["onSave"]>[0] | undefined;
    const onSave = vi.fn(async (payload: Parameters<Parameters<typeof Editor>[0]["onSave"]>[0]) => {
      savedPayload = payload;
      return "saved" as const;
    });
    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(Editor, {
        document,
        versions: [],
        onSave,
        onClose: vi.fn(),
        onConflict: vi.fn(async () => document),
      }));
    });
    expect(host.querySelector(".editor-canvas")).toBeNull();
    expect(host.querySelector(".editor-pages-stack")).toBeNull();
    expect(host.querySelector('.editor-workspace [contenteditable="true"]')).toBeNull();
    const editTab = [...host.querySelectorAll<HTMLButtonElement>('nav[aria-label="Guias do editor"] button')]
      .find(button => button.textContent?.trim() === "Editar");
    if (!editTab) throw new Error("Edit ribbon tab was not mounted");
    await act(async () => { editTab.click(); });
    const openFind = host.querySelector('button[aria-label="Localizar"]') as HTMLButtonElement | null;
    if (!openFind) throw new Error("Find command was not mounted");
    await act(async () => { openFind.click(); });
    const fields = [...host.querySelectorAll<HTMLInputElement>(".editor-findbar input")];
    if (fields.length !== 2) throw new Error("Find/replace fields were not mounted");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Input value setter was not available");
    await act(async () => {
      setter.call(fields[0], "alpha");
      fields[0].dispatchEvent(new Event("input", { bubbles: true }));
      setter.call(fields[1], "beta");
      fields[1].dispatchEvent(new Event("input", { bubbles: true }));
    });
    const replace = [...host.querySelectorAll<HTMLButtonElement>(".editor-findbar button")]
      .find(button => button.textContent?.includes("Substituir tudo"));
    if (!replace) throw new Error("Replace-all command was not mounted");
    await act(async () => { replace.click(); });
    const saveButton = host.querySelector("button.editor-save") as HTMLButtonElement | null;
    if (!saveButton) throw new Error("Save button was not mounted");
    await act(async () => {
      saveButton.click();
      await Promise.resolve();
    });
    const vaultSaveButton = [...host.querySelectorAll<HTMLButtonElement>("button")]
      .find(button => button.textContent?.includes("Salvar no Korczak Vault"));
    expect(vaultSaveButton).toBeDefined();
    await act(async () => {
      vaultSaveButton?.click();
      await Promise.resolve();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(savedPayload?.content).toContain("beta beta");
    const restored = decodeNexusDocument(savedPayload!.native_content);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const restoredParagraph = restored.value.content[0];
    if (!restoredParagraph || restoredParagraph.type !== "paragraph") throw new Error("Expected saved paragraph");
    expect(getPlainText(restoredParagraph)).toBe("beta beta");
  });

  it("keeps SmartCanvas spellcheck scoped to the editor instance whose toolbar was used", async () => {
    previousUrl = window.location.pathname + window.location.search + window.location.hash;
    window.history.replaceState({}, "", "/?smartCanvas=1");
    const makeDocument = (id: string, text: string): DocumentItem => {
      const model = createDocument({ title: id });
      const paragraph = model.content[0];
      if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected initial paragraph");
      paragraph.children[0]!.text = text;
      const encoded = encodeNexusDocument(model);
      if (!encoded.ok) throw new Error("Could not encode test document");
      return {
        id,
        owner_id: "owner",
        name: id,
        document_type: "document",
        folder_id: null,
        current_version_id: null,
        status: "active",
        favorite: false,
        created_at: "2026-10-16T00:00:00.000Z",
        updated_at: "2026-10-16T00:00:00.000Z",
        content: htmlFromNexusDocument(model),
        native_content: encoded.value,
      };
    };
    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement("div", null,
        createElement(Editor, { document: makeDocument("first", "First"), versions: [], onSave: vi.fn(async () => "saved" as const), onClose: vi.fn(), onConflict: vi.fn(async () => makeDocument("first", "First")) }),
        createElement(Editor, { document: makeDocument("second", "Second"), versions: [], onSave: vi.fn(async () => "saved" as const), onClose: vi.fn(), onConflict: vi.fn(async () => makeDocument("second", "Second")) }),
      ));
    });
    const toolsTabs = Array.from(host.querySelectorAll<HTMLButtonElement>(".editor-ribbon-tabs button")).filter(button => button.textContent === "Ferramentas");
    expect(toolsTabs).toHaveLength(2);
    await act(async () => { toolsTabs[0]!.click(); });
    const inputs = Array.from(host.querySelectorAll<HTMLTextAreaElement>('textarea[aria-label="Entrada de texto do SmartCanvas"]'));
    const spellcheckButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-label="Verificação ortográfica"]'));
    expect(inputs).toHaveLength(2);
    expect(spellcheckButtons.length).toBeGreaterThanOrEqual(1);
    expect(inputs.map(input => input.getAttribute("spellcheck"))).toEqual(["true", "true"]);
    await act(async () => { spellcheckButtons[0]!.click(); });
    expect(inputs[0]!.getAttribute("spellcheck")).toBe("false");
    expect(inputs[1]!.getAttribute("spellcheck")).toBe("true");
  });

  it("keeps title navigation visible and focuses the matching SmartCanvas instance", async () => {
    previousUrl = window.location.pathname + window.location.search + window.location.hash;
    window.history.replaceState({}, "", "/?smartCanvas=1");
    const makeHeadingDocument = (id: string): DocumentItem => {
      const model = createDocument({ title: id });
      const paragraph = model.content[0];
      if (!paragraph || paragraph.type !== "paragraph") throw new Error("Expected initial paragraph");
      model.content[0] = { type: "heading", id: paragraph.id, level: 1, children: [{ ...paragraph.children[0]!, text: id + " heading" }] };
      const encoded = encodeNexusDocument(model);
      if (!encoded.ok) throw new Error("Could not encode test document");
      return {
        id,
        owner_id: "owner",
        name: id,
        document_type: "document",
        folder_id: null,
        current_version_id: null,
        status: "active",
        favorite: false,
        created_at: "2026-10-16T00:00:00.000Z",
        updated_at: "2026-10-16T00:00:00.000Z",
        content: htmlFromNexusDocument(model),
        native_content: encoded.value,
      };
    };
    const firstDocument = makeHeadingDocument("first");
    const secondDocument = makeHeadingDocument("second");
    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement("div", null,
        createElement(Editor, { document: firstDocument, versions: [], onSave: vi.fn(async () => "saved" as const), onClose: vi.fn(), onConflict: vi.fn(async () => firstDocument) }),
        createElement(Editor, { document: secondDocument, versions: [], onSave: vi.fn(async () => "saved" as const), onClose: vi.fn(), onConflict: vi.fn(async () => secondDocument) }),
      ));
    });
    const bodies = Array.from(host.querySelectorAll<HTMLElement>(".editor-body"));
    expect(bodies).toHaveLength(2);
    const targetBody = bodies[0]!;
    const viewTabs = Array.from(host.querySelectorAll<HTMLButtonElement>(".editor-ribbon-tabs button")).filter(button => button.textContent === "Exibir");
    expect(viewTabs.length).toBeGreaterThanOrEqual(1);
    const targetRoot = viewTabs[0]!.closest(".editor-workspace") as HTMLElement;
    await act(async () => { viewTabs[0]!.click(); });
    const sideBySideButton = targetRoot.querySelector<HTMLButtonElement>('button[aria-label="Exibir páginas lado a lado"]');
    expect(sideBySideButton).not.toBeNull();
    await act(async () => { sideBySideButton!.click(); });
    expect(targetBody.classList.contains("kz-pages-side-by-side")).toBe(true);
    const fitWidthButton = targetRoot.querySelector<HTMLButtonElement>('button[aria-label="Ajustar largura da página"]');
    expect(fitWidthButton).not.toBeNull();
    await act(async () => { fitWidthButton!.click(); });
    const canvasViewport = Array.from(targetRoot.querySelectorAll<HTMLElement>(".kz-smartcanvas-experiment div")).find(element => element.style.maxHeight === "560px");
    expect(canvasViewport?.style.zoom).toMatch(/%$/);
    const navigationButtons = Array.from(targetRoot.querySelectorAll<HTMLButtonElement>('button[aria-label="Painel de navegação por títulos"]'));
    expect(navigationButtons).toHaveLength(1);
    await act(async () => { navigationButtons[0]!.click(); });
    const panel = targetBody.querySelector<HTMLElement>('aside[aria-label="Navegação por títulos"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain("first heading");
    const headingButton = Array.from(panel!.querySelectorAll("button")).find(button => button.textContent === "first heading");
    expect(headingButton).toBeTruthy();
    await act(async () => { headingButton!.click(); });
    const inputs = Array.from(bodies.map(body => body.querySelector<HTMLTextAreaElement>('textarea[aria-label="Entrada de texto do SmartCanvas"]')));
    expect(window.document.activeElement).toBe(inputs[0]);
    expect(window.document.activeElement).not.toBe(inputs[1]);
    const editTabs = Array.from(targetRoot.querySelectorAll<HTMLButtonElement>(".editor-ribbon-tabs button")).filter(button => button.textContent === "Editar");
    await act(async () => { editTabs[0]!.click(); });
    const selectAllButton = targetRoot.querySelector<HTMLButtonElement>('button[aria-label="Selecionar tudo"]');
    expect(selectAllButton).not.toBeNull();
    await act(async () => { selectAllButton!.click(); });
    expect(window.document.activeElement).toBe(inputs[0]);
    expect(targetRoot.querySelector(".save-state")?.textContent).toContain("SmartCanvas");
  });
});
