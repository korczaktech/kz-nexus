import type { NexusDocument } from "../model/types";
import type { EngineLimits } from "../schema/schema";
import { DEFAULT_LIMITS } from "../schema/schema";
import { createIdGenerator, type IdGenerator } from "../core/ids";
import type { Result } from "../utils/result";
import { writeNsx } from "./writer";
import { readNsx } from "./reader";

/** Headless convenience wrapper around {@link readNsx} for simple scripts/examples. */
export function openNsx(text: string, options: { idGenerator?: IdGenerator; limits?: EngineLimits } = {}): Result<NexusDocument> {
  return readNsx(text, options.idGenerator ?? createIdGenerator("n"), options.limits ?? DEFAULT_LIMITS);
}

/** Headless convenience wrapper around {@link writeNsx}. */
export function saveNsx(document: NexusDocument, limits: EngineLimits = DEFAULT_LIMITS): Result<string> {
  return writeNsx(document, limits);
}
