import { describe, expect, it } from "vitest";
import { createFixedClock } from "../core/clock";
import { createIdGenerator } from "../core/ids";
import { createDocument } from "../commands/document";
import { HistoryManager } from "./history";
import type { NexusDocument } from "../model/types";

function doc(suffix: string): NexusDocument {
  const d = createDocument(createIdGenerator("n", 1), createFixedClock(0).now, { title: `doc-${suffix}` });
  return d;
}

describe("HistoryManager", () => {
  it("undo restores the previous document and redo restores the next one", () => {
    const { now } = createFixedClock(0);
    const history = new HistoryManager(now, { typingGroupWindowMs: 0 });
    const v1 = doc("1");
    const v2 = doc("2");
    history.push({ before: v1, after: v2, group: "structural" });

    expect(history.canUndo()).toBe(true);
    const undone = history.undo();
    expect(undone?.document).toBe(v1);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    const redone = history.redo();
    expect(redone?.document).toBe(v2);
  });

  it("clears the redo stack when a new change is pushed after an undo", () => {
    const { now } = createFixedClock(0);
    const history = new HistoryManager(now, { typingGroupWindowMs: 0 });
    const v1 = doc("1");
    const v2 = doc("2");
    const v3 = doc("3");
    history.push({ before: v1, after: v2, group: "structural" });
    history.undo();
    expect(history.canRedo()).toBe(true);
    history.push({ before: v1, after: v3, group: "structural" });
    expect(history.canRedo()).toBe(false);
  });

  it("groups consecutive typing edits within the time window into a single undo step", () => {
    const { now, advance } = createFixedClock(0);
    const history = new HistoryManager(now, { typingGroupWindowMs: 500 });
    const v1 = doc("1");
    const v2 = doc("2");
    const v3 = doc("3");
    history.push({ before: v1, after: v2, group: "typing" });
    advance(100);
    history.push({ before: v2, after: v3, group: "typing" });

    expect(history.size.undo).toBe(1);
    const undone = history.undo();
    expect(undone?.document).toBe(v1); // one undo reverts both grouped keystrokes
  });

  it("does not group typing edits that happen outside the time window", () => {
    const { now, advance } = createFixedClock(0);
    const history = new HistoryManager(now, { typingGroupWindowMs: 100 });
    const v1 = doc("1");
    const v2 = doc("2");
    const v3 = doc("3");
    history.push({ before: v1, after: v2, group: "typing" });
    advance(1000);
    history.push({ before: v2, after: v3, group: "typing" });
    expect(history.size.undo).toBe(2);
  });

  it("does not group a structural change with a preceding typing change", () => {
    const { now } = createFixedClock(0);
    const history = new HistoryManager(now, { typingGroupWindowMs: 10_000 });
    const v1 = doc("1");
    const v2 = doc("2");
    const v3 = doc("3");
    history.push({ before: v1, after: v2, group: "typing" });
    history.push({ before: v2, after: v3, group: "structural" });
    expect(history.size.undo).toBe(2);
  });

  it("evicts the oldest entry once maxEntries is exceeded", () => {
    const { now } = createFixedClock(0);
    const history = new HistoryManager(now, { maxEntries: 2, typingGroupWindowMs: 0 });
    for (let i = 0; i < 5; i++) {
      history.push({ before: doc(String(i)), after: doc(String(i + 1)), group: "structural" });
    }
    expect(history.size.undo).toBe(2);
  });

  it("undo/redo on an empty history returns undefined without throwing", () => {
    const { now } = createFixedClock(0);
    const history = new HistoryManager(now);
    expect(history.undo()).toBeUndefined();
    expect(history.redo()).toBeUndefined();
  });
});
