import type {
  Block,
  BulletList,
  Heading,
  ImageBlock,
  ListItem,
  Mark,
  NexusDocument,
  OrderedList,
  Paragraph,
  Table,
  TextRun,
} from "../model/types";
import { KNOWN_BLOCK_TYPES, KNOWN_MARK_TYPES, isValidColor, isValidFontSize, isValidLink, type EngineLimits, DEFAULT_LIMITS } from "../schema/schema";
import { isValidId } from "../core/ids";
import { EngineError, engineError } from "../errors/errors";
import { err, ok, type Result } from "../utils/result";

export interface ValidationIssue {
  code: EngineError["code"];
  message: string;
  path: string;
}

class Counter {
  nodes = 0;
  maxDepth = 0;
}

function checkId(id: unknown, path: string, seen: Set<string>, issues: ValidationIssue[]): void {
  if (!isValidId(id)) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Invalid node id at ${path}`, path });
    return;
  }
  if (seen.has(id)) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Duplicate node id "${id}" at ${path}`, path });
    return;
  }
  seen.add(id);
}

function checkMark(mark: Mark, path: string, issues: ValidationIssue[]): void {
  if (!KNOWN_MARK_TYPES.has(mark.type)) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Unknown mark type "${mark.type}" at ${path}`, path });
    return;
  }
  if (mark.type === "color" || mark.type === "highlight") {
    if (!isValidColor(mark.value)) {
      issues.push({ code: "INVALID_DOCUMENT", message: `Invalid color "${mark.value}" at ${path}`, path });
    }
  }
  if (mark.type === "fontSize" && !isValidFontSize(mark.value)) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Invalid fontSize "${mark.value}" at ${path}`, path });
  }
  if (mark.type === "fontFamily" && (typeof mark.value !== "string" || mark.value.trim().length === 0)) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Invalid fontFamily at ${path}`, path });
  }
  if (mark.type === "link" && !isValidLink(mark.value)) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Invalid or unsafe link URL at ${path}`, path });
  }
  if (mark.type === "comment" && (typeof mark.value !== "string" || !mark.value.trim() || mark.value.length > 2000)) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Invalid comment mark at ${path}`, path });
  }
}

function checkTextRun(
  run: TextRun,
  path: string,
  seen: Set<string>,
  issues: ValidationIssue[],
  limits: EngineLimits,
  counter: Counter,
  depth: number,
): void {
  counter.nodes += 1;
  counter.maxDepth = Math.max(counter.maxDepth, depth);
  checkId(run.id, path, seen, issues);
  if (typeof run.text !== "string") {
    issues.push({ code: "INVALID_DOCUMENT", message: `Text run text must be a string at ${path}`, path });
  } else if (run.text.length > limits.maxTextRunLength) {
    issues.push({ code: "LIMIT_EXCEEDED", message: `Text run exceeds maxTextRunLength at ${path}`, path });
  }
  if (!Array.isArray(run.marks)) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Marks must be an array at ${path}`, path });
  } else {
    run.marks.forEach((mark, index) => checkMark(mark, `${path}.marks[${index}]`, issues));
  }
}

function checkParagraphLike(
  node: Paragraph | Heading,
  path: string,
  seen: Set<string>,
  issues: ValidationIssue[],
  limits: EngineLimits,
  counter: Counter,
  depth: number,
): void {
  counter.nodes += 1;
  counter.maxDepth = Math.max(counter.maxDepth, depth);
  checkId(node.id, path, seen, issues);
  if (!Array.isArray(node.children) || node.children.length === 0) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Block must contain at least one text run at ${path}`, path });
    return;
  }
  node.children.forEach((run, index) => {
    if (!run || run.type !== "text") {
      issues.push({ code: "INVALID_DOCUMENT", message: `Expected text run at ${path}.children[${index}]`, path });
      return;
    }
    checkTextRun(run, `${path}.children[${index}]`, seen, issues, limits, counter, depth + 1);
  });
  if (node.indent !== undefined && (!Number.isFinite(node.indent) || node.indent < 0 || node.indent > 720)) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Indent out of range at ${path}`, path });
  }
  if (node.spacingBefore !== undefined && (!Number.isFinite(node.spacingBefore) || node.spacingBefore < 0 || node.spacingBefore > 720)) issues.push({ code: "INVALID_DOCUMENT", message: `Spacing before out of range at ${path}`, path });
  if (node.spacingAfter !== undefined && (!Number.isFinite(node.spacingAfter) || node.spacingAfter < 0 || node.spacingAfter > 720)) issues.push({ code: "INVALID_DOCUMENT", message: `Spacing after out of range at ${path}`, path });
  if (node.lineSpacing !== undefined && (!Number.isFinite(node.lineSpacing) || node.lineSpacing < 0.5 || node.lineSpacing > 4)) issues.push({ code: "INVALID_DOCUMENT", message: `Line spacing out of range at ${path}`, path });
  if (node.type === "heading" && (node.level < 1 || node.level > 6)) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Heading level out of range at ${path}`, path });
  }
}

function checkList(
  list: BulletList | OrderedList,
  path: string,
  seen: Set<string>,
  issues: ValidationIssue[],
  limits: EngineLimits,
  resourceIds: Set<string>,
  counter: Counter,
  depth: number,
): void {
  counter.nodes += 1;
  counter.maxDepth = Math.max(counter.maxDepth, depth);
  checkId(list.id, path, seen, issues);
  if (counter.maxDepth > limits.maxTreeDepth) {
    issues.push({ code: "LIMIT_EXCEEDED", message: `Tree depth exceeds limit at ${path}`, path });
    return;
  }
  if (!Array.isArray(list.children) || list.children.length === 0) {
    issues.push({ code: "INVALID_DOCUMENT", message: `List must contain at least one item at ${path}`, path });
    return;
  }
  list.children.forEach((item, index) => checkListItem(item, `${path}.children[${index}]`, seen, issues, limits, resourceIds, counter, depth + 1));
}

function checkListItem(
  item: ListItem,
  path: string,
  seen: Set<string>,
  issues: ValidationIssue[],
  limits: EngineLimits,
  resourceIds: Set<string>,
  counter: Counter,
  depth: number,
): void {
  counter.nodes += 1;
  counter.maxDepth = Math.max(counter.maxDepth, depth);
  checkId(item.id, path, seen, issues);
  if (item.type !== "listItem") {
    issues.push({ code: "INVALID_DOCUMENT", message: `Expected listItem at ${path}`, path });
    return;
  }
  if (!Array.isArray(item.children) || item.children.length === 0) {
    issues.push({ code: "INVALID_DOCUMENT", message: `List item must contain content at ${path}`, path });
    return;
  }
  item.children.forEach((child, index) => {
    const childPath = `${path}.children[${index}]`;
    if (child.type === "paragraph") {
      checkParagraphLike(child, childPath, seen, issues, limits, counter, depth + 1);
    } else if (child.type === "bulletList" || child.type === "orderedList") {
      checkList(child, childPath, seen, issues, limits, resourceIds, counter, depth + 1);
    } else {
      issues.push({ code: "INVALID_DOCUMENT", message: `Unsupported list item child at ${childPath}`, path: childPath });
    }
  });
}

function checkTable(
  table: Table,
  path: string,
  seen: Set<string>,
  issues: ValidationIssue[],
  limits: EngineLimits,
  counter: Counter,
  depth: number,
): void {
  counter.nodes += 1;
  counter.maxDepth = Math.max(counter.maxDepth, depth);
  checkId(table.id, path, seen, issues);
  if (!Array.isArray(table.children) || table.children.length === 0) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Table must contain at least one row at ${path}`, path });
    return;
  }
  const columnCount = table.children[0]?.children.length ?? 0;
  table.children.forEach((row, rowIndex) => {
    const rowPath = `${path}.children[${rowIndex}]`;
    counter.nodes += 1;
    checkId(row.id, rowPath, seen, issues);
    if (row.type !== "tableRow") {
      issues.push({ code: "INVALID_DOCUMENT", message: `Expected tableRow at ${rowPath}`, path: rowPath });
      return;
    }
    if (!Array.isArray(row.children) || row.children.length !== columnCount) {
      issues.push({ code: "INVALID_DOCUMENT", message: `Table rows must have consistent column count at ${rowPath}`, path: rowPath });
      return;
    }
    row.children.forEach((cell, cellIndex) => {
      const cellPath = `${rowPath}.children[${cellIndex}]`;
      counter.nodes += 1;
      checkId(cell.id, cellPath, seen, issues);
      if (cell.type !== "tableCell") {
        issues.push({ code: "INVALID_DOCUMENT", message: `Expected tableCell at ${cellPath}`, path: cellPath });
        return;
      }
      if (!Array.isArray(cell.children) || cell.children.length === 0) {
        issues.push({ code: "INVALID_DOCUMENT", message: `Table cell must contain a paragraph at ${cellPath}`, path: cellPath });
        return;
      }
      cell.children.forEach((paragraph, pIndex) =>
        checkParagraphLike(paragraph, `${cellPath}.children[${pIndex}]`, seen, issues, limits, counter, depth + 3),
      );
    });
  });
}

function checkImage(image: ImageBlock, path: string, seen: Set<string>, issues: ValidationIssue[], resourceIds: Set<string>, counter: Counter, depth: number): void {
  counter.nodes += 1;
  counter.maxDepth = Math.max(counter.maxDepth, depth);
  checkId(image.id, path, seen, issues);
  if (!resourceIds.has(image.resourceId)) {
    issues.push({ code: "RESOURCE_NOT_FOUND", message: `Image references unknown resource "${image.resourceId}" at ${path}`, path });
  }
  if (typeof image.alt !== "string") {
    issues.push({ code: "INVALID_DOCUMENT", message: `Image alt must be a string at ${path}`, path });
  }
}

function checkBlock(
  block: Block,
  path: string,
  seen: Set<string>,
  issues: ValidationIssue[],
  limits: EngineLimits,
  resourceIds: Set<string>,
  counter: Counter,
  depth: number,
): void {
  if (!block || typeof block !== "object" || !KNOWN_BLOCK_TYPES.has(block.type)) {
    issues.push({ code: "INVALID_DOCUMENT", message: `Unknown block type at ${path}`, path });
    return;
  }
  switch (block.type) {
    case "paragraph":
    case "heading":
      checkParagraphLike(block, path, seen, issues, limits, counter, depth);
      return;
    case "blockquote":
      counter.nodes += 1;
      checkId(block.id, path, seen, issues);
      if (!Array.isArray(block.children) || block.children.length === 0) {
        issues.push({ code: "INVALID_DOCUMENT", message: `Blockquote must contain content at ${path}`, path });
        return;
      }
      block.children.forEach((paragraph, index) => checkParagraphLike(paragraph, `${path}.children[${index}]`, seen, issues, limits, counter, depth + 1));
      return;
    case "thematicBreak":
      counter.nodes += 1;
      checkId(block.id, path, seen, issues);
      return;
    case "bulletList":
    case "orderedList":
      checkList(block, path, seen, issues, limits, resourceIds, counter, depth);
      return;
    case "table":
      checkTable(block, path, seen, issues, limits, counter, depth);
      return;
    case "image":
      checkImage(block, path, seen, issues, resourceIds, counter, depth);
      return;
  }
}

/** Walks the whole document and collects every validation issue found (does not short-circuit). */
export function collectValidationIssues(doc: NexusDocument, limits: EngineLimits = DEFAULT_LIMITS): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  const counter = new Counter();

  if (!doc || typeof doc !== "object") {
    return [{ code: "INVALID_DOCUMENT", message: "Document must be an object", path: "$" }];
  }
  if (!isValidId(doc.id)) {
    issues.push({ code: "INVALID_DOCUMENT", message: "Invalid document id", path: "$.id" });
  }
  if (typeof doc.schemaVersion !== "number" || !Number.isInteger(doc.schemaVersion) || doc.schemaVersion < 1) {
    issues.push({ code: "INVALID_DOCUMENT", message: "Invalid schemaVersion", path: "$.schemaVersion" });
  }
  if (!Array.isArray(doc.content)) {
    issues.push({ code: "INVALID_DOCUMENT", message: "Document content must be an array", path: "$.content" });
    return issues;
  }
  if (doc.content.length === 0) {
    issues.push({ code: "INVALID_DOCUMENT", message: "Document must contain at least one block", path: "$.content" });
  }
  if (!Array.isArray(doc.resources)) {
    issues.push({ code: "INVALID_DOCUMENT", message: "Document resources must be an array", path: "$.resources" });
  }
  const resourceIds = new Set<string>();
  if (Array.isArray(doc.resources)) {
    if (doc.resources.length > limits.maxResources) {
      issues.push({ code: "LIMIT_EXCEEDED", message: "Too many resources", path: "$.resources" });
    }
    doc.resources.forEach((resource, index) => {
      const path = `$.resources[${index}]`;
      if (!isValidId(resource.id)) {
        issues.push({ code: "INVALID_DOCUMENT", message: `Invalid resource id at ${path}`, path });
      } else if (resourceIds.has(resource.id)) {
        issues.push({ code: "INVALID_DOCUMENT", message: `Duplicate resource id at ${path}`, path });
      } else {
        resourceIds.add(resource.id);
      }
      if (resource.byteLength > limits.maxResourceBytes) {
        issues.push({ code: "LIMIT_EXCEEDED", message: `Resource exceeds maxResourceBytes at ${path}`, path });
      }
    });
  }
  if (doc.metadata && Object.keys(doc.metadata).length > limits.maxMetadataEntries) {
    issues.push({ code: "LIMIT_EXCEEDED", message: "Too many metadata entries", path: "$.metadata" });
  }

  doc.content.forEach((block, index) => checkBlock(block, `$.content[${index}]`, seen, issues, limits, resourceIds, counter, 1));

  if (counter.nodes > limits.maxNodes) {
    issues.push({ code: "LIMIT_EXCEEDED", message: `Document exceeds maxNodes (${counter.nodes} > ${limits.maxNodes})`, path: "$" });
  }
  if (counter.maxDepth > limits.maxTreeDepth) {
    issues.push({ code: "LIMIT_EXCEEDED", message: `Document exceeds maxTreeDepth (${counter.maxDepth} > ${limits.maxTreeDepth})`, path: "$" });
  }

  return issues;
}

/**
 * Validates a document without mutating it. Returns the same document
 * reference on success so callers can chain calls.
 */
export function validateDocument(doc: NexusDocument, limits: EngineLimits = DEFAULT_LIMITS): Result<NexusDocument> {
  const issues = collectValidationIssues(doc, limits);
  if (issues.length === 0) return ok(doc);
  const first = issues[0];
  return err(engineError(first.code, first.message, { path: first.path, details: { issues } }));
}
