import type { NexusDocument } from "../model/types";
import { validateDocument } from "../validation/validate";
import { DEFAULT_LIMITS, type EngineLimits } from "../schema/schema";
import { CURRENT_NSX_FORMAT_VERSION, NSX_FORMAT_ID, type NsxEnvelope } from "./envelope";
import { engineError } from "../errors/errors";
import { err, ok, type Result } from "../utils/result";

/**
 * Serializes a document into the native `.nsx` text format (UTF-8 JSON).
 * Never mutates the input document. Fails closed: an invalid document is
 * never serialized.
 */
export function writeNsx(doc: NexusDocument, limits: EngineLimits = DEFAULT_LIMITS): Result<string> {
  const validation = validateDocument(doc, limits);
  if (!validation.ok) {
    return err(engineError("INVALID_DOCUMENT", `Cannot serialize an invalid document: ${validation.error.message}`, { cause: validation.error }));
  }

  const envelope: NsxEnvelope = {
    format: NSX_FORMAT_ID,
    formatVersion: CURRENT_NSX_FORMAT_VERSION,
    document: doc,
  };

  let text: string;
  try {
    text = JSON.stringify(envelope, null, 2);
  } catch (error) {
    return err(engineError("CORRUPTED_CONTENT", "Failed to serialize document to JSON", { cause: error }));
  }

  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength > limits.maxDocumentBytes) {
    return err(engineError("LIMIT_EXCEEDED", `Serialized document exceeds maxDocumentBytes (${byteLength} > ${limits.maxDocumentBytes})`));
  }

  return ok(text);
}
