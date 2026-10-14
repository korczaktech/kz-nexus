// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PagedPreview } from "./PagedPreview";
import type { NexusDocument } from "../../../packages/engine/src/index";

const documentModel: NexusDocument = {
  id: "preview-doc",
  schemaVersion: 1,
  metadata: { title: "Kortex preview test" },
  pageConfig: {
    unit: "pt", width: 612, height: 792, orientation: "portrait",
    margins: { top: 36, right: 36, bottom: 36, left: 36 },
  },
  content: [{
    type: "paragraph", id: "preview-p",
    children: [{ type: "text", id: "preview-run", text: "Native Kortex preview", marks: [] }],
  }],
  resources: [],
};

const structuredDocument: NexusDocument = {
  ...documentModel,
  id: "structured-preview",
  content: [
    {
      type: "orderedList", id: "list", start: 3,
      children: [{
        type: "listItem", id: "item",
        children: [
          {
            type: "paragraph", id: "item-p",
            children: [{ type: "text", id: "item-run", text: "First item", marks: [{ type: "bold" }] }],
          },
          {
            type: "bulletList", id: "nested-list",
            children: [{
              type: "listItem", id: "nested-item",
              children: [{
                type: "paragraph", id: "nested-p",
                children: [{ type: "text", id: "nested-run", text: "Nested item", marks: [{ type: "italic" }] }],
              }],
            }],
          },
        ],
      }],
    },
    {
      type: "blockquote", id: "quote",
      children: [{
        type: "paragraph", id: "quote-p",
        children: [{ type: "text", id: "quote-run", text: "Quoted text", marks: [{ type: "italic" }] }],
      }],
    },
  ],
};

describe("Kortex Canvas native preview", () => {
  let host: HTMLDivElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    host?.remove();
    host = undefined;
    root = undefined;
  });

  it("uses a Canvas 2D surface for native document rendering", async () => {
    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(PagedPreview, {
        html: "<p>Fallback HTML should not be rendered</p>",
        css: "",
        document: structuredDocument,
        useNativeLayout: true,
        onClose: () => {},
      }));
    });
    await act(async () => { await Promise.resolve(); });

    expect(host.querySelector('[data-renderer="canvas-2d"]')).not.toBeNull();
    const canvases = [...host.querySelectorAll("canvas.kortex-canvas-page")];
    expect(canvases.length).toBeGreaterThan(0);
    const pageLabel = canvases[0]?.getAttribute("aria-label") ?? "";
    expect(pageLabel).toContain("3.");
    expect(pageLabel).toContain("First item");
    expect(pageLabel).toContain("Nested item");
    expect(pageLabel).toContain("Quoted text");
    expect(pageLabel).not.toContain("Fallback HTML should not be rendered");
    expect(host.querySelector(".paged-preview-pages")?.children.length).toBe(0);
  });

  it("exposes page geometry and canonical document text accessibly", async () => {
    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(PagedPreview, {
        html: "<p>Native Kortex preview</p>",
        css: "",
        document: documentModel,
        useNativeLayout: true,
        onClose: () => {},
      }));
    });
    await act(async () => { await Promise.resolve(); });

    const page = host.querySelector("canvas.kortex-canvas-page");
    expect(page).not.toBeNull();
    expect(page?.getAttribute("aria-label")).toContain("Native Kortex preview");
    expect(page?.getAttribute("data-page-index")).toBe("0");
    expect(host.querySelector(".paged-preview-pages")?.children.length).toBe(0);
  });
});
