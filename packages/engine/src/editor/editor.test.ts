import { describe, expect, it, vi } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createEditor } from "./editor";
import { deleteText, insertText } from "../commands/text";
import { deleteBlock, mergeBlockWithPrevious, splitBlock } from "../commands/block";
import { getPlainText } from "../model/tree";
import { applyMark } from "../commands/marks";
import type { Paragraph } from "../model/types";

function newEditor() {
  const { now } = createFixedClock(0);
  return createEditor({ idGenerator: createIdGenerator("n", 1), clock: now, historyOptions: { typingGroupWindowMs: 0 } });
}

describe("Editor", () => {
  it("starts with a valid minimal document", () => {
    const editor = newEditor();
    expect(editor.validate().ok).toBe(true);
    expect(editor.getDocument().content).toHaveLength(1);
  });

  it("exec() applies a command and emits documentChanged", () => {
    const editor = newEditor();
    const blockId = editor.getDocument().content[0].id;
    const listener = vi.fn();
    editor.on("documentChanged", listener);
    const result = editor.exec([insertText({ blockId, offset: 0, text: "Hello" })], { group: "typing" });
    expect(result.ok).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect((editor.getDocument().content[0] as Paragraph).children[0].text).toBe("Hello");
  });

  it("keeps pending formatting in Kortex and applies explicit on/off marks while typing", () => {
    const editor = newEditor();
    const blockId = editor.getDocument().content[0].id;
    expect(editor.setSelection({ anchor: { blockId, offset: 0 }, focus: { blockId, offset: 0 } }).ok).toBe(true);

    expect(editor.toggleStoredMark({ type: "bold" })).toEqual({ ok: true, value: true });
    expect(editor.getStoredMarkState()).toMatchObject({ blockId, active: [{ type: "bold" }], disabled: [] });
    expect(editor.insertTextAtSelection("Bold").ok).toBe(true);

    const boldParagraph = editor.getDocument().content[0] as Paragraph;
    expect(boldParagraph.children.map((run) => ({ text: run.text, marks: run.marks }))).toEqual([
      { text: "Bold", marks: [{ type: "bold" }] },
    ]);

    expect(editor.toggleStoredMark({ type: "bold" })).toEqual({ ok: true, value: false });
    expect(editor.insertTextAtSelection(" plain").ok).toBe(true);
    const paragraph = editor.getDocument().content[0] as Paragraph;
    expect(paragraph.children.map((run) => ({ text: run.text, marks: run.marks }))).toEqual([
      { text: "Bold", marks: [{ type: "bold" }] },
      { text: " plain", marks: [] },
    ]);
  });

  it("toggles formatting off for an already formatted selected range", () => {
    const editor = newEditor();
    const blockId = editor.getDocument().content[0].id;
    editor.exec([insertText({ blockId, offset: 0, text: "word" })], { group: "typing" });
    editor.exec([applyMark({ blockId, start: 0, end: 4, mark: { type: "bold" } })], { group: "formatting" });
    editor.setSelection({ anchor: { blockId, offset: 0 }, focus: { blockId, offset: 4 } });

    expect(editor.toggleStoredMark({ type: "bold" })).toEqual({ ok: true, value: false });
    expect((editor.getDocument().content[0] as Paragraph).children).toMatchObject([{ text: "word", marks: [] }]);
    expect(editor.isMarkActiveAtSelection("bold")).toBe(false);
  });

  it("does not retain stale inline formatting after deleting the last character", () => {
    const editor = newEditor();
    const blockId = editor.getDocument().content[0].id;
    editor.setSelection({ anchor: { blockId, offset: 0 }, focus: { blockId, offset: 0 } });
    editor.toggleStoredMark({ type: "bold" });
    expect(editor.insertTextAtSelection("x").ok).toBe(true);
    expect(editor.isMarkActiveAtSelection("bold")).toBe(true);

    expect(editor.exec([deleteText({ blockId, start: 0, end: 1 })], { group: "typing" }).ok).toBe(true);
    expect((editor.getDocument().content[0] as Paragraph).children).toMatchObject([{ text: "", marks: [] }]);
    // Pending formatting remains active until the user explicitly turns it off.
    expect(editor.isMarkActiveAtSelection("bold")).toBe(true);
    expect(editor.toggleStoredMark({ type: "bold" })).toEqual({ ok: true, value: false });
    expect(editor.isMarkActiveAtSelection("bold")).toBe(false);
  });

  it("clears pending formatting only when the engine explicitly clears it", () => {
    const editor = newEditor();
    const blockId = editor.getDocument().content[0].id;
    editor.setSelection({ anchor: { blockId, offset: 0 }, focus: { blockId, offset: 0 } });
    editor.toggleStoredMark({ type: "italic" });
    expect(editor.getStoredMarkState().active).toEqual([{ type: "italic" }]);
    editor.clearStoredMarks();
    expect(editor.getStoredMarkState()).toEqual({ blockId: undefined, active: [], disabled: [] });
  });

  it("rejected transactions emit transactionRejected and leave the document untouched", () => {
    const editor = newEditor();
    const before = editor.getDocument();
    const rejectListener = vi.fn();
    editor.on("transactionRejected", rejectListener);
    const result = editor.exec([insertText({ blockId: "n_missing1", offset: 0, text: "x" })]);
    expect(result.ok).toBe(false);
    expect(rejectListener).toHaveBeenCalledTimes(1);
    expect(editor.getDocument()).toBe(before);
  });

  it("undo/redo roundtrip through exec()", () => {
    const editor = newEditor();
    const blockId = editor.getDocument().content[0].id;
    editor.exec([insertText({ blockId, offset: 0, text: "Hello" })], { group: "typing" });
    editor.exec([applyMark({ blockId, start: 0, end: 5, mark: { type: "bold" } })], { group: "formatting" });
    expect((editor.getDocument().content[0] as Paragraph).children[0].marks).toContainEqual({ type: "bold" });

    expect(editor.undo()).toBe(true);
    expect((editor.getDocument().content[0] as Paragraph).children[0].marks).toEqual([]);

    expect(editor.undo()).toBe(true);
    expect((editor.getDocument().content[0] as Paragraph).children[0].text).toBe("");

    expect(editor.undo()).toBe(false); // nothing left to undo

    expect(editor.redo()).toBe(true);
    expect((editor.getDocument().content[0] as Paragraph).children[0].text).toBe("Hello");
  });

  it("a broken listener does not roll back a committed transaction nor crash the editor", () => {
    const editor = newEditor();
    const blockId = editor.getDocument().content[0].id;
    editor.on("documentChanged", () => {
      throw new Error("boom");
    });
    const result = editor.exec([insertText({ blockId, offset: 0, text: "Safe" })]);
    expect(result.ok).toBe(true);
    expect((editor.getDocument().content[0] as Paragraph).children[0].text).toBe("Safe");
  });

  it("save() then open() round-trips the document through .nsx", () => {
    const editor = newEditor();
    const blockId = editor.getDocument().content[0].id;
    editor.exec([insertText({ blockId, offset: 0, text: "Persisted" })]);
    const saved = editor.save();
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const other = newEditor();
    const opened = other.open(saved.value);
    expect(opened.ok).toBe(true);
    expect((other.getDocument().content[0] as Paragraph).children[0].text).toBe("Persisted");
    expect(other.canUndo()).toBe(false); // history reset on open
  });

  it("open() rejects a corrupted payload and leaves the current document untouched", () => {
    const editor = newEditor();
    const before = editor.getDocument();
    const result = editor.open("not json");
    expect(result.ok).toBe(false);
    expect(editor.getDocument()).toBe(before);
  });

  it("setSelection validates the referenced block and offset", () => {
    const editor = newEditor();
    const blockId = editor.getDocument().content[0].id;
    expect(editor.setSelection({ anchor: { blockId, offset: 0 }, focus: { blockId, offset: 0 } }).ok).toBe(true);
    expect(editor.setSelection({ anchor: { blockId: "missing", offset: 0 }, focus: { blockId: "missing", offset: 0 } }).ok).toBe(false);
  });

  it("addResource/removeResource integrate with history and validation", () => {
    const editor = newEditor();
    const added = editor.addResource({ kind: "image", mimeType: "image/png", data: "aGVsbG8=" });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(editor.getDocument().resources).toHaveLength(1);
    const removed = editor.removeResource(added.value.id);
    expect(removed.ok).toBe(true);
    expect(editor.getDocument().resources).toHaveLength(0);
  });

  it("no-op normalization does not create a history step", () => {
    const editor = newEditor();
    const before = editor.getHistoryInfo();
    editor.normalize();
    expect(editor.getHistoryInfo()).toEqual(before);
  });

  it("throws if used after dispose()", () => {
    const editor = newEditor();
    editor.dispose();
    expect(() => editor.exec([])).toThrow();
  });

  it("getDocument() returns a frozen object that cannot be mutated by callers", () => {
    const editor = newEditor();
    const doc = editor.getDocument();
    expect(() => {
      (doc as unknown as { id: string }).id = "tampered";
    }).toThrow();
  });
  it("deletes a range spanning multiple paragraphs atomically and can undo it", () => {
    const editor = newEditor();
    const firstId = editor.getDocument().content[0].id;

    expect(editor.exec([insertText({ blockId: firstId, offset: 0, text: "alpha" })], { group: "typing" }).ok).toBe(true);
    expect(editor.exec([splitBlock({ blockId: firstId, offset: 5 })], { group: "typing" }).ok).toBe(true);
    const secondId = editor.getDocument().content[1].id;
    expect(editor.exec([insertText({ blockId: secondId, offset: 0, text: "bravo" })], { group: "typing" }).ok).toBe(true);
    expect(editor.exec([splitBlock({ blockId: secondId, offset: 5 })], { group: "typing" }).ok).toBe(true);
    const thirdId = editor.getDocument().content[2].id;
    expect(editor.exec([insertText({ blockId: thirdId, offset: 0, text: "charlie" })], { group: "typing" }).ok).toBe(true);

    const beforeCut = editor.getDocument();
    const cut = editor.exec([
      deleteText({ blockId: firstId, start: 2, end: 5 }),
      deleteText({ blockId: secondId, start: 0, end: 5 }),
      deleteText({ blockId: thirdId, start: 0, end: 4 }),
      mergeBlockWithPrevious({ blockId: secondId }),
      mergeBlockWithPrevious({ blockId: thirdId }),
    ], { group: "structural" });

    expect(cut.ok).toBe(true);
    expect(editor.getDocument().content).toHaveLength(1);
    expect(getPlainText(editor.getDocument().content[0] as Paragraph)).toBe("allie");

    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(beforeCut);
  });

  it("deletes a selected structural block as one undoable operation", () => {
    const editor = newEditor();
    const firstId = editor.getDocument().content[0].id;
    expect(editor.exec([insertText({ blockId: firstId, offset: 0, text: "keep" })], { group: "typing" }).ok).toBe(true);
    expect(editor.exec([splitBlock({ blockId: firstId, offset: 4 })], { group: "typing" }).ok).toBe(true);
    const secondId = editor.getDocument().content[1].id;
    expect(editor.exec([insertText({ blockId: secondId, offset: 0, text: "remove" })], { group: "typing" }).ok).toBe(true);
    const beforeDelete = editor.getDocument();

    const deleted = editor.exec([deleteBlock({ blockId: secondId })], { group: "structural" });
    expect(deleted.ok).toBe(true);
    expect(editor.getDocument().content).toHaveLength(1);
    expect(getPlainText(editor.getDocument().content[0] as Paragraph)).toBe("keep");

    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(beforeDelete);
  });

  it("replaces a selection spanning multiple paragraphs in one undo step", () => {
    const editor = newEditor();
    const firstId = editor.getDocument().content[0].id;
    expect(editor.exec([insertText({ blockId: firstId, offset: 0, text: "alpha" })], { group: "typing" }).ok).toBe(true);
    expect(editor.exec([splitBlock({ blockId: firstId, offset: 5 })], { group: "typing" }).ok).toBe(true);
    const secondId = editor.getDocument().content[1].id;
    expect(editor.exec([insertText({ blockId: secondId, offset: 0, text: "bravo" })], { group: "typing" }).ok).toBe(true);
    expect(editor.exec([splitBlock({ blockId: secondId, offset: 5 })], { group: "typing" }).ok).toBe(true);
    const thirdId = editor.getDocument().content[2].id;
    expect(editor.exec([insertText({ blockId: thirdId, offset: 0, text: "charlie" })], { group: "typing" }).ok).toBe(true);

    const beforeReplace = editor.getDocument();
    const replaced = editor.exec([
      deleteText({ blockId: firstId, start: 2, end: 5 }),
      deleteText({ blockId: secondId, start: 0, end: 5 }),
      deleteText({ blockId: thirdId, start: 0, end: 4 }),
      mergeBlockWithPrevious({ blockId: secondId }),
      mergeBlockWithPrevious({ blockId: thirdId }),
      insertText({ blockId: firstId, offset: 2, text: "XYZ" }),
    ], { group: "structural" });

    expect(replaced.ok).toBe(true);
    expect(editor.getDocument().content).toHaveLength(1);
    expect(getPlainText(editor.getDocument().content[0] as Paragraph)).toBe("alXYZie");
    expect(editor.undo()).toBe(true);
    expect(editor.getDocument()).toEqual(beforeReplace);
  });


});
