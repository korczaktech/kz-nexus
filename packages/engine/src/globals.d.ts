/**
 * The engine targets any ES2022 runtime and does NOT compile against the DOM
 * or Node typings (Section 4.3). These two globals exist in every supported
 * runtime (browsers, Node >= 18, JavaScriptCore/Hermes WebViews) and are the
 * only ambient declarations the core needs.
 */
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare function structuredClone<T>(value: T): T;
