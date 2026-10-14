// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createEditor, getPlainText } from "../../../packages/engine/src/index";
import { getEngineDomContext, htmlFromNexusDocument, nexusDocumentFromHtml, syncNexusEngine } from "./nexusEngineAdapter";
import type { Paragraph } from "../../../packages/engine/src/model/types";

describe("Nexus editor adapter", () => {
  it("does not map header or footer selections to body paragraphs", () => {
    const engine = createEditor({ document: nexusDocumentFromHtml("<p>Body paragraph</p>", "Layout selection test") });
    const root = document.createElement("div");
    root.innerHTML = '<div class="editor-page"><div class="editor-document-header" contenteditable="true">Header</div><div class="rich-editor"><p>Body paragraph</p></div><div class="editor-document-footer" contenteditable="true">Footer</div></div>';
    document.body.append(root);
    const selection = window.getSelection();
    const headerText = root.querySelector(".editor-document-header")!.firstChild!;
    const headerRange = document.createRange();
    headerRange.setStart(headerText, 2);
    headerRange.collapse(true);
    selection!.removeAllRanges();
    selection!.addRange(headerRange);
    expect(getEngineDomContext(engine, root)).toBeNull();

    const bodyText = root.querySelector(".rich-editor p")!.firstChild!;
    const bodyRange = document.createRange();
    bodyRange.setStart(bodyText, 4);
    bodyRange.collapse(true);
    selection!.removeAllRanges();
    selection!.addRange(bodyRange);
    expect(getEngineDomContext(engine, root)).toMatchObject({
      block: { type: "paragraph" },
      startOffset: 4,
      endOffset: 4,
    });
    root.remove();
    engine.dispose();
  });

  it("maps body paragraphs across pages without treating layout fields as text blocks", () => {
    const engine = createEditor({ document: nexusDocumentFromHtml("<p>First</p><p>Second</p>", "Multi-page mapping test") });
    const root = document.createElement("div");
    root.innerHTML = '<div class="editor-page"><div class="editor-document-header">Header</div><div class="rich-editor"><p>First</p></div><div class="editor-document-footer">Footer</div></div><div class="editor-page"><div class="editor-document-header">Header</div><div class="rich-editor"><p>Second</p></div><div class="editor-document-footer">Footer</div></div>';
    document.body.append(root);
    const selection = window.getSelection();
    const secondText = root.querySelectorAll(".rich-editor p")[1]!.firstChild!;
    const range = document.createRange();
    range.setStart(secondText, 3);
    range.collapse(true);
    selection!.removeAllRanges();
    selection!.addRange(range);
    expect(getEngineDomContext(engine, root)).toMatchObject({
      block: { type: "paragraph" },
      blockIndex: 1,
      startOffset: 3,
      endOffset: 3,
    });
    root.remove();
    engine.dispose();
  });

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

  it("round-trips first-line and hanging indents through the engine adapter", () => {
    const document = nexusDocumentFromHtml('<p style="text-indent:18pt">First line</p><p style="padding-left:18pt;text-indent:-18pt">Hanging line</p>', "Indent test");
    const first = document.content[0];
    const hanging = document.content[1];
    expect(first && (first.type === "paragraph" || first.type === "heading") ? first.firstLineIndent : undefined).toBe(18);
    expect(hanging && (hanging.type === "paragraph" || hanging.type === "heading") ? hanging.hangingIndent : undefined).toBe(18);
    const html = htmlFromNexusDocument(document);
    expect(html).toContain("text-indent:18pt");
    expect(html).toContain("padding-left:18pt;text-indent:-18pt");
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
  it("migrates a mixed legacy HTML document into a stable native model and back", () => {
    const legacyHtml = '<h1 id="intro">Introdução</h1><p>Texto <strong>forte</strong> e <a href="https://example.com">link</a>.</p><ul><li>um</li><li>dois</li></ul><blockquote><p>citação antiga</p></blockquote><table><tbody><tr><td><p>A</p></td><td><p>B</p></td></tr></tbody></table><hr><img src="data:image/png;base64,aGVsbG8=" alt="marca" width="64" height="32">';
    const migrated = nexusDocumentFromHtml(legacyHtml, "Documento legado");
    expect(migrated.content.map(block => block.type)).toEqual([
      "heading", "paragraph", "bulletList", "blockquote", "table", "thematicBreak", "image",
    ]);
    const engine = createEditor({ document: migrated });
    const nativeSnapshot = engine.getDocument();
    const projected = htmlFromNexusDocument(nativeSnapshot);
    const reopened = nexusDocumentFromHtml(projected, "Documento legado");
    expect(reopened.content.map(block => block.type)).toEqual(nativeSnapshot.content.map(block => block.type));
    expect(reopened.metadata.title).toBe("Documento legado");
    expect(reopened.resources).toHaveLength(1);
    expect(reopened.content.find(block => block.type === "image")).toMatchObject({ type: "image", alt: "marca", width: 64, height: 32 });
    expect(projected).toContain("Introdução");
    expect(projected).toContain("citação antiga");
    expect(projected).toContain("https://example.com");
    engine.dispose();
  });

  it("round-trips native page breaks through the editor model and HTML projection", () => {
    const document = nexusDocumentFromHtml('<p>Before</p><div data-kz-page-break="true" style="break-before:page"></div><p>After</p>', "Page break test");
    expect(document.content.map(block => block.type)).toEqual(["paragraph", "thematicBreak", "paragraph"]);
    const pageBreak = document.content[1];
    expect(pageBreak && pageBreak.type === "thematicBreak" ? pageBreak.kind : undefined).toBe("pageBreak");
    const html = htmlFromNexusDocument(document);
    expect(html).toContain('data-kz-page-break="true"');
    const reopened = nexusDocumentFromHtml(html, "Page break test");
    expect(reopened.content[1]).toMatchObject({ type: "thematicBreak", kind: "pageBreak" });
  });

  it("round-trips native text-box and shape metadata without flattening them to images", () => {
    const source = '<p data-kz-object="textBox" data-kz-object-label="Caixa" data-kz-object-stroke="#64748b" data-kz-object-fill="#f8fafc" data-kz-object-width="320" data-kz-object-height="72" style="border:1px solid #64748b;padding:12px">Texto editável</p><p data-kz-object="shape" data-kz-object-shape="ellipse" data-kz-object-label="Círculo" data-kz-object-stroke="#2563eb">Forma</p>';
    const document = nexusDocumentFromHtml(source, "Editable objects");
    expect(document.content[0]).toMatchObject({ type: "paragraph", editorObject: { kind: "textBox", label: "Caixa", stroke: "#64748b", fill: "#f8fafc", width: 320, height: 72 } });
    expect(document.content[1]).toMatchObject({ type: "paragraph", editorObject: { kind: "shape", shape: "ellipse", label: "Círculo", stroke: "#2563eb" } });
    const html = htmlFromNexusDocument(document);
    expect(html).toContain('data-kz-object="textBox"');
    expect(html).toContain('data-kz-object-width="320"');
    expect(html).toContain('data-kz-object-shape="ellipse"');
    const reopened = nexusDocumentFromHtml(html, "Editable objects");
    expect(reopened.content[0]).toMatchObject({ type: "paragraph", editorObject: { kind: "textBox", label: "Caixa" } });
    expect(reopened.content[1]).toMatchObject({ type: "paragraph", editorObject: { kind: "shape", shape: "ellipse" } });
  });

});
