import { DEFAULT_PAGE_CONFIG, type DocumentMetadata, type MetadataValue, type NexusDocument, type PageConfig } from "../model/types";
import { CURRENT_SCHEMA_VERSION } from "../model/types";
import type { IdGenerator } from "../core/ids";
import type { Clock } from "../core/clock";
import { engineError } from "../errors/errors";
import { err, ok } from "../utils/result";
import type { Command } from "./types";

export interface CreateDocumentOptions {
  id?: string;
  title?: string;
  pageConfig?: Partial<PageConfig>;
}

/** Creates a brand-new, valid, minimal document (a single empty paragraph). */
export function createDocument(generateId: IdGenerator, now: Clock, options: CreateDocumentOptions = {}): NexusDocument {
  const timestamp = now();
  return {
    id: options.id ?? generateId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: { title: options.title ?? "Untitled document", createdAt: timestamp, updatedAt: timestamp },
    pageConfig: { ...DEFAULT_PAGE_CONFIG, ...options.pageConfig },
    content: [{ type: "paragraph", id: generateId(), children: [{ type: "text", id: generateId(), text: "", marks: [] }] }],
    resources: [],
  };
}

export function setPageConfig(params: { pageConfig: Partial<PageConfig> }): Command {
  return (doc) => ok({ document: { ...doc, pageConfig: { ...doc.pageConfig, ...params.pageConfig } } });
}

const PROTECTED_METADATA_KEYS = new Set(["createdAt"]);

export function setMetadata(params: { key: string; value: MetadataValue }): Command {
  return (doc) => {
    if (PROTECTED_METADATA_KEYS.has(params.key)) {
      return err(engineError("UNSUPPORTED_OPERATION", `Metadata key "${params.key}" cannot be modified directly`));
    }
    const metadata: DocumentMetadata = { ...doc.metadata, [params.key]: params.value };
    return ok({ document: { ...doc, metadata } });
  };
}
