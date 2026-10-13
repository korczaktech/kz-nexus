import type { Mark, NexusDocument, TextRun } from "../model/types";
import { findParagraphLike, getPlainText, mapParagraphLike } from "../model/tree";
import { engineError } from "../errors/errors";
import { err, ok } from "../utils/result";
import type { Command } from "./types";

/**
 * Splits a run list at `offset`. When the split point falls inside a run,
 * the leading fragment keeps the original run's id and the trailing
 * fragment is assigned a brand-new id via `generateId` — two fragments of
 * the same original run must never share an id, or the document would fail
 * uniqueness validation.
 */
function splitRunsAt(runs: TextRun[], offset: number, generateId: () => string): { before: TextRun[]; after: TextRun[] } {
  const before: TextRun[] = [];
  const after: TextRun[] = [];
  let consumed = 0;
  for (const run of runs) {
    const runStart = consumed;
    const runEnd = consumed + run.text.length;
    if (runEnd <= offset) {
      before.push(run);
    } else if (runStart >= offset) {
      after.push(run);
    } else {
      const cut = offset - runStart;
      before.push({ ...run, text: run.text.slice(0, cut) });
      after.push({ ...run, id: generateId(), text: run.text.slice(cut) });
    }
    consumed = runEnd;
  }
  return { before, after };
}

function sameMarks(a: Mark[], b: Mark[]): boolean {
  if (a.length !== b.length) return false;
  const key = (m: Mark): string => JSON.stringify(m);
  const sa = a.map(key).sort();
  const sb = b.map(key).sort();
  return sa.every((value, index) => value === sb[index]);
}

/**
 * Merges adjacent runs that carry exactly the same marks. The first run of
 * each merged group keeps its id (ids stay stable); the absorbed runs' ids are
 * dropped. Keeps documents compact so typing never produces one run per key.
 */
export function coalesceRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const run of runs) {
    const last = out[out.length - 1];
    if (last && sameMarks(last.marks, run.marks)) out[out.length - 1] = { ...last, text: last.text + run.text };
    else out.push(run);
  }
  return out;
}

function rebuildRuns(runs: TextRun[], start: number, end: number, insertedText: string, ctx: { generateId: () => string }): TextRun[] {
  const { before } = splitRunsAt(runs, start, ctx.generateId);
  const { after } = splitRunsAt(runs, end, ctx.generateId);
  const marksAtStart = before.length > 0 ? before[before.length - 1].marks : after.length > 0 ? after[0].marks : [];
  const middle: TextRun[] = insertedText.length > 0 ? [{ type: "text", id: ctx.generateId(), text: insertedText, marks: marksAtStart }] : [];
  // Drop runs that became empty as a side effect of splitting (e.g. the
  // original sole run of a fresh paragraph) so text stays in as few runs as
  // possible; always keep at least one run so the block remains valid.
  const combined = coalesceRuns([...before, ...middle, ...after].filter((run) => run.text.length > 0));
  return combined.length > 0 ? combined : [{ type: "text", id: ctx.generateId(), text: "", marks: marksAtStart }];
}

/** Inserts `text` at `offset` inside the block identified by `blockId`. */
export function insertText(params: { blockId: string; offset: number; text: string }): Command {
  return (doc: NexusDocument, ctx) => {
    const node = findParagraphLike(doc.content, params.blockId);
    if (!node) return err(engineError("NODE_NOT_FOUND", `Block "${params.blockId}" not found`, { path: params.blockId }));
    const currentLength = getPlainText(node).length;
    if (params.offset < 0 || params.offset > currentLength) {
      return err(engineError("INVALID_POSITION", `Offset ${params.offset} out of range [0, ${currentLength}]`, { path: params.blockId }));
    }
    const content = mapParagraphLike(doc.content, (n) =>
      n.id === params.blockId ? { ...n, children: rebuildRuns(n.children, params.offset, params.offset, params.text, ctx) } : n,
    );
    return ok({ document: { ...doc, content }, selection: { blockId: params.blockId, offset: params.offset + params.text.length } });
  };
}

/** Deletes the `[start, end)` character range inside the block identified by `blockId`. */
export function deleteText(params: { blockId: string; start: number; end: number }): Command {
  return (doc: NexusDocument, ctx) => {
    const node = findParagraphLike(doc.content, params.blockId);
    if (!node) return err(engineError("NODE_NOT_FOUND", `Block "${params.blockId}" not found`, { path: params.blockId }));
    const currentLength = getPlainText(node).length;
    if (params.start < 0 || params.end > currentLength || params.start > params.end) {
      return err(engineError("INVALID_POSITION", `Invalid range [${params.start}, ${params.end}]`, { path: params.blockId }));
    }
    const { start, end } = params;
    const content = mapParagraphLike(doc.content, (n) =>
      n.id === params.blockId ? { ...n, children: rebuildRuns(n.children, start, end, "", ctx) } : n,
    );
    return ok({ document: { ...doc, content }, selection: { blockId: params.blockId, offset: start } });
  };
}

/** Replaces the `[start, end)` character range inside `blockId` with `text`. */
export function replaceRange(params: { blockId: string; start: number; end: number; text: string }): Command {
  return (doc: NexusDocument, ctx) => {
    const node = findParagraphLike(doc.content, params.blockId);
    if (!node) return err(engineError("NODE_NOT_FOUND", `Block "${params.blockId}" not found`, { path: params.blockId }));
    const currentLength = getPlainText(node).length;
    if (params.start < 0 || params.end > currentLength || params.start > params.end) {
      return err(engineError("INVALID_POSITION", `Invalid range [${params.start}, ${params.end}]`, { path: params.blockId }));
    }
    const content = mapParagraphLike(doc.content, (n) =>
      n.id === params.blockId ? { ...n, children: rebuildRuns(n.children, params.start, params.end, params.text, ctx) } : n,
    );
    return ok({ document: { ...doc, content }, selection: { blockId: params.blockId, offset: params.start + params.text.length } });
  };
}

export { splitRunsAt, rebuildRuns };
