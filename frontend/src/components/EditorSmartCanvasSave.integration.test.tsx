// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocument, getPlainText, type NexusDocument, type SmartCanvasHitTarget } from "../../../packages/engine/src/index";
import type { DocumentItem } from "../services/api";
import { encodeNexusDocument, decodeNexusDocument } from "../services/nexusDocumentPersistence";
import { htmlFromNexusDocument } from "../services/nexusEngineAdapter";
import { Editor } from "./Editor";

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

    expect(host.querySelector(".editor-canvas")?.classList.contains("editor-canvas-legacy-fallback")).toBe(true);
    const legacyBody = host.querySelector(".editor-canvas-legacy-fallback .rich-editor") as HTMLDivElement | null;
    expect(legacyBody).not.toBeNull();
    expect(legacyBody?.contentEditable).toBe("false");
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
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(savedPayload?.content).toContain("After Before");
    expect(savedPayload?.native_content).toBeTruthy();
    const restored = decodeNexusDocument(savedPayload!.native_content);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const restoredParagraph = restored.value.content[0];
    if (!restoredParagraph || restoredParagraph.type !== "paragraph") throw new Error("Expected saved paragraph");
    expect(getPlainText(restoredParagraph)).toBe("After Before");
  });
});
