import { describe, expect, it, vi } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createEditor } from "./editor";
import { insertText } from "../commands/text";
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
});
