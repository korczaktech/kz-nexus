import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
rmSync(resolve(here, "dist"), { recursive: true, force: true });
await build({
  entryPoints: [resolve(here, "src/index.ts")],
  outfile: resolve(here, "dist/index.js"),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  sourcemap: true,
  legalComments: "none"
});
const tscBin = require.resolve("typescript/bin/tsc");
const result = spawnSync(process.execPath, [tscBin, "-p", resolve(here, "tsconfig.build.json"), "--emitDeclarationOnly", "--declaration"], { stdio: "inherit", cwd: here });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Nexus Engine build concluído.");
