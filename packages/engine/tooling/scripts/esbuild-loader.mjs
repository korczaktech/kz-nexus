// Resolves esbuild: prefers a direct dependency, falls back to the copy bundled with tsx.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "package.json"));

export function loadEsbuild() {
  try { return require("esbuild"); } catch { /* fall through to tsx's bundled copy */ }
  const nested = resolve(root, "node_modules/tsx/node_modules/esbuild/lib/main.js");
  if (existsSync(nested)) return require(nested);
  throw new Error("esbuild not found. Install it (npm i -D esbuild) or install tsx, which bundles it.");
}
