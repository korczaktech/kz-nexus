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

  it("preserves document metadata when content is synchronized", () => {
    const engine = createEditor({ document: nexusDocumentFromHtml("<p>Text</p>", "Original title") });
    expect(syncNexusEngine(engine, "<p>Text changed</p>", "Updated title")).toBe(true);
    expect(engine.getDocument().metadata.title).toBe("Updated title");
    engine.dispose();
  });
});
