/** Browser compatibility shim for dependencies that reference Node's global identifier. */
type GlobalWithNodeGlobal = typeof globalThis & { global?: typeof globalThis };
const runtimeGlobal = globalThis as GlobalWithNodeGlobal;
if (typeof runtimeGlobal.global === "undefined") {
  Object.defineProperty(runtimeGlobal, "global", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: runtimeGlobal,
  });
}
