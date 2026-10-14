import { describe, expect, it } from "vitest";
import { layoutDocument, type TextMetrics } from "./layout";
import type { Block, NexusDocument } from "../model/types";

const metrics: TextMetrics = { measureText: text => text.length * 5, lineHeight: size => size * 1.2 };
function paragraph(id: string, text: string): Block {
  return { type: "paragraph", id, children: [{ type: "text", id: id + "-run", text, marks: [] }] };
}
function documentWith(content: Block[], page = { unit: "pt" as const, width: 200, height: 160, orientation: "portrait" as const, margins: { top: 10, right: 10, bottom: 10, left: 10 } }): NexusDocument {
  return { id: "doc", schemaVersion: 1, metadata: {}, pageConfig: page, content, resources: [] };
}

describe("native layout engine", () => {
  it("calculates content dimensions from page size and margins", () => {
    const result = layoutDocument(documentWith([paragraph("p1", "Hello")]), { metrics });
    expect(result.pages[0].content).toEqual({ x: 10, y: 10, width: 180, height: 140 });
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
    expect(fragments.every(fragment => fragment.rect.y + fragment.rect.height <= 150.01)).toBe(true);
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

  it("reports invalid page geometry and safely uses a default page", () => {
    const invalid = { unit: "pt" as const, width: 100, height: 100, orientation: "portrait" as const, margins: { top: 80, right: 80, bottom: 80, left: 80 } };
    const result = layoutDocument(documentWith([paragraph("p", "fallback")], invalid), { metrics });
    expect(result.diagnostics.some(item => item.code === "INVALID_PAGE_CONFIG")).toBe(true);
    expect(result.pages[0].content.width).toBeGreaterThan(0);
  });
});
