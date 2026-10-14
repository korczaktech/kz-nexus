import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "../commands/document";
import { insertText } from "../commands/text";
import { applyMark } from "../commands/marks";
import { exportMarkdown } from "./markdown";
import type { Paragraph } from "../model/types";

describe("exportMarkdown", () => {
  it("preserves formatting and escapes Markdown punctuation", () => {
    const document = createDocument(createIdGenerator("markdowndoc", 1), createFixedClock(0).now);
    const paragraph = document.content[0] as Paragraph;
    const ctx = { generateId: createIdGenerator("markdowntest", 3) };
    const inserted = insertText({ blockId: paragraph.id, offset: 0, text: "hello *world* |" })(document, ctx);
    if (!inserted.ok) throw inserted.error;
    const marked = applyMark({ blockId: paragraph.id, start: 0, end: 15, mark: { type: "bold" } })(inserted.value.document, ctx);
    if (!marked.ok) throw marked.error;
    const markdown = exportMarkdown(marked.value.document);
    expect(markdown).toContain("**hello \\*world\\* \\|**");
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("renders headings, ordered lists, tables and embedded images", () => {
    const document = createDocument(createIdGenerator("markdownstructures", 1), createFixedClock(0).now);
    const heading = { type: "heading" as const, id: "heading-1", level: 2 as const, children: [{ type: "text" as const, id: "heading-run", text: "Title", marks: [] }] };
    const list = { type: "orderedList" as const, id: "ordered-1", start: 3, children: [{ type: "listItem" as const, id: "item-1", children: [{ type: "paragraph" as const, id: "item-p", children: [{ type: "text" as const, id: "item-run", text: "first", marks: [] }] }] }] };
    const table = { type: "table" as const, id: "table-1", children: [{ type: "tableRow" as const, id: "row-1", children: [{ type: "tableCell" as const, id: "cell-1", children: [{ type: "paragraph" as const, id: "cell-p", children: [{ type: "text" as const, id: "cell-run", text: "A|B", marks: [] }] }] }] }] };
    const image = { type: "image" as const, id: "image-1", resourceId: "resource-1", alt: "sample", width: 10, height: 10 };
    const resource = { id: "resource-1", kind: "image" as const, mimeType: "image/png", data: "aGVsbG8=", byteLength: 5 };
    const result = exportMarkdown({ ...document, content: [heading, list, table, image], resources: [resource] });
    expect(result).toContain("## Title");
    expect(result).toContain("3. first");
    expect(result).toContain("| A\\|B |");
    expect(result).toContain("![sample](data:image/png;base64,aGVsbG8=)");
  });
});
