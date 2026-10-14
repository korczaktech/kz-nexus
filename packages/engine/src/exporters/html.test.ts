import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "../commands/document";
import { insertText } from "../commands/text";
import { applyMark } from "../commands/marks";
import { exportHtml } from "./html";
import type { Paragraph } from "../model/types";

function context() {
  return { generateId: createIdGenerator("htmltest", 4) };
}

describe("exportHtml", () => {
  it("renders engine marks and escapes text and attributes", () => {
    const document = createDocument(createIdGenerator("htmldoc", 1), createFixedClock(0).now);
    const paragraph = document.content[0] as Paragraph;
    const inserted = insertText({ blockId: paragraph.id, offset: 0, text: "<hello & world>" })(document, context());
    if (!inserted.ok) throw inserted.error;
    const linked = applyMark({ blockId: paragraph.id, start: 0, end: 15, mark: { type: "link", value: "https://example.com/docs?a=1&b=2" } })(inserted.value.document, context());
    if (!linked.ok) throw linked.error;
    const bold = applyMark({ blockId: paragraph.id, start: 0, end: 15, mark: { type: "bold" } })(linked.value.document, context());
    if (!bold.ok) throw bold.error;
    const html = exportHtml(bold.value.document);
    expect(html).toContain("&lt;hello &amp; world&gt;");
    expect(html).toContain('href="https://example.com/docs?a=1&amp;b=2"');
    expect(html).toContain("<strong>");
    expect(html).not.toContain("<hello");
  });
});
