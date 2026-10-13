// Runs *.test.ts / *.test.tsx files below a package directory.
// Uses real `vitest` when installed; otherwise falls back to node:test + tools/vitest-shim.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const target = resolve(root, process.argv[2] ?? "packages/engine");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk(target);
if (files.length === 0) { console.error(`No test files found under ${target}`); process.exit(1); }

const realVitest = existsSync(join(root, "node_modules", "vitest", "package.json"));
if (realVitest) {
  const r = spawnSync("npx", ["vitest", "run", ...files], { stdio: "inherit", cwd: root });
  process.exit(r.status ?? 1);
}
const hook = join(root, "tools", "vitest-shim", "register.mjs");
const r = spawnSync(process.execPath, ["--import", "tsx", "--import", hook, "--test", ...files], { stdio: "inherit", cwd: root });
process.exit(r.status ?? 1);
