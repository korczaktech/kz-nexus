import { describe, expect, it } from "vitest";
import { mapPositionAfterBlockRemoval, mapPositionAfterMerge, mapPositionAfterSplit, mapPositionAfterTextEdit } from "./mapping";

describe("mapPositionAfterTextEdit", () => {
  it("keeps a position before the edit untouched", () => {
    const pos = mapPositionAfterTextEdit({ blockId: "b1", offset: 2 }, { blockId: "b1", start: 5, end: 7, insertedLength: 3 });
    expect(pos).toEqual({ blockId: "b1", offset: 2 });
  });

  it("shifts a position after an insertion", () => {
    const pos = mapPositionAfterTextEdit({ blockId: "b1", offset: 10 }, { blockId: "b1", start: 5, end: 5, insertedLength: 3 });
    expect(pos).toEqual({ blockId: "b1", offset: 13 });
  });

  it("shifts a position after a deletion", () => {
    const pos = mapPositionAfterTextEdit({ blockId: "b1", offset: 10 }, { blockId: "b1", start: 2, end: 5, insertedLength: 0 });
    expect(pos).toEqual({ blockId: "b1", offset: 7 });
  });

  it("clamps a position that was inside a replaced range", () => {
    const pos = mapPositionAfterTextEdit({ blockId: "b1", offset: 4 }, { blockId: "b1", start: 2, end: 6, insertedLength: 2 });
    expect(pos).toEqual({ blockId: "b1", offset: 4 });
  });

  it("ignores edits in a different block", () => {
    const pos = mapPositionAfterTextEdit({ blockId: "b2", offset: 4 }, { blockId: "b1", start: 0, end: 2, insertedLength: 0 });
    expect(pos).toEqual({ blockId: "b2", offset: 4 });
  });
});

describe("mapPositionAfterSplit", () => {
  it("keeps a position before the split point in the original block", () => {
    const pos = mapPositionAfterSplit({ blockId: "b1", offset: 2 }, { blockId: "b1", newBlockId: "b2", splitOffset: 5 });
    expect(pos).toEqual({ blockId: "b1", offset: 2 });
  });

  it("moves a position after the split point into the new block", () => {
    const pos = mapPositionAfterSplit({ blockId: "b1", offset: 8 }, { blockId: "b1", newBlockId: "b2", splitOffset: 5 });
    expect(pos).toEqual({ blockId: "b2", offset: 3 });
  });
});

describe("mapPositionAfterMerge", () => {
  it("relocates a position from the merged-away block into the target block", () => {
    const pos = mapPositionAfterMerge({ blockId: "b2", offset: 3 }, { sourceBlockId: "b2", targetBlockId: "b1", mergeOffset: 5 });
    expect(pos).toEqual({ blockId: "b1", offset: 8 });
  });
});

describe("mapPositionAfterBlockRemoval", () => {
  it("falls back to another block when its own block was removed", () => {
    const pos = mapPositionAfterBlockRemoval({ blockId: "gone", offset: 4 }, "gone", "fallback");
    expect(pos).toEqual({ blockId: "fallback", offset: 0 });
  });

  it("leaves unrelated positions untouched", () => {
    const pos = mapPositionAfterBlockRemoval({ blockId: "other", offset: 4 }, "gone", "fallback");
    expect(pos).toEqual({ blockId: "other", offset: 4 });
  });
});
