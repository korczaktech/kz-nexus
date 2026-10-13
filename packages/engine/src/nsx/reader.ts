import type { NexusDocument } from "../model/types";
import { CURRENT_SCHEMA_VERSION } from "../model/types";
import { validateDocument } from "../validation/validate";
import { normalizeDocument } from "../normalization/normalize";
import { DEFAULT_LIMITS, type EngineLimits } from "../schema/schema";
import { isPlainObject, NSX_FORMAT_ID } from "./envelope";
import { migrateDocument } from "./migrations";
import { engineError } from "../errors/errors";
import { err, ok, type Result } from "../utils/result";
import type { IdGenerator } from "../core/ids";

/**
 * Parses and validates a `.nsx` text payload into a usable, normalized
 * document. Treats the input as untrusted (Section 9.7 / 19): size is
 * checked before parsing, the envelope shape and version are verified, and
 * the resulting document is validated twice (post-migration and
 * post-normalization) before being handed back to the caller.
 *
 * A failed read never mutates or replaces any engine state — it simply
 * returns an `Err` result.
 */
export function readNsx(text: string, generateId: IdGenerator, limits: EngineLimits = DEFAULT_LIMITS): Result<NexusDocument> {
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > limits.maxDocumentBytes) {
    return err(engineError("LIMIT_EXCEEDED", `File exceeds maxDocumentBytes (${byteLength} > ${limits.maxDocumentBytes})`));
  }
  if (text.trim().length === 0) {
    return err(engineError("CORRUPTED_CONTENT", "File is empty"));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return err(engineError("CORRUPTED_CONTENT", "File is not valid JSON", { cause: error }));
  }

  if (!isPlainObject(parsed)) {
    return err(engineError("CORRUPTED_CONTENT", "File does not contain a Korczak Nexus envelope object"));
  }
  if (parsed.format !== NSX_FORMAT_ID) {
    return err(engineError("UNSUPPORTED_FORMAT", `Unrecognized file format "${String(parsed.format)}"`));
  }
  if (typeof parsed.formatVersion !== "number" || !Number.isInteger(parsed.formatVersion) || parsed.formatVersion < 1) {
    return err(engineError("CORRUPTED_CONTENT", "Envelope is missing a valid formatVersion"));
  }
  if (!isPlainObject(parsed.document)) {
    return err(engineError("CORRUPTED_CONTENT", "Envelope is missing a document payload"));
  }

  const migrated = migrateDocument(parsed.document, parsed.formatVersion);
  if (!migrated.ok) return migrated;

  const candidate = migrated.value;
  if (typeof candidate.schemaVersion === "number" && candidate.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return err(
      engineError("VERSION_MISMATCH", `Document schema version ${candidate.schemaVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}`),
    );
  }

  const preValidation = validateDocument(candidate, limits);
  if (!preValidation.ok) {
    // Safety-limit violations keep their own stable code so hosts can tell "too big" from "corrupted".
    const code = preValidation.error.code === "LIMIT_EXCEEDED" ? "LIMIT_EXCEEDED" : "CORRUPTED_CONTENT";
    return err(engineError(code, `Document failed validation: ${preValidation.error.message}`, { cause: preValidation.error }));
  }

  const normalized = normalizeDocument(candidate, generateId);
  const postValidation = validateDocument(normalized, limits);
  if (!postValidation.ok) {
    return err(engineError("CORRUPTED_CONTENT", `Normalized document failed validation: ${postValidation.error.message}`, { cause: postValidation.error }));
  }

  return ok(normalized);
}
