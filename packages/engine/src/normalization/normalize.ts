import type { Block, Heading, ListItem, Mark, NexusDocument, Paragraph, Table, TextRun, BulletList, OrderedList } from "../model/types";
import { isValidId, type IdGenerator } from "../core/ids";
import { deepClone } from "../utils/clone";

/**
 * Normalization is explicit and deterministic (Section 5.5). It:
 *  - merges adjacent text runs that carry the exact same marks,
 *  - drops fully empty text runs unless they are the sole child of a block,
 *  - clamps heading levels into the supported 1-6 range,
 *  - regenerates only duplicate/invalid node ids (never the whole tree),
 *  - never drops structural content silently.
 *
 * Normalizing an already-normalized document is a no-op (idempotence is
 * covered by property tests in normalize.test.ts).
 */
export function normalizeDocument(doc: NexusDocument, generateId: IdGenerator): NexusDocument {
  const clone = deepClone(doc);
  const seen = new Set<string>();

  const nextId = (id: string): string => {
    if (isValidId(id) && !seen.has(id)) {
      seen.add(id);
      return id;
    }
    let candidate = generateId();
    while (seen.has(candidate)) candidate = generateId();
    seen.add(candidate);
    return candidate;
  };

  clone.id = nextId(clone.id);

  for (const resource of clone.resources) {
    resource.id = nextId(resource.id);
  }

  clone.content = clone.content.map((block) => normalizeBlock(block, nextId));
  return clone;
}

function marksEqual(a: Mark[], b: Mark[]): boolean {
  if (a.length !== b.length) return false;
  const serialize = (m: Mark) => JSON.stringify(m);
  const sa = [...a].map(serialize).sort();
  const sb = [...b].map(serialize).sort();
  return sa.every((value, index) => value === sb[index]);
}

function normalizeTextRuns(runs: TextRun[], nextId: (id: string) => string): TextRun[] {
  const withIds = runs.map((run) => ({ ...run, id: nextId(run.id) }));
  const nonEmpty = withIds.filter((run) => run.text.length > 0);
  const merged: TextRun[] = [];
  for (const run of nonEmpty) {
    const last = merged[merged.length - 1];
    if (last && marksEqual(last.marks, run.marks)) {
      last.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }
  if (merged.length === 0) {
    const fallback = withIds[0];
    return [{ type: "text", id: fallback ? fallback.id : nextId(""), text: "", marks: fallback ? fallback.marks : [] }];
  }
  return merged;
}

function normalizeParagraph(block: Paragraph, nextId: (id: string) => string): Paragraph {
  return { ...block, id: nextId(block.id), children: normalizeTextRuns(block.children, nextId) };
}

function normalizeHeading(block: Heading, nextId: (id: string) => string): Heading {
  const level = Math.min(6, Math.max(1, Math.round(block.level))) as Heading["level"];
  return { ...block, id: nextId(block.id), level, children: normalizeTextRuns(block.children, nextId) };
}

function normalizeListItem(item: ListItem, nextId: (id: string) => string): ListItem {
  return {
    ...item,
    id: nextId(item.id),
    children: item.children.map((child) => {
      if (child.type === "paragraph") return normalizeParagraph(child, nextId);
      return normalizeList(child, nextId);
    }),
  };
}

function normalizeList(list: BulletList | OrderedList, nextId: (id: string) => string): BulletList | OrderedList {
  return { ...list, id: nextId(list.id), children: list.children.map((item) => normalizeListItem(item, nextId)) };
}

function normalizeTable(table: Table, nextId: (id: string) => string): Table {
  return {
    ...table,
    id: nextId(table.id),
    children: table.children.map((row) => ({
      ...row,
      id: nextId(row.id),
      children: row.children.map((cell) => ({
        ...cell,
        id: nextId(cell.id),
        children: cell.children.map((child) => normalizeBlock(child, nextId)),
        images: cell.images?.map((image) => ({ ...image, id: nextId(image.id) })),
      })),
    })),
  };
}

function normalizeBlock(block: Block, nextId: (id: string) => string): Block {
  switch (block.type) {
    case "paragraph":
      return normalizeParagraph(block, nextId);
    case "heading":
      return normalizeHeading(block, nextId);
    case "blockquote":
      return { ...block, id: nextId(block.id), children: block.children.map((p) => normalizeParagraph(p, nextId)) };
    case "thematicBreak":
      return { ...block, id: nextId(block.id) };
    case "bulletList":
    case "orderedList":
      return normalizeList(block, nextId);
    case "table":
      return normalizeTable(block, nextId);
    case "image":
      return { ...block, id: nextId(block.id) };
  }
}
