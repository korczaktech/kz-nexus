/**
 * Host integration contracts (Section 4.2 / 12). The engine core never
 * implements these — it only depends on the shapes below. Web, Desktop,
 * Android and iOS hosts each provide a concrete implementation appropriate
 * for their platform. See docs/PLATFORM_ADAPTERS.md.
 */

/** Reads/writes opaque text payloads (e.g. `.nsx` files) for a specific host. */
export interface FileIO {
  readText(handle: unknown): Promise<string>;
  writeText(handle: unknown, text: string): Promise<void>;
}

/** Supplies resource bytes (e.g. images) as base64, decoupled from any filesystem API. */
export interface ResourceProvider {
  loadBase64(resourceRef: { id: string }): Promise<string>;
}

/** Generic key/value persistence contract a host may offer (e.g. browser storage, native disk, a server API). */
export interface StorageAdapter {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}
