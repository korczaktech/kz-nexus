import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "../commands/document";
import { insertText } from "../commands/text";
import { applyMark } from "../commands/marks";
import { setParagraphStyle } from "../commands/block";
import { exportHtml } from "./html";
import type { Paragraph } from "../model/types";

function context() {
  return { generateId: createIdGenerator("htmltest", 4) };
}

describe("exportHtml", () => {
  it("exports paragraph spacing and line-height from engine fields", () => {
    const document = createDocument(createIdGenerator("spacingdoc", 1), createFixedClock(0).now);
    const paragraph = document.content[0] as Paragraph;
    const inserted = insertText({ blockId: paragraph.id, offset: 0, text: "Spaced" })(document, context());
    if (!inserted.ok) throw inserted.error;
    const styled = setParagraphStyle({ blockId: paragraph.id, spacingBefore: 6, spacingAfter: 12, lineSpacing: 1.5 })(inserted.value.document, context());
    if (!styled.ok) throw styled.error;
    const html = exportHtml(styled.value.document);
    expect(html).toContain("margin-top:6pt");
    expect(html).toContain("margin-bottom:12pt");
    expect(html).toContain("line-height:1.5");
  });

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
