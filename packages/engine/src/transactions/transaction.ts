import type { NexusDocument } from "../model/types";
import type { Position } from "../selection/selection";
import type { Command, CommandContext } from "../commands/types";
import { validateDocument } from "../validation/validate";
import type { EngineLimits } from "../schema/schema";
import { DEFAULT_LIMITS } from "../schema/schema";
import { EngineError, engineError } from "../errors/errors";
import { err, ok, type Result } from "../utils/result";

export interface TransactionOutcome {
  document: NexusDocument;
  selection?: Position;
}

/**
 * Applies a sequence of commands atomically (Section 6.1). Every command runs
 * against the in-progress working document; if any command fails, or the
 * resulting document fails validation, the whole transaction is rejected and
 * the original document is returned unchanged — no partial state is ever
 * observable by callers.
 */
export function applyTransaction(
  doc: NexusDocument,
  commands: Command[],
  ctx: CommandContext,
  limits: EngineLimits = DEFAULT_LIMITS,
): Result<TransactionOutcome> {
  if (commands.length === 0) {
    return err(engineError("TRANSACTION_REJECTED", "A transaction must contain at least one command"));
  }
  let working = doc;
  let selection: Position | undefined;
  for (const [index, command] of commands.entries()) {
    let result;
    try {
      result = command(working, ctx);
    } catch (error) {
      const cause = error instanceof EngineError ? error : engineError("TRANSACTION_REJECTED", `Command ${index} threw an unexpected error`, { cause: error });
      return err(cause);
    }
    if (!result.ok) {
      return err(engineError("TRANSACTION_REJECTED", `Command ${index} failed: ${result.error.message}`, { cause: result.error, details: result.error }));
    }
    working = result.value.document;
    if (result.value.selection) selection = result.value.selection;
  }
  const validation = validateDocument(working, limits);
  if (!validation.ok) {
    return err(engineError("TRANSACTION_REJECTED", `Resulting document failed validation: ${validation.error.message}`, { cause: validation.error }));
  }
  return ok({ document: working, selection });
}
