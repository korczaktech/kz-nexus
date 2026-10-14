import { describe, expect, it } from "vitest";
import { createDocument } from "./document";
import { createEditor } from "../editor/editor";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { insertImageResource, removeImage, updateImage } from "./image";
import { validateDocument } from "../validation/validate";
import type { Paragraph } from "../model/types";

describe("insertImageResource", () => {
  it("adds the resource and image block in one valid command", () => {
    const document = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const paragraph = document.content[0] as Paragraph;
    const editor = createEditor({ document, idGenerator: createIdGenerator("id", 1), clock: createFixedClock(1).now });
    const result = editor.exec([insertImageResource({
      afterBlockId: paragraph.id,
      mimeType: "image/png",
      data: "aGVsbG8=",
      alt: "Test image",
      name: "test.png",
    })]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(editor.getDocument().resources).toHaveLength(1);
      expect(editor.getDocument().content.some(block => block.type === "image")).toBe(true);
      expect(validateDocument(editor.getDocument()).ok).toBe(true);
      const image = editor.getDocument().content.find(block => block.type === "image");
      if (image && image.type === "image") {
        const removed = editor.exec([removeImage({ blockId: image.id })]);
        expect(removed.ok).toBe(true);
        expect(editor.getDocument().resources).toHaveLength(0);
        expect(validateDocument(editor.getDocument()).ok).toBe(true);
      }
    }
    editor.dispose();
  });
  it("updates image alt text and dimensions in the canonical model", () => {
    const document = createDocument(createIdGenerator("imgdoc", 1), createFixedClock(0).now);
    const paragraph = document.content[0] as Paragraph;
    const editor = createEditor({ document, idGenerator: createIdGenerator("imgid", 1), clock: createFixedClock(1).now });
    const inserted = editor.exec([insertImageResource({ afterBlockId: paragraph.id, mimeType: "image/png", data: "aGVsbG8=", alt: "Old alt" })]);
    expect(inserted.ok).toBe(true);
    const image = editor.getDocument().content.find(block => block.type === "image");
    if (!image || image.type !== "image") throw new Error("Expected image block");
    const updated = editor.exec([updateImage({ blockId: image.id, alt: "New alt", width: 320, height: 180 })]);
    expect(updated.ok).toBe(true);
    const savedImage = editor.getDocument().content.find(block => block.id === image.id);
    expect(savedImage).toMatchObject({ type: "image", alt: "New alt", width: 320, height: 180 });
    expect(validateDocument(editor.getDocument()).ok).toBe(true);
    expect(editor.exec([updateImage({ blockId: image.id, width: 0 })]).ok).toBe(false);
    editor.dispose();
  });
});
