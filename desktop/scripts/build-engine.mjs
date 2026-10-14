import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../..");
await build({
  entryPoints: [resolve(repositoryRoot, "packages/engine/src/index.ts")],
  outfile: resolve(here, "../src/engine-bundle.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: false,
  legalComments: "none",
});
console.log("Nexus Engine integrado ao cliente Desktop.");
