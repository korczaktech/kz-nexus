import type { NexusDocument } from "../model/types";
import { engineError } from "../errors/errors";
import { err, ok, type Result } from "../utils/result";
import { CURRENT_NSX_FORMAT_VERSION } from "./envelope";

/**
 * Deterministic, explicit migrations keyed by their source `formatVersion`.
 * Each migration receives the raw envelope's `document` payload (not yet
 * validated against the current schema) and must return a document shaped
 * for `fromVersion + 1`.
 *
 * There is only one format version today (1), so the registry is empty but
 * wired up end-to-end so future versions have a concrete place to land.
 */
type Migration = (document: unknown) => unknown;

const MIGRATIONS: Record<number, Migration> = {
  // Example for the future: `1: (doc) => ({ ...doc, newField: defaultValue })`
};

export function migrateDocument(document: unknown, fromVersion: number): Result<NexusDocument> {
  if (fromVersion > CURRENT_NSX_FORMAT_VERSION) {
    return err(
      engineError("VERSION_MISMATCH", `File format version ${fromVersion} is newer than supported version ${CURRENT_NSX_FORMAT_VERSION}`, {
        details: { fromVersion, supportedVersion: CURRENT_NSX_FORMAT_VERSION },
      }),
    );
  }
  let current = document;
  for (let version = fromVersion; version < CURRENT_NSX_FORMAT_VERSION; version++) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      return err(engineError("MIGRATION_FAILED", `No migration registered from format version ${version}`, { details: { version } }));
    }
    try {
      current = migration(current);
    } catch (error) {
      return err(engineError("MIGRATION_FAILED", `Migration from format version ${version} threw an error`, { cause: error }));
    }
  }
  return ok(current as NexusDocument);
}
