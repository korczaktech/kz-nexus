import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { convertListType, insertList, insertListItem, removeListItem } from "./list";
import { insertText } from "./text";
import type { BulletList, OrderedList, Paragraph } from "../model/types";

function ctx() {
  return { generateId: createIdGenerator("id", 4) };
}

function base() {
  return createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
}

describe("insertList / convertListType", () => {
  it("inserts a bullet list after a block", () => {
    const d = base();
    const result = insertList({ afterBlockId: d.content[0].id, ordered: false })(d, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.document.content).toHaveLength(2);
      expect(result.value.document.content[1].type).toBe("bulletList");
    }
  });

  it("converts a bullet list to an ordered list and back", () => {
    const d = base();
    const inserted = insertList({ afterBlockId: d.content[0].id, ordered: false })(d, ctx());
    if (!inserted.ok) throw inserted.error;
    const listId = inserted.value.document.content[1].id;
    const converted = convertListType({ listId, ordered: true })(inserted.value.document, ctx());
    if (!converted.ok) throw converted.error;
    const list = converted.value.document.content[1] as OrderedList;
    expect(list.type).toBe("orderedList");
    expect(list.start).toBe(1);

    const back = convertListType({ listId, ordered: false })(converted.value.document, ctx());
    if (!back.ok) throw back.error;
    expect((back.value.document.content[1] as BulletList).type).toBe("bulletList");
  });

  it("fails to convert an unknown list", () => {
    const d = base();
    const result = convertListType({ listId: "n_missing1", ordered: true })(d, ctx());
    expect(result.ok).toBe(false);
  });
});

describe("insertListItem / removeListItem", () => {
  it("inserts a new item after an existing one", () => {
    const d = base();
    const inserted = insertList({ afterBlockId: d.content[0].id, ordered: false })(d, ctx());
    if (!inserted.ok) throw inserted.error;
    const list = inserted.value.document.content[1] as BulletList;
    const firstItemId = list.children[0].id;
    const withSecond = insertListItem({ listId: list.id, afterItemId: firstItemId })(inserted.value.document, ctx());
    if (!withSecond.ok) throw withSecond.error;
    const updatedList = withSecond.value.document.content[1] as BulletList;
    expect(updatedList.children).toHaveLength(2);
  });

  it("removes an item, and removes the whole list when the last item is removed", () => {
    const d = base();
    const inserted = insertList({ afterBlockId: d.content[0].id, ordered: false })(d, ctx());
    if (!inserted.ok) throw inserted.error;
    const list = inserted.value.document.content[1] as BulletList;
    const itemId = list.children[0].id;
    const removed = removeListItem({ listId: list.id, itemId })(inserted.value.document, ctx());
    if (!removed.ok) throw removed.error;
    expect(removed.value.document.content).toHaveLength(1); // list is gone entirely
  });

  it("supports nested sublists", () => {
    const d = base();
    const inserted = insertList({ afterBlockId: d.content[0].id, ordered: false })(d, ctx());
    if (!inserted.ok) throw inserted.error;
    const list = inserted.value.document.content[1] as BulletList;
    const itemId = list.children[0].id;
    // Manually nest a sublist for this test (simulating a future "indent" command).
    const nestedListId = ctx().generateId();
    const nestedParagraph: Paragraph = { type: "paragraph", id: ctx().generateId(), children: [{ type: "text", id: ctx().generateId(), text: "nested", marks: [] }] };
    const nested: BulletList = { type: "bulletList", id: nestedListId, children: [{ type: "listItem", id: ctx().generateId(), children: [nestedParagraph] }] };
    const docWithNested = structuredClone(inserted.value.document);
    const outerList = docWithNested.content[1] as BulletList;
    outerList.children[0].children.push(nested);

    const converted = convertListType({ listId: nestedListId, ordered: true })(docWithNested, ctx());
    expect(converted.ok).toBe(true);
    if (converted.ok) {
      const outer = converted.value.document.content[1] as BulletList;
      expect(outer.children[0].children[1].type).toBe("orderedList");
    }
    void itemId;
  });
});
