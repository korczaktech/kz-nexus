import type { Mark, MarkType, NexusDocument, TextRun } from "../model/types";
import { findParagraphLike, getPlainText, updateParagraphLike } from "../model/tree";
import { engineError } from "../errors/errors";
import { isValidColor, isValidFontSize, isValidLink } from "../schema/schema";
import { err, ok } from "../utils/result";
import { coalesceRuns, splitRunsAt } from "./text";
import type { Command, CommandContext } from "./types";

function validateMark(mark: Mark): string | undefined {
  if (mark.type === "color" || mark.type === "highlight") {
    if (!isValidColor(mark.value)) return `Invalid color value "${mark.value}"`;
  }
  if (mark.type === "fontSize" && !isValidFontSize(mark.value)) return `Invalid fontSize value "${mark.value}"`;
  if (mark.type === "fontFamily" && mark.value.trim().length === 0) return "fontFamily cannot be empty";
  if (mark.type === "link" && !isValidLink(mark.value)) return "link must be a safe http, https, mailto, or same-document anchor URL";
  if (mark.type === "comment" && (typeof mark.value !== "string" || !mark.value.trim() || mark.value.length > 2000)) return "comment must contain 1 to 2000 characters";
  return undefined;
}

function withMark(marks: Mark[], mark: Mark): Mark[] {
  return [...marks.filter((m) => m.type !== mark.type), mark];
}

function withoutMarkType(marks: Mark[], type: MarkType): Mark[] {
  return marks.filter((m) => m.type !== type);
}

function hasMarkType(marks: Mark[], type: MarkType): boolean {
  return marks.some((m) => m.type === type);
}

function applyToRange(runs: TextRun[], start: number, end: number, transform: (marks: Mark[]) => Mark[], generateId: () => string): TextRun[] {
  if (start === end) return runs;
  const splitAtStart = splitRunsAt(runs, start, generateId);
  const before = splitAtStart.before;
  const afterStart = splitAtStart.after;
  const relativeEnd = end - start;
  const { before: middle, after: tail } = splitRunsAt(afterStart, relativeEnd, generateId);
  const transformedMiddle = middle.map((run) => ({ ...run, marks: transform(run.marks) }));
  return coalesceRuns([...before, ...transformedMiddle, ...tail].filter((run) => run.text.length > 0 || runs.length === 1));
}

function runsInRange(runs: TextRun[], start: number, end: number, generateId: () => string): TextRun[] {
  const afterStart = splitRunsAt(runs, start, generateId).after;
  return splitRunsAt(afterStart, end - start, generateId).before;
}

function runCommand(blockId: string, start: number, end: number, transform: (marks: Mark[]) => Mark[], generateId: () => string) {
  return (doc: NexusDocument) => {
    const node = findParagraphLike(doc.content, blockId);
    if (!node) return err(engineError("NODE_NOT_FOUND", `Block "${blockId}" not found`, { path: blockId }));
    const length = getPlainText(node).length;
    if (start < 0 || end > length || start > end) {
      return err(engineError("INVALID_POSITION", `Invalid range [${start}, ${end}]`, { path: blockId }));
    }
    const content = updateParagraphLike(doc.content, blockId, (n) =>
      n.id === blockId ? { ...n, children: applyToRange(n.children, start, end, transform, generateId) } : n,
    ).blocks;
    return ok({ document: { ...doc, content } });
  };
}

export function applyMark(params: { blockId: string; start: number; end: number; mark: Mark }): Command {
  return (doc: NexusDocument, ctx: CommandContext) => {
    const error = validateMark(params.mark);
    if (error) return err(engineError("INVALID_DOCUMENT", error, { path: params.blockId }));
    return runCommand(params.blockId, params.start, params.end, (marks) => withMark(marks, params.mark), ctx.generateId)(doc);
  };
}

export function removeMark(params: { blockId: string; start: number; end: number; markType: MarkType }): Command {
  return (doc: NexusDocument, ctx: CommandContext) =>
    runCommand(params.blockId, params.start, params.end, (marks) => withoutMarkType(marks, params.markType), ctx.generateId)(doc);
}

export function toggleMark(params: { blockId: string; start: number; end: number; mark: Mark }): Command {
  return (doc: NexusDocument, ctx: CommandContext) => {
    const error = validateMark(params.mark);
    if (error) return err(engineError("INVALID_DOCUMENT", error, { path: params.blockId }));
    const node = findParagraphLike(doc.content, params.blockId);
    if (!node) return err(engineError("NODE_NOT_FOUND", `Block "${params.blockId}" not found`, { path: params.blockId }));
    const length = getPlainText(node).length;
    const start = Math.max(0, Math.min(params.start, params.end));
    const end = Math.min(length, Math.max(params.start, params.end));
    if (start === end) {
      return err(engineError("UNSUPPORTED_OPERATION", "Cannot toggle a mark on an empty range", { path: params.blockId }));
    }
    const relevantRuns = runsInRange(node.children, start, end, ctx.generateId);
    const allHaveMark = relevantRuns.length > 0 && relevantRuns.every((run) => hasMarkType(run.marks, params.mark.type));
    const transform = allHaveMark ? (marks: Mark[]) => withoutMarkType(marks, params.mark.type) : (marks: Mark[]) => withMark(marks, params.mark);
    return runCommand(params.blockId, start, end, transform, ctx.generateId)(doc);
  };
}
