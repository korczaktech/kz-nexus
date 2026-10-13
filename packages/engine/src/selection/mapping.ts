import type { Position } from "./selection";

/**
 * Maps a position after a text edit within the same block (Section 7.1).
 * `start`/`end` describe the replaced range (end exclusive) and
 * `insertedLength` the length of the text that replaced it.
 */
export function mapPositionAfterTextEdit(
  position: Position,
  edit: { blockId: string; start: number; end: number; insertedLength: number },
): Position {
  if (position.blockId !== edit.blockId) return position;
  const { offset } = position;
  if (offset <= edit.start) return position;
  if (offset >= edit.end) {
    return { blockId: position.blockId, offset: offset - (edit.end - edit.start) + edit.insertedLength };
  }
  // Offset was inside the replaced range: clamp to the end of the inserted text.
  return { blockId: position.blockId, offset: edit.start + edit.insertedLength };
}

/** Maps a position when a block is split into `blockId` (before) and `newBlockId` (after) at `splitOffset`. */
export function mapPositionAfterSplit(
  position: Position,
  split: { blockId: string; newBlockId: string; splitOffset: number },
): Position {
  if (position.blockId !== split.blockId) return position;
  if (position.offset <= split.splitOffset) return position;
  return { blockId: split.newBlockId, offset: position.offset - split.splitOffset };
}

/** Maps a position when `sourceBlockId` content was appended onto `targetBlockId` at `mergeOffset`. */
export function mapPositionAfterMerge(
  position: Position,
  merge: { sourceBlockId: string; targetBlockId: string; mergeOffset: number },
): Position {
  if (position.blockId === merge.sourceBlockId) {
    return { blockId: merge.targetBlockId, offset: merge.mergeOffset + position.offset };
  }
  return position;
}

/** Maps a position when a block was removed entirely, falling back to `fallbackBlockId` at offset 0. */
export function mapPositionAfterBlockRemoval(position: Position, removedBlockId: string, fallbackBlockId: string): Position {
  if (position.blockId !== removedBlockId) return position;
  return { blockId: fallbackBlockId, offset: 0 };
}
