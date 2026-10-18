import { describe, expect, it } from "vitest";
import { createIdGenerator } from "../core/ids";
import { createFixedClock } from "../core/clock";
import { createDocument } from "./document";
import { convertBlockToList, convertBlocksToList, convertListType, insertList, insertListItem, splitListItem, mergeListItemWithPrevious, removeListItem } from "./list";
import { insertText } from "./text";
import { insertTable } from "./table";
import { insertParagraphAfter } from "./block";
import type { BulletList, OrderedList, Paragraph } from "../model/types";
import { validateDocument } from "../validation/validate";

const generateTestId = createIdGenerator("id", 4);
function ctx() {
  return { generateId: generateTestId };
}

function base() {
  return createDocument(createIdGenerator("n", 1), createFixedClock(0).now);
}

describe("convertBlockToList", () => {

  it("converts a paragraph inside a table cell into a nested list", () => {
    const d = base();
    const paragraph = d.content[0] as Paragraph;
    const inserted = insertTable({ afterBlockId: paragraph.id, rows: 1, columns: 1 })(d, ctx());
    if (!inserted.ok) throw inserted.error;
    const table = inserted.value.document.content.find(block => block.type === "table");
    if (!table || table.type !== "table") throw new Error("Expected table");
    const cell = table.children[0]!.children[0]!;
    const cellParagraph = cell.children[0];
    if (!cellParagraph || cellParagraph.type !== "paragraph") throw new Error("Expected cell paragraph");
    const converted = convertBlockToList({ blockId: cellParagraph.id, ordered: false })(inserted.value.document, ctx());
    if (!converted.ok) throw converted.error;
    const updatedTable = converted.value.document.content.find(block => block.type === "table");
    if (!updatedTable || updatedTable.type !== "table") throw new Error("Expected converted table");
    expect(updatedTable.children[0]!.children[0]!.children[0]?.type).toBe("bulletList");
    expect(validateDocument(converted.value.document).ok).toBe(true);
  });

  it("converts a paragraph into a list without losing its text or paragraph ID", () => {
    const d = base();
    const paragraph = d.content[0] as Paragraph;
    const inserted = insertText({ blockId: paragraph.id, offset: 0, text: "Preserved text" })(d, ctx());
    if (!inserted.ok) throw inserted.error;
    const converted = convertBlockToList({ blockId: paragraph.id, ordered: false })(inserted.value.document, ctx());
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    const list = converted.value.document.content[0] as BulletList;
    expect(list.type).toBe("bulletList");
    expect(list.children[0].children[0].id).toBe(paragraph.id);
    expect((list.children[0].children[0] as Paragraph).children.map(run => run.text).join("")).toBe("Preserved text");
    expect(validateDocument(converted.value.document).ok).toBe(true);
  });
});

describe("convertBlocksToList", () => {
  it("converts consecutive selected paragraphs into one list and preserves text", () => {
    const d = base();
    const first = d.content[0] as Paragraph;
    const secondResult = insertParagraphAfter({ blockId: first.id })(d, ctx());
    if (!secondResult.ok) throw secondResult.error;
    const withText = insertText({ blockId: first.id, offset: 0, text: "first" })(secondResult.value.document, ctx());
    if (!withText.ok) throw withText.error;
    const second = withText.value.document.content[1] as Paragraph;
    const withSecondText = insertText({ blockId: second.id, offset: 0, text: "second" })(withText.value.document, ctx());
    if (!withSecondText.ok) throw withSecondText.error;
    const converted = convertBlocksToList({ blockIds: [first.id, second.id], ordered: false })(withSecondText.value.document, ctx());
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    expect(converted.value.document.content).toHaveLength(1);
    const list = converted.value.document.content[0] as BulletList;
    expect(list.children).toHaveLength(2);
    expect((list.children[0]!.children[0] as Paragraph).children.map(run => run.text).join("")).toBe("first");
    expect((list.children[1]!.children[0] as Paragraph).children.map(run => run.text).join("")).toBe("second");
    expect(validateDocument(converted.value.document).ok).toBe(true);
  });
});

describe("splitListItem", () => {
  it("splits a list item at the logical caret and preserves both text fragments", () => {
    const d = base();
    const paragraph = d.content[0] as Paragraph;
    const insertedText = insertText({ blockId: paragraph.id, offset: 0, text: "hello world" })(d, ctx());
    if (!insertedText.ok) throw insertedText.error;
    const converted = convertBlockToList({ blockId: paragraph.id, ordered: false })(insertedText.value.document, ctx());
    if (!converted.ok) throw converted.error;
    const list = converted.value.document.content[0] as BulletList;
    const firstItem = list.children[0];
    const split = splitListItem({ listId: list.id, itemId: firstItem.id, blockId: paragraph.id, offset: 5 })(converted.value.document, ctx());
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const result = split.value.document.content[0] as BulletList;
    expect(result.children).toHaveLength(2);
    expect((result.children[0].children[0] as Paragraph).children.map(run => run.text).join("")).toBe("hello");
    expect((result.children[1].children[0] as Paragraph).children.map(run => run.text).join("")).toBe(" world");
    expect(validateDocument(split.value.document).ok).toBe(true);
  });
});

describe("mergeListItemWithPrevious", () => {
  it("merges a list item into its previous sibling at the logical caret", () => {
    const d = base();
    const paragraph = d.content[0] as Paragraph;
    const inserted = insertText({ blockId: paragraph.id, offset: 0, text: "alpha" })(d, ctx());
    if (!inserted.ok) throw inserted.error;
    const converted = convertBlockToList({ blockId: paragraph.id, ordered: false })(inserted.value.document, ctx());
    if (!converted.ok) throw converted.error;
    const list = converted.value.document.content[0] as BulletList;
    const split = splitListItem({ listId: list.id, itemId: list.children[0].id, blockId: paragraph.id, offset: 2 })(converted.value.document, ctx());
    if (!split.ok) throw split.error;
    const splitList = split.value.document.content[0] as BulletList;
    const secondItem = splitList.children[1]!;
    const secondParagraph = secondItem.children[0] as Paragraph;
    const merged = mergeListItemWithPrevious({ listId: splitList.id, itemId: secondItem.id, blockId: secondParagraph.id })(split.value.document, ctx());
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    const result = merged.value.document.content[0] as BulletList;
    expect(result.children).toHaveLength(1);
    expect((result.children[0].children[0] as Paragraph).children.map(run => run.text).join("")).toBe("alpha");
    expect(validateDocument(merged.value.document).ok).toBe(true);
  });
});

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
