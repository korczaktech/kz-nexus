import { describe, expect, it } from "vitest";
import { layoutDocument, type TextMetrics } from "./layout";
import type { Block, NexusDocument } from "../model/types";

const metrics: TextMetrics = { measureText: text => text.length * 5, lineHeight: size => size * 1.2 };
function paragraph(id: string, text: string): Block {
  return { type: "paragraph", id, children: [{ type: "text", id: id + "-run", text, marks: [] }] };
}
function documentWith(content: Block[], page: NexusDocument["pageConfig"] = { unit: "pt", width: 160, height: 200, orientation: "portrait", margins: { top: 10, right: 10, bottom: 10, left: 10 } }): NexusDocument {
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
      unit: "pt", width: 100, height: 100, orientation: "portrait",
      margins: { top: 10, right: 10, bottom: 10, left: 10 }
    }), { metrics, keepHeadingsWithNext: true });
    const headingBlock = result.pages.flatMap(page => page.blocks).find(block => block.blockId === "h");
    const bodyBlock = result.pages.flatMap(page => page.blocks).find(block => block.blockId === "body");
    expect(headingBlock?.pageIndex).toBe(1);
    expect(bodyBlock?.pageIndex).toBe(headingBlock?.pageIndex);
  });

  it("keeps a paragraph together when it fits on a fresh page", () => {
    const result = layoutDocument(documentWith([
      paragraph("lead-together", "Lead text Lead text Lead text Lead text Lead text"),
      paragraph("together", "A short paragraph")
    ], {
      unit: "pt", width: 100, height: 100, orientation: "portrait",
      margins: { top: 10, right: 10, bottom: 10, left: 10 }
    }), { metrics, keepParagraphsTogether: true });
    const lead = result.pages.flatMap(page => page.blocks).find(block => block.blockId === "lead-together");
    const kept = result.pages.flatMap(page => page.blocks).find(block => block.blockId === "together");
    expect(kept?.pageIndex).toBeGreaterThanOrEqual(lead?.pageIndex || 0);
    expect(kept?.continued).toBeFalsy();
    expect(kept?.rect.height).toBeLessThanOrEqual(result.pages[kept!.pageIndex]!.content.height);
  });

  it("splits oversized table rows at line boundaries without losing cell text", () => {
    const sourceText = Array.from({ length: 100 }, () => "wide text").join(" ");
    const table: Block = { type: "table", id: "oversized-table", children: [{
      type: "tableRow", id: "oversized-row", children: [{
        type: "tableCell", id: "oversized-cell", children: [{
          type: "paragraph", id: "oversized-p", children: [{
            type: "text", id: "oversized-run", text: sourceText, marks: []
          }]
        }]
      }]
    }] };
    const result = layoutDocument(documentWith([table], {
      unit: "pt", width: 100, height: 100, orientation: "portrait",
      margins: { top: 10, right: 10, bottom: 10, left: 10 }
    }), { metrics });
    const fragments = result.pages.flatMap(page => page.blocks.filter(block => block.blockId === "oversized-table"));
    const rendered = fragments.flatMap(fragment => fragment.table?.rows || []).flatMap(row => row.cells).flatMap(cell => cell.lines.map(line => line.text)).join(" ");
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments[0].continued).toBe(false);
    expect(fragments.slice(1).every(fragment => fragment.continued === true)).toBe(true);
    expect(rendered.trim().split(" ")).toEqual(sourceText.split(" "));
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
    const styledMetrics: TextMetrics = {
      measureText: (text, size) => text.length * size * 0.5,
      lineHeight: size => size * 1.2
    };
    const result = layoutDocument(documentWith([mixed]), { metrics: styledMetrics });
    const line = result.pages[0].blocks[0].lines[0];
    expect(line.height).toBeCloseTo(21.6, 5);
    expect(line.runs).toHaveLength(2);
    expect(line.runs?.[0].fontSize).toBe(6);
    expect(line.runs?.[1].fontSize).toBe(18);
    expect(line.runs?.[1].width).toBeGreaterThan(line.runs?.[0].width || 0);
    expect(line.runs?.[1].marks.some(mark => mark.type === "bold")).toBe(true);
  });

  it("preserves nested list and blockquote structure plus paragraph run styling", () => {
    const nested: Block = { type: "orderedList", id: "list", start: 3, children: [
      { type: "listItem", id: "item-1", children: [
        { type: "paragraph", id: "item-p", children: [{ type: "text", id: "item-r", text: "First", marks: [] }] },
        { type: "bulletList", id: "nested-list", children: [
          { type: "listItem", id: "nested-item", children: [{ type: "paragraph", id: "nested-p", children: [{ type: "text", id: "nested-r", text: "Nested", marks: [{ type: "bold" }] }] }] }
        ] }
      ] }
    ] };
    const quote: Block = { type: "blockquote", id: "quote", children: [
      { type: "paragraph", id: "quote-p", children: [{ type: "text", id: "quote-r", text: "Quoted", marks: [{ type: "italic" }] }] }
    ] };
    const result = layoutDocument(documentWith([nested, quote]), { metrics });
    const listLayout = result.pages[0].blocks.find(block => block.blockId === "list")!;
    const quoteLayout = result.pages[0].blocks.find(block => block.blockId === "quote")!;
    const topItem = listLayout.children?.[0];
    const nestedList = topItem?.children?.find(child => child.blockId === "nested-list");
    const nestedItem = nestedList?.children?.[0];
    const nestedParagraph = nestedItem?.children?.[0];
    expect(topItem?.type).toBe("listItem");
    expect(topItem?.marker).toBe("3.");
    expect(nestedList?.type).toBe("bulletList");
    expect(nestedItem?.marker).toBe("•");
    expect(nestedParagraph?.lines[0].runs?.[0].marks.some(mark => mark.type === "bold")).toBe(true);
    expect(quoteLayout.quote).toBe(true);
    expect(quoteLayout.children?.[0].blockId).toBe("quote-p");
    expect(quoteLayout.children?.[0].lines[0].runs?.[0].marks.some(mark => mark.type === "italic")).toBe(true);
  });

  it("fits oversized images to both dimensions of the printable page", () => {
    const image: Block = { type: "image", id: "tall-image", resourceId: "missing-resource", alt: "Tall image", width: 100, height: 500 };
    const result = layoutDocument(documentWith([image]), { metrics });
    const placed = result.pages[0].blocks.find(block => block.blockId === "tall-image")!;
    expect(placed.rect.width).toBeCloseTo(36, 5);
    expect(placed.rect.height).toBeCloseTo(180, 5);
    expect(result.diagnostics.some(item => item.code === "OVERSIZED_BLOCK" && item.blockId === "tall-image")).toBe(true);
  });

  it("splits long blockquote paragraphs across pages without dropping lines", () => {
    const longText = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive";
    const quote: Block = { type: "blockquote", id: "long-quote", children: [
      { type: "paragraph", id: "long-quote-p", children: [{ type: "text", id: "long-quote-run", text: longText, marks: [] }] }
    ] };
    const smallPage = { unit: "pt" as const, width: 160, height: 55, orientation: "landscape" as const, margins: { top: 5, right: 10, bottom: 5, left: 10 } };
    const result = layoutDocument(documentWith([quote], smallPage), { metrics });
    const fragments = result.pages.flatMap(page => page.blocks.filter(block => block.blockId === "long-quote"));
    const rendered = fragments.flatMap(fragment => fragment.children || []).flatMap(child => child.lines.map(line => line.text)).join(" ");
    expect(result.pageCount).toBeGreaterThan(1);
    expect(rendered.trim().split(" ")).toEqual(longText.split(" "));
    expect(fragments.every(fragment => fragment.rect.y + fragment.rect.height <= smallPage.height - smallPage.margins.bottom + 0.001)).toBe(true);
  });

  it("splits oversized table rows across pages without losing cell text", () => {
    const longText = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu";
    const table: Block = { type: "table", id: "long-table", children: [
      { type: "tableRow", id: "long-row", children: [
        { type: "tableCell", id: "long-cell", children: [
          { type: "paragraph", id: "long-cell-p", children: [{ type: "text", id: "long-cell-run", text: longText, marks: [] }] }
        ] }
      ] }
    ] };
    const smallPage = { unit: "pt" as const, width: 160, height: 55, orientation: "landscape" as const, margins: { top: 5, right: 10, bottom: 5, left: 10 } };
    const result = layoutDocument(documentWith([table], smallPage), { metrics });
    const fragments = result.pages.flatMap(page => page.blocks.filter(block => block.blockId === "long-table"));
    const rendered = fragments.flatMap(fragment => fragment.table?.rows || []).flatMap(row => row.cells).flatMap(cell => cell.lines.map(line => line.text)).join(" ");
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments[0].continued).toBe(false);
    expect(fragments.slice(1).every(fragment => fragment.continued === true)).toBe(true);
    expect(rendered.trim().split(" ")).toEqual(longText.split(" "));
    expect(fragments.every(fragment => fragment.rect.y + fragment.rect.height <= smallPage.height - smallPage.margins.bottom + 0.001)).toBe(true);
  });

  it("splits oversized plain-text list items across pages and keeps the marker once", () => {
    const longText = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty thirtyone thirtytwo thirtythree thirtyfour thirtyfive thirtysix thirtyseven thirtyeight thirtynine forty";
    const list: Block = { type: "orderedList", id: "long-list", start: 1, children: [
      { type: "listItem", id: "long-item", children: [
        { type: "paragraph", id: "long-item-p", children: [{ type: "text", id: "long-item-run", text: longText, marks: [] }] }
      ] }
    ] };
    const smallPage = { unit: "pt" as const, width: 160, height: 55, orientation: "landscape" as const, margins: { top: 5, right: 10, bottom: 5, left: 10 } };
    const result = layoutDocument(documentWith([list], smallPage), { metrics });
    const listFragments = result.pages.flatMap(page => page.blocks.filter(block => block.blockId === "long-list"));
    const itemFragments = listFragments.flatMap(fragment => fragment.children || []);
    const rendered = itemFragments.flatMap(item => item.children || []).flatMap(paragraph => paragraph.lines.map(line => line.text)).join(" ");
    expect(listFragments.length).toBeGreaterThan(1);
    expect(itemFragments[0].marker).toBe("1.");
    expect(itemFragments.slice(1).every(item => !item.marker)).toBe(true);
    expect(rendered.trim().split(" ")).toEqual(longText.split(" "));
    expect(listFragments.every(fragment => fragment.rect.y + fragment.rect.height <= smallPage.height - smallPage.margins.bottom + 0.001)).toBe(true);
  });

  it("paginates oversized nested list items at line boundaries without flattening or losing markers", () => {
    const nestedTexts = [
      "nested alpha bravo charlie delta",
      "nested echo foxtrot golf hotel",
      "nested india juliet kilo lima",
      "nested mike november oscar papa",
      "nested quebec romeo sierra tango",
      "nested uniform victor whiskey xray",
      "nested yankee zulu alpha bravo",
      "nested charlie delta echo foxtrot",
      "nested golf hotel india juliet",
      "nested kilo lima mike november"
    ];
    const p = (id: string, text: string) => ({
      type: "paragraph" as const, id,
      children: [{ type: "text" as const, id: id + "-run", text, marks: [] }]
    });
    const list: Block = { type: "orderedList", id: "outer-list", start: 4, children: [
      { type: "listItem", id: "outer-item", children: [
        p("outer-p", "Outer item introduction"),
        { type: "bulletList", id: "inner-list", children: nestedTexts.map((text, index) => ({
          type: "listItem" as const, id: "inner-item-" + index, children: [p("inner-p-" + index, text)]
        })) }
      ] }
    ] };
    const smallPage = { unit: "pt" as const, width: 160, height: 65, orientation: "landscape" as const, margins: { top: 5, right: 10, bottom: 5, left: 10 } };
    const result = layoutDocument(documentWith([list], smallPage), { metrics });
    const fragments = result.pages.flatMap(page => page.blocks.filter(block => block.blockId === "outer-list"));
    const visit = (blocks: typeof result.pages[number]["blocks"]): typeof result.pages[number]["blocks"] =>
      blocks.flatMap(block => [block, ...visit(block.children || [])]);
    const allNodes = result.pages.flatMap(page => visit(page.blocks));
    const rendered = allNodes.filter(block => block.type === "paragraph").flatMap(block => block.lines.map(line => line.text)).join(" ");
    expect(fragments.length).toBeGreaterThan(1);
    expect(allNodes.some(block => block.blockId === "inner-list" && block.type === "bulletList")).toBe(true);
    const expectedText = ["Outer item introduction", ...nestedTexts].join(" ");
    expect(rendered.replace(/\s+/g, " ").trim().split(" ")).toEqual(expectedText.split(" "));
    expect(allNodes.filter(block => block.blockId === "outer-item" && block.marker).map(block => block.marker)).toEqual(["4."]);
    for (let index = 0; index < nestedTexts.length; index++) {
      expect(allNodes.filter(block => block.blockId === "inner-item-" + index && block.marker).map(block => block.marker)).toEqual(["•"]);
    }
    expect(allNodes.every(block => block.rect.y + block.rect.height <= result.pages[block.pageIndex]!.content.y + result.pages[block.pageIndex]!.content.height + 0.001)).toBe(true);
  });

  it("reports invalid page geometry and safely uses a default page", () => {
    const invalid = { unit: "pt" as const, width: 100, height: 100, orientation: "portrait" as const, margins: { top: 80, right: 80, bottom: 80, left: 80 } };
    const result = layoutDocument(documentWith([paragraph("p", "fallback")], invalid), { metrics });
    expect(result.diagnostics.some(item => item.code === "INVALID_PAGE_CONFIG")).toBe(true);
    expect(result.pages[0].content.width).toBeGreaterThan(0);
  });
});
