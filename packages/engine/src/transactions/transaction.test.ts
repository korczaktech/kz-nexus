import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "../commands/document";
import { insertText } from "../commands/text";
import { deleteBlock, insertParagraphAfter } from "../commands/block";
import { applyTransaction } from "./transaction";
import type { Paragraph } from "../model/types";

function ctx() {
  return { generateId: createIdGenerator("id", 6) };
}

describe("applyTransaction", () => {
  it("applies multiple commands atomically", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const blockId = doc.content[0].id;
    const result = applyTransaction(doc, [insertText({ blockId, offset: 0, text: "Hi" }), insertParagraphAfter({ blockId })], ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.document.content).toHaveLength(2);
      expect((result.value.document.content[0] as Paragraph).children[0].text).toBe("Hi");
    }
  });

  it("rejects the whole transaction and preserves the original document when a later command fails", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const blockId = doc.content[0].id;
    const result = applyTransaction(
      doc,
      [insertText({ blockId, offset: 0, text: "Hi" }), deleteBlock({ blockId: "n_doesnotexist" })],
      ctx(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("TRANSACTION_REJECTED");
  });

  it("never mutates the input document even on failure", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const before = JSON.stringify(doc);
    applyTransaction(doc, [insertText({ blockId: "missing", offset: 0, text: "x" })], ctx());
    expect(JSON.stringify(doc)).toBe(before);
  });

  it("rejects a transaction with zero commands", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const result = applyTransaction(doc, [], ctx());
    expect(result.ok).toBe(false);
  });

  it("rejects a transaction whose result would fail document validation", () => {
    const doc = createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
    const blockId = doc.content[0].id;
    // Deleting the only block directly would normally be rejected by the command,
    // but we simulate a command that bypasses that guard to prove the transaction's
    // own validation pass is a real, independent safety net.
    const malicious = () => ({ ok: true as const, value: { document: { ...doc, content: [] } } });
    const result = applyTransaction(doc, [malicious, insertText({ blockId, offset: 0, text: "x" })], ctx());
    expect(result.ok).toBe(false);
  });
});
