import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { getPlainText } from "../model/tree";
import { validateDocument } from "../validation/validate";
import { importMarkdown } from "./markdown";

describe("importMarkdown", () => {
  it("imports headings, inline marks, links, lists, tables, quotes and rules", () => {
    const document = importMarkdown(
      "# Title\n\n**bold** and [link](https://example.com)\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| x | y |\n\n> quote\n\n---",
      createIdGenerator("markdown-import", 1),
      createFixedClock(0).now,
      { title: "Imported" },
    );
    expect(document.metadata.title).toBe("Imported");
    expect(document.content.map(block => block.type)).toEqual(["heading", "paragraph", "bulletList", "table", "blockquote", "thematicBreak"]);
    const paragraph = document.content[1];
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.children.some(run => run.marks.some(mark => mark.type === "bold")) : false).toBe(true);
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.children.some(run => run.marks.some(mark => mark.type === "link")) : false).toBe(true);
    const list = document.content[2];
    expect(list?.type).toBe("bulletList");
    if (list?.type === "bulletList") expect(getPlainText(list.children[0]!.children[0] as { children: import("../model/types").TextRun[] })).toBe("one");
    const table = document.content[3];
    expect(table?.type).toBe("table");
    if (table?.type === "table") expect(getPlainText(table.children[1]!.children[1]!.children[0]!)).toBe("y");
    expect(validateDocument(document).ok).toBe(true);
  });

  it("imports safe embedded image data and ignores remote image URLs", () => {
    const document = importMarkdown("![safe](data:image/png;base64,aGVsbG8=)\n\n![remote](https://example.com/image.png)", createIdGenerator("markdown-images", 1), createFixedClock(0).now);
    expect(document.resources).toHaveLength(1);
    expect(document.content[0]?.type).toBe("image");
    expect(document.content[1]?.type).toBe("paragraph");
    expect(validateDocument(document).ok).toBe(true);
  });
});
