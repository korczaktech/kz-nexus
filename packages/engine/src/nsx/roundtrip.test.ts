import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument, setMetadata } from "../commands/document";
import { insertText } from "../commands/text";
import { applyMark } from "../commands/marks";
import { insertList, insertListItem } from "../commands/list";
import { insertTable, setCellText } from "../commands/table";
import { setHeadingLevel, setAlign, setIndent, setParagraphStyle, insertBlockquote, insertThematicBreak } from "../commands/block";
import { addResource } from "../resources/resources";
import { insertImage } from "../commands/image";
import { writeNsx } from "./writer";
import { readNsx } from "./reader";
import { getPlainText } from "../model/tree";
import type { Block, NexusDocument, Paragraph, Table } from "../model/types";
import { CURRENT_NSX_FORMAT_VERSION, NSX_FORMAT_ID } from "./envelope";
import { DEFAULT_LIMITS } from "../schema/schema";

function ctx() {
  return { generateId: createIdGenerator("id", 11) };
}

function roundTrip(doc: NexusDocument) {
  const written = writeNsx(doc);
  if (!written.ok) throw written.error;
  const read = readNsx(written.value, createIdGenerator("n", 999));
  if (!read.ok) throw read.error;
  return { text: written.value, document: read.value };
}

describe(".nsx round-trip", () => {
  it("preserves an empty/minimal document", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const { document } = roundTrip(doc);
    expect(getPlainText(document.content[0] as Paragraph)).toBe("");
  });


  it("preserves nested lists and tables inside cells in NSX round-trips", () => {
    const commandCtx = ctx();
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const initial = doc.content[0]!;
    const inserted = insertTable({ afterBlockId: initial.id, rows: 1, columns: 1 })(doc, commandCtx);
    if (!inserted.ok) throw inserted.error;
    const table = inserted.value.document.content.find(block => block.type === "table");
    if (!table || table.type !== "table") throw new Error("Expected table");
    const nested: Block[] = [
      { type: "bulletList", id: "nested-list", children: [{
        type: "listItem", id: "nested-item", children: [{
          type: "paragraph", id: "nested-list-paragraph", children: [{ type: "text", id: "nested-list-run", text: "List inside cell", marks: [] }],
        }],
      }] },
      { type: "table", id: "nested-table", children: [{
        type: "tableRow", id: "nested-row", children: [{
          type: "tableCell", id: "nested-cell", children: [{
            type: "paragraph", id: "nested-table-paragraph", children: [{ type: "text", id: "nested-table-run", text: "Table inside cell", marks: [] }],
          }],
        }],
      }] },
    ];
    const updatedTable: Table = {
      ...table,
      children: table.children.map(row => ({
        ...row,
        children: row.children.map(cell => cell.id === table.children[0]!.children[0]!.id ? { ...cell, children: nested } : cell),
      })),
    };
    const nestedDocument = {
      ...inserted.value.document,
      content: inserted.value.document.content.map(block => block.id === table.id ? updatedTable : block),
    };
    const { document } = roundTrip(nestedDocument);
    const restoredTable = document.content.find(block => block.type === "table");
    if (!restoredTable || restoredTable.type !== "table") throw new Error("Expected restored table");
    const restoredCell = restoredTable.children[0]!.children[0]!;
    expect(restoredCell.children.map(block => block.type)).toEqual(["bulletList", "table"]);
    expect(getPlainText(restoredCell.children[0]!)).toContain("List inside cell");
    expect(getPlainText(restoredCell.children[1]!)).toContain("Table inside cell");
  });

  it("preserves author metadata", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now, { title: "Metadata document" });
    const updated = setMetadata({ key: "author", value: "Korczak Technologies" })(doc, ctx());
    if (!updated.ok) throw updated.error;
    const { document } = roundTrip(updated.value.document);
    expect(document.metadata.title).toBe("Metadata document");
    expect(document.metadata.author).toBe("Korczak Technologies");
  });

  it("preserves plain text content", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const withText = insertText({ blockId: doc.content[0].id, offset: 0, text: "Hello, Korczak!" })(doc, ctx());
    if (!withText.ok) throw withText.error;
    const { document } = roundTrip(withText.value.document);
    expect(getPlainText(document.content[0] as Paragraph)).toBe("Hello, Korczak!");
  });

  it("preserves bold/italic formatting marks", () => {
    const commandCtx = ctx();
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const withText = insertText({ blockId: doc.content[0].id, offset: 0, text: "Bold text" })(doc, commandCtx);
    if (!withText.ok) throw withText.error;
    const withMark = applyMark({ blockId: doc.content[0].id, start: 0, end: 4, mark: { type: "bold" } })(withText.value.document, commandCtx);
    if (!withMark.ok) throw withMark.error;
    const { document } = roundTrip(withMark.value.document);
    const paragraph = document.content[0] as Paragraph;
    expect(paragraph.children[0].marks).toContainEqual({ type: "bold" });
  });

  it("preserves multiple paragraphs and headings", () => {
    const commandCtx = ctx();
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const asHeading = setHeadingLevel({ blockId: doc.content[0].id, level: 1 })(doc, commandCtx);
    if (!asHeading.ok) throw asHeading.error;
    const withText = insertText({ blockId: doc.content[0].id, offset: 0, text: "Title" })(asHeading.value.document, commandCtx);
    if (!withText.ok) throw withText.error;
    const { document } = roundTrip(withText.value.document);
    expect(document.content[0].type).toBe("heading");
    expect(getPlainText(document.content[0] as Paragraph)).toBe("Title");
  });

  it("preserves lists", () => {
    const commandCtx = ctx();
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const withList = insertList({ afterBlockId: doc.content[0].id, ordered: true })(doc, commandCtx);
    if (!withList.ok) throw withList.error;
    const listId = withList.value.document.content[1].id;
    const withItem = insertListItem({ listId })(withList.value.document, commandCtx);
    if (!withItem.ok) throw withItem.error;
    const { document } = roundTrip(withItem.value.document);
    expect(document.content[1].type).toBe("orderedList");
  });

  it("preserves tables", () => {
    const commandCtx = ctx();
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const withTable = insertTable({ afterBlockId: doc.content[0].id, rows: 2, columns: 2 })(doc, commandCtx);
    if (!withTable.ok) throw withTable.error;
    const table = withTable.value.document.content[1] as Table;
    const withCellText = setCellText({ tableId: table.id, rowId: table.children[0].id, cellId: table.children[0].children[0].id, text: "Cell A1" })(
      withTable.value.document,
      commandCtx,
    );
    if (!withCellText.ok) throw withCellText.error;
    const { document } = roundTrip(withCellText.value.document);
    const readTable = document.content[1] as Table;
    expect(getPlainText(readTable.children[0].children[0].children[0])).toBe("Cell A1");
  });

  it("preserves embedded resources referenced by images", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const commandCtx = ctx();
    const added = addResource(doc, { kind: "image", mimeType: "image/png", data: "aGVsbG8=" }, commandCtx.generateId);
    if (!added.ok) throw added.error;
    const withImage = insertImage({ afterBlockId: doc.content[0].id, resourceId: added.value.resource.id, alt: "logo", width: 640, height: 480 })(
      added.value.document,
      commandCtx,
    );
    if (!withImage.ok) throw withImage.error;
    const { document } = roundTrip(withImage.value.document);
    expect(document.resources).toHaveLength(1);
    expect(document.resources[0]).toMatchObject({ kind: "image", mimeType: "image/png", data: "aGVsbG8=", byteLength: 5 });
    expect(document.content[1]).toMatchObject({ type: "image", alt: "logo", width: 640, height: 480 });
  });

  it("preserves metadata", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now, { title: "Meu Documento" });
    const { document } = roundTrip(doc);
    expect(document.metadata.title).toBe("Meu Documento");
  });

  it("preserves Portuguese accents, emoji, and combining characters", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const text = "Ação, não, café, São Paulo 🚀 e\u0301";
    const withText = insertText({ blockId: doc.content[0].id, offset: 0, text })(doc, ctx());
    if (!withText.ok) throw withText.error;
    const { document } = roundTrip(withText.value.document);
    expect(getPlainText(document.content[0] as Paragraph)).toBe(text);
  });

  it("preserves every supported inline mark and mark value", () => {
    const commandCtx = ctx();
    const doc = createDocument(createIdGenerator("marks", 1), createFixedClock(0).now);
    const text = "abcdefghijkl";
    const inserted = insertText({ blockId: doc.content[0].id, offset: 0, text })(doc, commandCtx);
    if (!inserted.ok) throw inserted.error;
    const marks = [
      { type: "bold" }, { type: "italic" }, { type: "underline" }, { type: "strike" },
      { type: "superscript" }, { type: "subscript" }, { type: "color", value: "#123456" },
      { type: "highlight", value: "#abcdef" }, { type: "fontSize", value: 18 },
      { type: "fontFamily", value: "Arial" }, { type: "link", value: "https://example.com" },
      { type: "comment", value: "review this text" },
    ] as const;
    let current = inserted.value.document;
    for (const [index, mark] of marks.entries()) {
      const result = applyMark({ blockId: doc.content[0].id, start: index, end: index + 1, mark })(current, commandCtx);
      if (!result.ok) throw result.error;
      current = result.value.document;
    }
    const { document } = roundTrip(current);
    const paragraph = document.content[0] as Paragraph;
    for (const [index, mark] of marks.entries()) {
      expect(paragraph.children.find(run => run.text.includes(text[index]))?.marks).toContainEqual(mark);
    }
  });

  it("preserves paragraph layout, indentation, and alignment fields", () => {
    const commandCtx = ctx();
    const doc = createDocument(createIdGenerator("layout", 1), createFixedClock(0).now);
    const blockId = doc.content[0].id;
    const aligned = setAlign({ blockId, align: "justify" })(doc, commandCtx);
    if (!aligned.ok) throw aligned.error;
    const indented = setIndent({ blockId, indent: 24 })(aligned.value.document, commandCtx);
    if (!indented.ok) throw indented.error;
    const styled = setParagraphStyle({
      blockId, spacingBefore: 8, spacingAfter: 12, lineSpacing: 1.5,
      backgroundColor: "#ffffff", borderColor: "#123456", borderWidth: 2,
      padding: 6, firstLineIndent: 18, hangingIndent: 4,
    })(indented.value.document, commandCtx);
    if (!styled.ok) throw styled.error;
    const { document } = roundTrip(styled.value.document);
    expect(document.content[0]).toMatchObject({
      type: "paragraph", align: "justify", indent: 24,
      spacingBefore: 8, spacingAfter: 12, lineSpacing: 1.5,
      backgroundColor: "#ffffff", borderColor: "#123456", borderWidth: 2,
      padding: 6, firstLineIndent: 18, hangingIndent: 4,
    });
  });

  it("preserves blockquotes and thematic breaks", () => {
    const commandCtx = ctx();
    const doc = createDocument(createIdGenerator("blocks", 1), createFixedClock(0).now);
    const quoteResult = insertBlockquote({ afterBlockId: doc.content[0].id })(doc, commandCtx);
    if (!quoteResult.ok) throw quoteResult.error;
    const quote = quoteResult.value.document.content[1];
    if (quote.type !== "blockquote") throw new Error("Expected blockquote");
    const quoteText = insertText({ blockId: quote.children[0].id, offset: 0, text: "Quoted content" })(quoteResult.value.document, commandCtx);
    if (!quoteText.ok) throw quoteText.error;
    const separatorResult = insertThematicBreak({ afterBlockId: quote.id })(quoteText.value.document, commandCtx);
    if (!separatorResult.ok) throw separatorResult.error;
    const { document } = roundTrip(separatorResult.value.document);
    expect(document.content[1].type).toBe("blockquote");
    if (document.content[1].type === "blockquote") {
      expect(getPlainText(document.content[1].children[0])).toBe("Quoted content");
    }
    expect(document.content[2].type).toBe("thematicBreak");
  });

  it("keeps stable IDs and metadata through repeated round-trips", () => {
    const doc = createDocument(createIdGenerator("stable", 1), createFixedClock(0).now, { title: "Stable IDs" });
    const first = roundTrip(doc).document;
    const second = roundTrip(first).document;
    expect(second.id).toBe(first.id);
    expect(second.content.map(block => block.id)).toEqual(first.content.map(block => block.id));
    expect(second.metadata).toEqual(first.metadata);
    expect(second.pageConfig).toEqual(first.pageConfig);
  });

  it("produces a readable envelope with the expected format identifiers", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const written = writeNsx(doc);
    if (!written.ok) throw written.error;
    const parsed = JSON.parse(written.value);
    expect(parsed.format).toBe(NSX_FORMAT_ID);
    expect(parsed.formatVersion).toBe(CURRENT_NSX_FORMAT_VERSION);
  });
});

describe(".nsx error handling", () => {
  it("rejects empty input", () => {
    const result = readNsx("", createIdGenerator("n", 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CORRUPTED_CONTENT");
  });

  it("rejects invalid JSON", () => {
    const result = readNsx("{ this is not json", createIdGenerator("n", 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CORRUPTED_CONTENT");
  });

  it("rejects a JSON payload that is not a Korczak Nexus envelope", () => {
    const result = readNsx(JSON.stringify({ hello: "world" }), createIdGenerator("n", 1));
    expect(result.ok).toBe(false);
  });

  it("rejects an unrecognized format identifier", () => {
    const result = readNsx(JSON.stringify({ format: "some-other-format", formatVersion: 1, document: {} }), createIdGenerator("n", 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("rejects a formatVersion from the future", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const result = readNsx(JSON.stringify({ format: NSX_FORMAT_ID, formatVersion: 999, document: doc }), createIdGenerator("n", 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VERSION_MISMATCH");
  });

  it("rejects a document whose schemaVersion is from the future", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const futureDoc = { ...doc, schemaVersion: 999 };
    const result = readNsx(JSON.stringify({ format: NSX_FORMAT_ID, formatVersion: 1, document: futureDoc }), createIdGenerator("n", 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VERSION_MISMATCH");
  });

  it("rejects a document that fails structural validation", () => {
    const result = readNsx(JSON.stringify({ format: NSX_FORMAT_ID, formatVersion: 1, document: { id: "n_x", schemaVersion: 1, content: [] } }), createIdGenerator("n", 1));
    expect(result.ok).toBe(false);
  });

  it("rejects a file that exceeds the configured maxDocumentBytes", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const written = writeNsx(doc);
    if (!written.ok) throw written.error;
    const result = readNsx(written.value, createIdGenerator("n", 1), {
      maxDocumentBytes: 10,
      maxNodes: 50_000,
      maxTreeDepth: 64,
      maxTextRunLength: 100_000,
      maxResources: 500,
      maxResourceBytes: 10 * 1024 * 1024,
      maxMetadataEntries: 64,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LIMIT_EXCEEDED");
  });

  it("never writes an invalid document", () => {
    const invalid = { id: "n_x", schemaVersion: 1, metadata: {}, pageConfig: {}, content: [], resources: [] } as unknown as NexusDocument;
    const result = writeNsx(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_DOCUMENT");
  });
});


describe(".nsx safety limits keep their own error code", () => {
  it("reports LIMIT_EXCEEDED (not CORRUPTED_CONTENT) when maxNodes is exceeded", () => {
    const gen = createIdGenerator("n", 21);
    const { now } = createFixedClock(0);
    const doc = createDocument(gen, now);
    const saved = writeNsx(doc);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const result = readNsx(saved.value, createIdGenerator("r", 1), { ...DEFAULT_LIMITS, maxNodes: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("LIMIT_EXCEEDED");
  });
});
