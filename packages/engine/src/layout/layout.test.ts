import { describe, expect, it } from "vitest";
import { layoutDocument, type TextMetrics } from "./layout";
import type { Block, NexusDocument } from "../model/types";

const metrics: TextMetrics = { measureText: text => text.length * 5, lineHeight: size => size * 1.2 };
function paragraph(id: string, text: string): Block {
  return { type: "paragraph", id, children: [{ type: "text", id: id + "-run", text, marks: [] }] };
}
function documentWith(content: Block[], page = { unit: "pt" as const, width: 160, height: 200, orientation: "portrait" as const, margins: { top: 10, right: 10, bottom: 10, left: 10 } }): NexusDocument {
  return { id: "doc", schemaVersion: 1, metadata: {}, pageConfig: page, content, resources: [] };
}

describe("native layout engine", () => {
  it("calculates content dimensions from page size and margins", () => {
    const result = layoutDocument(documentWith([paragraph("p1", "Hello")]), { metrics });
    expect(result.pages[0].content).toEqual({ x: 10, y: 10, width: 140, height: 180 });
    expect(result.pages[0].blocks[0].rect.x).toBe(10);
    expect(result.pages[0].blocks[0].lines[0].text).toBe("Hello");
  });

  it("wraps text into measurable lines and splits long paragraphs at page boundaries", () => {
    const text = Array.from({ length: 180 }, (_, index) => "word" + index).join(" ");
    const result = layoutDocument(documentWith([paragraph("long", text)]), { metrics, fontSize: 12 });
    expect(result.pageCount).toBeGreaterThan(1);
    const fragments = result.pages.flatMap(page => page.blocks.filter(block => block.blockId === "long"));
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments[0].continued).toBeFalsy();
    expect(fragments[1].continued).toBe(true);
    expect(fragments.every(fragment => fragment.rect.y + fragment.rect.height <= 190.01)).toBe(true);
  });

  it("honors explicit page breaks before block ids", () => {
    const result = layoutDocument(documentWith([paragraph("a", "A"), paragraph("b", "B")]), { metrics, breakBefore: ["b"] });
    expect(result.pageCount).toBe(2);
    expect(result.pages[1].blocks[0].blockId).toBe("b");
  });

  it("uses row boundaries when a table spans multiple pages", () => {
    const table: Block = { type: "table", id: "t", children: Array.from({ length: 12 }, (_, r) => ({
      type: "tableRow" as const, id: "r" + r, children: Array.from({ length: 2 }, (_, c) => ({
        type: "tableCell" as const, id: "c" + r + "-" + c, children: [{ type: "paragraph" as const, id: "p" + r + "-" + c, children: [{ type: "text" as const, id: "run" + r + "-" + c, text: "cell value", marks: [] }] }]
      }))
    })) };
    const result = layoutDocument(documentWith([table]), { metrics });
    expect(result.pageCount).toBeGreaterThan(1);
    const fragments = result.pages.flatMap(page => page.blocks.filter(block => block.blockId === "t"));
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.every(fragment => (fragment.table?.rows.length || 0) > 0)).toBe(true);
    expect(fragments.flatMap(fragment => fragment.table?.rows || []).map(row => row.rowId)).toHaveLength(12);
  });

  it("keeps a heading with the first line of its following paragraph", () => {
    const heading: Block = { type: "heading", id: "h", level: 1, children: [{ type: "text", id: "hr", text: "Section", marks: [] }] };
    const result = layoutDocument(documentWith([paragraph("lead", "Lead text Lead text Lead text"), heading, paragraph("body", "Body text")], {
      unit: "pt", width: 160, height: 100, orientation: "portrait",
      margins: { top: 10, right: 10, bottom: 10, left: 10 }
    }), { metrics, keepHeadingsWithNext: true });
    const headingBlock = result.pages.flatMap(page => page.blocks).find(block => block.blockId === "h");
    const bodyBlock = result.pages.flatMap(page => page.blocks).find(block => block.blockId === "body");
    expect(headingBlock?.pageIndex).toBe(1);
    expect(bodyBlock?.pageIndex).toBe(headingBlock?.pageIndex);
  });

  it("marks only table fragments after the first as continued", () => {
    const table: Block = { type: "table", id: "continued-table", children: Array.from({ length: 12 }, (_, r) => ({
      type: "tableRow" as const, id: "ct-r" + r, children: [{ type: "tableCell" as const, id: "ct-c" + r, children: [
        { type: "paragraph" as const, id: "ct-p" + r, children: [{ type: "text" as const, id: "ct-run" + r, text: "cell value", marks: [] }] }
      ] }]
    })) };
    const result = layoutDocument(documentWith([table]), { metrics });
    const fragments = result.pages.flatMap(page => page.blocks.filter(block => block.blockId === "continued-table"));
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments[0].continued).toBe(false);
    expect(fragments.slice(1).every(fragment => fragment.continued === true)).toBe(true);
  });

  it("applies paragraph alignment to line geometry", () => {
    const centered: Block = { type: "paragraph", id: "center", align: "center", children: [{ type: "text", id: "center-run", text: "Hi", marks: [] }] };
    const ended: Block = { type: "paragraph", id: "end", align: "end", children: [{ type: "text", id: "end-run", text: "Hi", marks: [] }] };
    const result = layoutDocument(documentWith([centered, ended]), { metrics });
    const centerLine = result.pages[0].blocks.find(block => block.blockId === "center")!.lines[0];
    const endLine = result.pages[0].blocks.find(block => block.blockId === "end")!.lines[0];
    expect(centerLine.x).toBeGreaterThan(10);
    expect(centerLine.align).toBe("center");
    expect(endLine.x).toBeGreaterThan(centerLine.x);
    expect(endLine.align).toBe("end");
  });

  it("measures mixed font sizes per run and retains run-level layout metrics", () => {
    const mixed: Block = { type: "paragraph", id: "mixed", children: [
      { type: "text", id: "small-run", text: "small ", marks: [{ type: "fontSize", value: 8 }] },
      { type: "text", id: "large-run", text: "LARGE", marks: [{ type: "fontSize", value: 24 }, { type: "bold" }] }
    ] };
    const result = layoutDocument(documentWith([mixed]), { metrics });
    const line = result.pages[0].blocks[0].lines[0];
    expect(line.height).toBeCloseTo(28.8, 5);
    expect(line.runs).toHaveLength(2);
    expect(line.runs?.[0].fontSize).toBe(8);
    expect(line.runs?.[1].fontSize).toBe(24);
    expect(line.runs?.[1].marks.some(mark => mark.type === "bold")).toBe(true);
  });

  it("retains ordered, unordered, nested list markers and blockquote prefixes", () => {
    const nested: Block = { type: "orderedList", id: "list", start: 3, children: [
      { type: "listItem", id: "item-1", children: [
        { type: "paragraph", id: "item-p", children: [{ type: "text", id: "item-r", text: "First", marks: [] }] },
        { type: "bulletList", id: "nested-list", children: [
          { type: "listItem", id: "nested-item", children: [{ type: "paragraph", id: "nested-p", children: [{ type: "text", id: "nested-r", text: "Nested", marks: [] }] }] }
        ] }
      ] }
    ] };
    const quote: Block = { type: "blockquote", id: "quote", children: [
      { type: "paragraph", id: "quote-p", children: [{ type: "text", id: "quote-r", text: "Quoted", marks: [] }] }
    ] };
    const result = layoutDocument(documentWith([nested, quote]), { metrics });
    const listText = result.pages[0].blocks.find(block => block.blockId === "list")!.lines.map(line => line.text).join("\\n");
    const quoteText = result.pages[0].blocks.find(block => block.blockId === "quote")!.lines.map(line => line.text).join("\\n");
    expect(listText).toContain("3. First");
    expect(listText).toContain("• Nested");
    expect(quoteText).toContain("│ Quoted");
  });

  it("reports invalid page geometry and safely uses a default page", () => {
    const invalid = { unit: "pt" as const, width: 100, height: 100, orientation: "portrait" as const, margins: { top: 80, right: 80, bottom: 80, left: 80 } };
    const result = layoutDocument(documentWith([paragraph("p", "fallback")], invalid), { metrics });
    expect(result.diagnostics.some(item => item.code === "INVALID_PAGE_CONFIG")).toBe(true);
    expect(result.pages[0].content.width).toBeGreaterThan(0);
  });
});
