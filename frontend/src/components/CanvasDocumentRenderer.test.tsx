// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDocument,
  layoutDocument,
  type NexusDocument,
} from "../../../packages/engine/src/index";
import { CanvasDocumentRenderer } from "./CanvasDocumentRenderer";

function makeCanvasContext(textCalls: string[]): CanvasRenderingContext2D {
  const methods: Record<string, unknown> = {
    measureText: (text: string) => ({ width: text.length * 6 }),
    fillText: (text: string) => { textCalls.push(String(text)); },
    setTransform: () => undefined,
    clearRect: () => undefined,
    fillRect: () => undefined,
    strokeRect: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    stroke: () => undefined,
    fill: () => undefined,
    closePath: () => undefined,
    rect: () => undefined,
    ellipse: () => undefined,
    clip: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    setLineDash: () => undefined,
    drawImage: () => { textCalls.push("__drawImage__"); },
  };
  return new Proxy(methods as unknown as CanvasRenderingContext2D, {
    get(target, property) {
      if (property in target) return target[property as keyof CanvasRenderingContext2D];
      return () => undefined;
    },
    set(target, property, value) {
      (target as unknown as Record<PropertyKey, unknown>)[property] = value;
      return true;
    },
  });
}

function makeRenderFixture(): NexusDocument {
  const document = createDocument({ title: "Canvas renderer regression" });
  const original = document.content[0];
  if (!original || original.type !== "paragraph") throw new Error("Expected initial paragraph");
  original.children[0]!.text = "Shape body";
  original.editorObject = {
    kind: "shape",
    shape: "rectangle",
    label: "Shape label",
    fill: "#fef3c7",
    stroke: "#d97706",
    width: 160,
    height: 60,
  };
  document.content.push({
    type: "paragraph",
    id: "renderer-body",
    children: [{ type: "text", id: "renderer-body-run", text: "Body text", marks: [{ type: "bold" }] }],
  });
  document.content.push({
    type: "table",
    id: "renderer-table",
    children: [{
      type: "tableRow",
      id: "renderer-row",
      children: [{
        type: "tableCell",
        id: "renderer-cell",
        children: [{
          type: "paragraph",
          id: "renderer-cell-paragraph",
          children: [{ type: "text", id: "renderer-cell-run", text: "Table cell text", marks: [] }],
        }],
        images: [{
          type: "image",
          id: "renderer-cell-image",
          resourceId: "renderer-cell-image-resource",
          alt: "Table cell image",
          width: 24,
          height: 24,
        }],
      }],
    }],
  });
  document.content.push({
    type: "heading",
    id: "renderer-heading",
    level: 2,
    children: [{ type: "text", id: "renderer-heading-run", text: "Heading text", marks: [] }],
  });
  document.content.push({
    type: "blockquote",
    id: "renderer-quote",
    children: [{
      type: "paragraph",
      id: "renderer-quote-paragraph",
      children: [{ type: "text", id: "renderer-quote-run", text: "Quoted renderer text", marks: [] }],
    }],
  });
  document.content.push({
    type: "orderedList",
    id: "renderer-list",
    start: 2,
    children: [{
      type: "listItem",
      id: "renderer-list-item",
      children: [{
        type: "paragraph",
        id: "renderer-list-paragraph",
        children: [{ type: "text", id: "renderer-list-run", text: "List item text", marks: [] }],
      }],
    }],
  });
  document.content.push({
    type: "image",
    id: "renderer-image",
    resourceId: "renderer-image-resource",
    alt: "Image alternative text",
    width: 24,
    height: 24,
  });
  document.content.push({
    type: "thematicBreak",
    id: "renderer-page-break",
    kind: "pageBreak",
  });
  document.content.push({
    type: "paragraph",
    id: "renderer-second-page",
    children: [{ type: "text", id: "renderer-second-page-run", text: "Text on the second page", marks: [] }],
  });
  document.resources.push(
    {
      id: "renderer-image-resource",
      kind: "image",
      mimeType: "image/png",
      data: "iVBORw0KGgo=",
      byteLength: 8,
      name: "fixture.png",
    },
    {
      id: "renderer-cell-image-resource",
      kind: "image",
      mimeType: "image/png",
      data: "Y2VsbC1pbWFnZQ==",
      byteLength: 10,
      name: "cell-fixture.png",
    },
  );
  return document;
}

describe("CanvasDocumentRenderer visual regression contract", () => {
  let host: HTMLDivElement | undefined;
  let root: ReturnType<typeof createRoot> | undefined;
  let contextSpy: { mockRestore: () => void } | undefined;
  let imageSpy: { mockRestore: () => void } | undefined;

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    contextSpy?.mockRestore();
    imageSpy?.mockRestore();
    vi.restoreAllMocks();
    host?.remove();
    host = undefined;
    root = undefined;
    contextSpy = undefined;
    imageSpy = undefined;
  });

  it("continues pointer drag hit-testing on the page under the pointer", async () => {
    const document = makeRenderFixture();
    const layout = layoutDocument(document);
    expect(layout.pageCount).toBeGreaterThan(1);
    const context = makeCanvasContext([]);
    contextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context);
    const hits: Array<{ pageIndex: number; phase?: string }> = [];
    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(CanvasDocumentRenderer, {
        document,
        layout,
        onHitTest: (target, _clickCount, phase) => hits.push({ pageIndex: target.pageIndex, phase }),
      }));
    });
    const canvases = Array.from(host.querySelectorAll<HTMLCanvasElement>("canvas.kortex-canvas-page"));
    const pageHeight = layout.pages[0]!.height * 96 / 72;
    const pageWidth = layout.pages[0]!.width * 96 / 72;
    canvases.forEach((canvas, index) => {
      vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
        x: 0, y: index * (pageHeight + 24), left: 0, right: pageWidth,
        top: index * (pageHeight + 24), bottom: index * (pageHeight + 24) + pageHeight,
        width: pageWidth, height: pageHeight, toJSON: () => ({}),
      } as DOMRect);
    });
    const first = canvases[0]!;
    const pointerEvent = (type: string, y: number, buttons: number) => {
      const event = new MouseEvent(type, {
        bubbles: true, cancelable: true, clientX: 120, clientY: y, buttons, detail: 1,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      return event;
    };
    await act(async () => {
      first.dispatchEvent(pointerEvent("pointerdown", 100, 1));
      first.dispatchEvent(pointerEvent("pointermove", pageHeight + 12, 1));
      first.dispatchEvent(pointerEvent("pointermove", pageHeight + 124, 1));
      // Simulate the hit-test losing the page target at pointer-up; the drag must
      // still emit its final phase using the last valid target.
      canvases.forEach(canvas => { canvas.dataset.pageIndex = "invalid"; });
      first.dispatchEvent(pointerEvent("pointerup", pageHeight + 124, 0));
    });
    expect(hits.some(hit => hit.pageIndex === 0 && hit.phase === "start")).toBe(true);
    expect(hits.some(hit => hit.pageIndex === 1 && hit.phase === "move")).toBe(true);
    expect(hits.some(hit => hit.pageIndex === 1 && hit.phase === "end")).toBe(true);
    expect(hits[hits.length - 1]).toEqual({ pageIndex: 1, phase: "end" });

    // A cancelled drag must also close the logical selection even when hit-testing fails.
    canvases.forEach((canvas, index) => { canvas.dataset.pageIndex = String(index); });
    await act(async () => {
      first.dispatchEvent(pointerEvent("pointerdown", 100, 1));
      canvases.forEach(canvas => { canvas.dataset.pageIndex = "invalid"; });
      first.dispatchEvent(pointerEvent("pointercancel", 100, 0));
    });
    expect(hits[hits.length - 1]).toEqual({ pageIndex: 0, phase: "end" });
  });

  it("draws text, table cells, semantic objects, header, footer, and page numbers", async () => {
    const document = makeRenderFixture();
    const imageSources: string[] = [];
    imageSpy = vi.spyOn(window, "Image").mockImplementation(() => {
      const image = window.document.createElement("img");
      let source = "";
      const isCellImage = () => source.includes("Y2VsbC1pbWFnZQ==");
      Object.defineProperty(image, "complete", { configurable: true, get: isCellImage });
      Object.defineProperty(image, "naturalWidth", { configurable: true, get: () => isCellImage() ? 1 : 0 });
      Object.defineProperty(image, "src", {
        configurable: true,
        set: (value: string) => {
          source = value;
          imageSources.push(value);
          image.onload?.call(image, new Event("load") as unknown as Event);
        },
      });
      return image;
    });
    const layout = layoutDocument(document);
    const textCalls: string[] = [];
    const context = makeCanvasContext(textCalls);
    contextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(() => context);

    host = window.document.createElement("div");
    window.document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(CanvasDocumentRenderer, {
        document,
        layout,
        headerText: "Document header",
        footerText: "Document footer",
        footerAlign: "right",
        showPageNumbers: true,
        showFormattingMarks: true,
      }));
    });

    expect(host.querySelector('[data-renderer="canvas-2d"]')).not.toBeNull();
    expect(textCalls).toContain("Shape label");
    expect(textCalls).toContain("Body text");
    expect(textCalls).toContain("Heading text");
    expect(textCalls).toContain("Quoted renderer text");
    expect(textCalls).toContain("List item text");
    expect(textCalls).toContain("2.");
    expect(textCalls).toContain("Table cell text");
    expect(textCalls.filter(value => value === "__drawImage__").length).toBeGreaterThanOrEqual(1);
    expect(imageSources).toContain("data:image/png;base64,Y2VsbC1pbWFnZQ==");
    expect(textCalls).toContain("Image alternative text");
    expect(layout.pageCount).toBeGreaterThan(1);
    expect(textCalls).toContain("Document header");
    expect(textCalls).toContain("Document footer");
    expect(textCalls).toContain("¶");
    expect(textCalls.some(value => value.startsWith("Página 1 de "))).toBe(true);
    expect(host.querySelectorAll("canvas.kortex-canvas-page").length).toBe(layout.pageCount);
  });
});
