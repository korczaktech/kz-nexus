import { describe, expect, it } from "vitest";
import { createDocument } from "./document";
import { moveBlock } from "./block";
import { insertTable } from "./table";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";

function context() {
  return { generateId: createIdGenerator("move", 1) };
}

describe("moveBlock", () => {
  it("moves a structural block while preserving its ID and contents", () => {
    const document = createDocument(createIdGenerator("doc", 1), createFixedClock(0).now);
    const paragraph = document.content[0]!;
    const inserted = insertTable({ afterBlockId: paragraph.id, rows: 1, columns: 2 })(document, context());
    if (!inserted.ok) throw inserted.error;
    const table = inserted.value.document.content[1]!;
    const moved = moveBlock({ blockId: table.id, direction: "up" })(inserted.value.document, context());
    if (!moved.ok) throw moved.error;
    expect(moved.value.document.content[0]).toEqual(table);
    expect(moved.value.document.content[1]).toEqual(paragraph);
  });

  it("rejects moves outside the document and unknown IDs", () => {
    const document = createDocument(createIdGenerator("doc", 1), createFixedClock(0).now);
    expect(moveBlock({ blockId: document.content[0]!.id, direction: "up" })(document, context()).ok).toBe(false);
    expect(moveBlock({ blockId: "missing", direction: "down" })(document, context()).ok).toBe(false);
  });
});
