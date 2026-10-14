// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createEditor, getPlainText } from "../../../packages/engine/src/index";
import { htmlFromNexusDocument, nexusDocumentFromHtml, syncNexusEngine } from "./nexusEngineAdapter";
import type { Paragraph } from "../../../packages/engine/src/model/types";

describe("Nexus editor adapter", () => {
  it("routes ordinary typing through engine transactions and preserves block IDs", () => {
    const document = nexusDocumentFromHtml("<p>Hello</p>", "Adapter test");
    const engine = createEditor({ document });
    const before = engine.getDocument().content[0] as Paragraph;
    expect(syncNexusEngine(engine, "<p>Hello!</p>", "Adapter test")).toBe(true);
    const after = engine.getDocument().content[0] as Paragraph;
    expect(after.id).toBe(before.id);
    expect(getPlainText(after)).toBe("Hello!");
    expect(engine.canUndo()).toBe(true);
    expect(engine.undo()).toBe(true);
    expect(getPlainText(engine.getDocument().content[0] as Paragraph)).toBe("Hello");
    engine.dispose();
  });

  it("sanitizes active HTML and unsafe URLs before creating engine blocks", () => {
    const document = nexusDocumentFromHtml('<p onclick="alert(1)">Safe <a href="javascript:alert(2)">link</a></p><script>alert(3)</script><iframe src="https://evil.example"></iframe><img src="https://evil.example/pixel.png" onerror="alert(4)" alt="remote image">', "Sanitization test");
    const html = htmlFromNexusDocument(document);
    expect(html).toContain("Safe");
    expect(html).toContain("link");
    expect(html).not.toContain("script");
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("evil.example");
    expect(document.resources).toHaveLength(0);
  });

  it("round-trips an embedded image as a resource and image block", () => {
    const document = nexusDocumentFromHtml('<img src="data:image/png;base64,aGVsbG8=" alt="Embedded image" />', "Image test");
    expect(document.resources).toHaveLength(1);
    expect(document.resources[0].byteLength).toBe(5);
    expect(document.content.some(block => block.type === "image")).toBe(true);
    expect(htmlFromNexusDocument(document)).toContain('src="data:image/png;base64,aGVsbG8="');
  });

  it("preserves multiple paragraphs inside a table cell", () => {
    const document = nexusDocumentFromHtml("<table><tbody><tr><td><p>First</p><p>Second</p></td></tr></tbody></table>", "Table test");
    const table = document.content.find(block => block.type === "table");
    expect(table && table.type === "table" ? table.children[0]!.children[0]!.children.map(paragraph => getPlainText(paragraph)).join("|") : "").toBe("First|Second");
    expect(htmlFromNexusDocument(document)).toContain("<p>First</p><p>Second</p>");
  });

  it("round-trips paragraph spacing and line-height through the engine adapter", () => {
    const document = nexusDocumentFromHtml('<p style="margin-top:8pt;margin-bottom:12pt;line-height:1.5;background-color:#fff2a8;border:0.75pt solid #6475ff;padding:4.5pt">Spaced</p>', "Spacing test");
    const paragraph = document.content[0];
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.spacingBefore : undefined).toBe(8);
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.spacingAfter : undefined).toBe(12);
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.lineSpacing : undefined).toBe(1.5);
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.backgroundColor : undefined).toBe("#fff2a8");
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.borderColor : undefined).toBe("#6475ff");
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.borderWidth : undefined).toBe(0.75);
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.padding : undefined).toBe(4.5);
    const html = htmlFromNexusDocument(document);
    expect(html).toContain("margin-top:8pt");
    expect(html).toContain("margin-bottom:12pt");
    expect(html).toContain("line-height:1.5");
    expect(html).toContain("background-color:#fff2a8");
    expect(html).toContain("border:0.75pt solid #6475ff");
    expect(html).toContain("padding:4.5pt");
  });

  it("preserves safe paragraph anchors for internal note links", () => {
    const document = nexusDocumentFromHtml('<p id="note_0001abcd">Footnote target</p><p><a href="#note_0001abcd">1</a></p>', "Anchor test");
    const paragraph = document.content[0];
    expect(paragraph && paragraph.type === "paragraph" ? paragraph.anchorId : undefined).toBe("note_0001abcd");
    expect(htmlFromNexusDocument(document)).toContain('<p id="note_0001abcd">Footnote target</p>');
    expect(htmlFromNexusDocument(document)).toContain('href="#note_0001abcd"');
  });

  it("round-trips comment annotations through the engine document", () => {
    const document = nexusDocumentFromHtml('<p><span data-kz-comment="Review this" title="Comentário: Review this">Important</span></p>', "Comment test");
    const paragraph = document.content[0];
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.children[0]!.marks : []).toContainEqual({ type: "comment", value: "Review this" });
    expect(htmlFromNexusDocument(document)).toContain('data-kz-comment="Review this"');
  });

  it("round-trips safe hyperlinks through the engine document", () => {
    const document = nexusDocumentFromHtml('<p><a href="https://example.com/docs">Read docs</a></p>', "Link test");
    const paragraph = document.content[0];
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.children[0]!.marks : []).toContainEqual({ type: "link", value: "https://example.com/docs" });
    expect(htmlFromNexusDocument(document)).toContain('<a href="https://example.com/docs">Read docs</a>');
  });

  it("drops executable hyperlink schemes when importing HTML", () => {
    const document = nexusDocumentFromHtml('<p><a href="javascript:alert(1)">Unsafe</a></p>', "Unsafe link test");
    const paragraph = document.content[0];
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.children[0]!.marks : []).not.toContainEqual(expect.objectContaining({ type: "link" }));
  });

  it("renders stable heading IDs for engine-backed internal links", () => {
    const document = nexusDocumentFromHtml("<h1>Destination</h1>", "Internal link test");
    const heading = document.content.find(block => block.type === "heading");
    expect(heading && heading.type === "heading" ? htmlFromNexusDocument(document) : "").toContain('id="' + (heading && heading.type === "heading" ? heading.id : "") + '"');
  });

  it("round-trips superscript and subscript marks", () => {
    const document = nexusDocumentFromHtml("<p>H<sup>+</sup>O<sub>2</sub></p>", "Script test");
    const paragraph = document.content[0];
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.children.flatMap(run => run.marks.map(mark => mark.type)) : []).toContain("superscript");
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.children.flatMap(run => run.marks.map(mark => mark.type)) : []).toContain("subscript");
    expect(htmlFromNexusDocument(document)).toContain("<sup>+</sup>");
    expect(htmlFromNexusDocument(document)).toContain("<sub>2</sub>");
  });

  it("round-trips paragraph indentation in points", () => {
    const document = nexusDocumentFromHtml('<p style="margin-left:36pt">Indented</p>', "Indent test");
    const paragraph = document.content[0];
    expect(paragraph && (paragraph.type === "paragraph" || paragraph.type === "heading") ? paragraph.indent : undefined).toBe(36);
    expect(htmlFromNexusDocument(document)).toContain("margin-left:36pt");
  });

  it("preserves document metadata when content is synchronized", () => {
    const engine = createEditor({ document: nexusDocumentFromHtml("<p>Text</p>", "Original title") });
    expect(syncNexusEngine(engine, "<p>Text changed</p>", "Updated title")).toBe(true);
    expect(engine.getDocument().metadata.title).toBe("Updated title");
    engine.dispose();
  });
});
