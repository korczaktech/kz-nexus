import { describe, expect, it } from "vitest";
import {
  createDocument,
  createEditor,
  exportHtml,
  getPlainText,
} from "../../../packages/engine/src/index";
import {
  decodeNexusDocument,
  encodeNexusDocument,
} from "./nexusDocumentPersistence";

/**
 * Integration contract for the experimental SmartCanvas editing session:
 * edits must stay in the canonical engine model and survive native persistence
 * and HTML projection without silently reverting to stale editor markup.
 */
describe("SmartCanvas canonical document round-trip", () => {
  it("persists engine edits, formatting, and the restored history state", () => {
    const document = createDocument({ title: "SmartCanvas integration" });
    const paragraph = document.content[0];
    if (!paragraph || paragraph.type !== "paragraph") {
      throw new Error("Expected the initial paragraph");
    }

    const editor = createEditor({ document });
    expect(editor.setSelection({
      anchor: { blockId: paragraph.id, offset: 0 },
      focus: { blockId: paragraph.id, offset: 0 },
    }).ok).toBe(true);

    const inserted = editor.insertTextAtSelection("Korczak SmartCanvas — ação 😀");
    expect(inserted.ok).toBe(true);
    const edited = editor.getDocument();
    const editedParagraph = edited.content[0];
    if (!editedParagraph || editedParagraph.type !== "paragraph") {
      throw new Error("Expected the edited paragraph");
    }
    expect(getPlainText(editedParagraph)).toBe("Korczak SmartCanvas — ação 😀");

    const encoded = encodeNexusDocument(edited);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const decoded = decodeNexusDocument(encoded.value);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value).toEqual(edited);

    const html = exportHtml(decoded.value);
    expect(html).toContain("Korczak SmartCanvas");
    expect(html).toContain("ação");
    expect(html).toContain("😀");

    expect(editor.undo()).toBe(true);
    const undone = editor.getDocument().content[0];
    if (!undone || undone.type !== "paragraph") throw new Error("Expected undo paragraph");
    expect(getPlainText(undone)).toBe("");

    expect(editor.redo()).toBe(true);
    const redone = editor.getDocument().content[0];
    if (!redone || redone.type !== "paragraph") throw new Error("Expected redo paragraph");
    expect(getPlainText(redone)).toBe("Korczak SmartCanvas — ação 😀");
  });

  it("does not treat HTML projection as the canonical save format", () => {
    const document = createDocument({ title: "Canonical only" });
    const encoded = encodeNexusDocument(document);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    expect(encoded.value).toContain('"format": "korczak-nexus"');
    expect(encoded.value).not.toContain("<html");
    expect(encoded.value).not.toContain("<body");
    expect(encoded.value).not.toContain("<p>");
  });
});
