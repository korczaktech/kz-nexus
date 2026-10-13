import type { NexusDocument } from "../model/types";
import type { Position } from "../selection/selection";
import type { IdGenerator } from "../core/ids";
import type { Result } from "../utils/result";

/** Services injected into every command (no ambient globals — see Section 4.3). */
export interface CommandContext {
  generateId: IdGenerator;
}

/** What a successful command produces: the next document and, optionally, the resulting caret. */
export interface CommandOutcome {
  document: NexusDocument;
  selection?: Position;
}

export type CommandResult = Result<CommandOutcome>;

/**
 * A command is a pure function from a document to a new document. It must
 * never mutate its input; failures are returned as structured errors.
 */
export type Command = (doc: NexusDocument, ctx: CommandContext) => CommandResult;
