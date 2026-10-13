/**
 * Korczak Nexus Engine — public entry point.
 *
 * This module is the ONLY supported way to consume the engine. Hosts
 * (including the engine-preview application) must not import files from
 * subdirectories of `src/engine` directly — see
 * `scripts/check-architecture.mjs`, which enforces this boundary.
 */

// Model
export * from "./model/types";
export { getPlainText } from "./model/tree";

// Schema & limits
export { DEFAULT_LIMITS, KNOWN_BLOCK_TYPES, KNOWN_MARK_TYPES, isValidColor, isValidFontSize } from "./schema/schema";
export type { EngineLimits } from "./schema/schema";

// Validation & normalization
export { validateDocument, collectValidationIssues } from "./validation/validate";
export type { ValidationIssue } from "./validation/validate";
export { normalizeDocument } from "./normalization/normalize";

// Identifiers & clock (for hosts that need deterministic ids, e.g. tests)
export { createIdGenerator, createSeededRandom as createSeededRandomForTests, isValidId } from "./core/ids";
export type { IdGenerator } from "./core/ids";
export { systemClock, createFixedClock } from "./core/clock";
export type { Clock } from "./core/clock";

// Errors & results
export { EngineError, engineError } from "./errors/errors";
export type { EngineErrorCode } from "./errors/errors";
export { ok, err, isOk, isErr, unwrap } from "./utils/result";
export type { Result } from "./utils/result";

// Selection
export { isCollapsed, collapsedAt, orderedRange } from "./selection/selection";
export type { Position, Selection } from "./selection/selection";

// Commands (operations)
export type { Command, CommandContext, CommandOutcome, CommandResult } from "./commands/types";
export { insertText, deleteText, replaceRange } from "./commands/text";
export { applyMark, removeMark, toggleMark } from "./commands/marks";
export {
  setAlign,
  setHeadingLevel,
  splitBlock,
  mergeBlockWithPrevious,
  insertParagraphAfter,
  deleteBlock,
  insertBlockquote,
  convertBlockToBlockquote,
  insertThematicBreak,
} from "./commands/block";
export { insertList, convertBlockToList, convertListType, insertListItem, splitListItem, removeListItem } from "./commands/list";
export { insertTable, addTableRow, removeTableRow, addTableColumn, removeTableColumn, setCellText } from "./commands/table";
export { insertImage, insertImageResource, removeImage } from "./commands/image";
export { setPageConfig, setMetadata } from "./commands/document";
export type { CreateDocumentOptions } from "./commands/document";

// Transactions
export { applyTransaction } from "./transactions/transaction";
export type { TransactionOutcome } from "./transactions/transaction";

// History
export { HistoryManager } from "./history/history";
export type { HistoryGroup, HistoryOptions } from "./history/history";

// Resources
export { addResource, removeResource } from "./resources/resources";
export type { AddResourceInput } from "./resources/resources";

// NSX native format
export { NSX_FORMAT_ID, CURRENT_NSX_FORMAT_VERSION } from "./nsx/envelope";
export type { NsxEnvelope } from "./nsx/envelope";
export { writeNsx } from "./nsx/writer";
export { readNsx } from "./nsx/reader";
export { openNsx, saveNsx } from "./nsx/api";

// Importers / exporters
export { importPlainText } from "./importers/plainText";
export { exportPlainText } from "./exporters/plainText";

// Adapter contracts (types only — no implementation in the core)
export type { FileIO, ResourceProvider, StorageAdapter } from "./adapters/contracts";

// Editor session (main stateful API)
export { Editor, createEditor, createDocument } from "./editor/editor";
export type { EditorOptions, EditorEvents, ExecOptions } from "./editor/editor";
