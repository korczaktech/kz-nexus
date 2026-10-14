import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "../commands/document";
import { readNsx } from "./reader";
import { writeNsx } from "./writer";

describe("native editor objects in .nsx", () => {
  it("preserves page breaks and editable object geometry through save/open", () => {
    const ids = createIdGenerator("nsx", 1);
    const document = createDocument(ids, createFixedClock(0).now, { title: "Editor object roundtrip" });
    document.content = [
      { type: "paragraph", id: ids(), children: [{ type: "text", id: ids(), text: "Before", marks: [] }] },
      { type: "thematicBreak", id: ids(), kind: "pageBreak" },
      { type: "paragraph", id: ids(), editorObject: { kind: "shape", label: "Ellipse", shape: "ellipse", width: 110, height: 72, stroke: "#2563eb", fill: "#ffffff" }, children: [{ type: "text", id: ids(), text: "Editable shape", marks: [] }] },
    ];
    const serialized = writeNsx(document);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) return;
    const reopened = readNsx(serialized.value, createIdGenerator("reopened", 1));
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.value.content[1]).toMatchObject({ type: "thematicBreak", kind: "pageBreak" });
    expect(reopened.value.content[2]).toMatchObject({
      type: "paragraph",
      editorObject: { kind: "shape", label: "Ellipse", shape: "ellipse", width: 110, height: 72, stroke: "#2563eb", fill: "#ffffff" },
    });
  });
});
