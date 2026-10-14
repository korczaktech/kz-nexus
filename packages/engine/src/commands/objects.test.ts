import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { getPlainText } from "../model/tree";
import { updateEditorObject } from "./objects";

describe("updateEditorObject", () => {
  it("changes object geometry without replacing its text or identity", () => {
    const ids = createIdGenerator("object", 1);
    const document = createDocument(ids, createFixedClock(0).now);
    const block = document.content[0]!;
    if (block.type !== "paragraph") throw new Error("paragraph fixture missing");
    document.content[0] = { ...block, editorObject: { kind: "textBox", label: "Box", width: 200, height: 80 }, children: [{ type: "text", id: ids(), text: "Keep this text", marks: [] }] };
    const result = updateEditorObject({ blockId: block.id, patch: { width: 360, height: 120 } })(document, { generateId: ids });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const updated = result.value.document.content[0]!;
    expect(updated.id).toBe(block.id);
    expect(updated.type === "paragraph" ? getPlainText(updated) : "").toBe("Keep this text");
    expect(updated).toMatchObject({ editorObject: { kind: "textBox", width: 360, height: 120 } });
  });

  it("rejects invalid dimensions", () => {
    const ids = createIdGenerator("object", 20);
    const document = createDocument(ids, createFixedClock(0).now);
    const block = document.content[0]!;
    if (block.type !== "paragraph") throw new Error("paragraph fixture missing");
    document.content[0] = { ...block, editorObject: { kind: "shape", shape: "ellipse" } };
    const result = updateEditorObject({ blockId: block.id, patch: { width: 0 } })(document, { generateId: ids });
    expect(result.ok).toBe(false);
  });
});
