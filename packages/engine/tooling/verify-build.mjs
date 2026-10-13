// Full verification pipeline (Section 17). Every step really runs; the exit code reflects the real results.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;
const tsc = join(root, "node_modules/typescript/bin/tsc");
const results = [];

function step(name, cmd, args, { optional = false, parse } = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const ok = r.status === 0;
  const status = ok ? "PASS" : optional && r.status === 2 ? "SKIP" : "FAIL";
  const detail = parse ? parse(out) : "";
  results.push({ name, status, ms: Date.now() - started, detail });
  console.log(`${status.padEnd(4)} ${name}${detail ? "  — " + detail : ""}`);
  if (status === "FAIL") console.log(out.split("\n").slice(-25).join("\n"));
  return ok;
}
const tests = (out) => { const m = out.match(/# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)/); return m ? `${m[2]}/${m[1]} passed, ${m[3]} failed` : ""; };

step("dependencies: workspace links", node, ["-e", `
const fs=require("fs");for(const p of ["node_modules/@korczak/nexus-engine","node_modules/@korczak/nexus-engine-preview","node_modules/typescript","node_modules/tsx"])if(!fs.existsSync(p)){console.error("missing "+p);process.exit(1)}`]);
step("typecheck: engine (strict, no DOM/Node typings)", node, [tsc, "-p", "packages/engine/tsconfig.json", "--noEmit"]);
step("lint", node, ["scripts/lint.mjs"], { parse: (o) => o.trim() });
step("architecture", node, ["scripts/check-architecture.mjs"], { parse: (o) => o.trim() });
step("unit tests: engine", node, ["scripts/run-tests.mjs", "packages/engine"], { parse: tests });
step("build: engine", node, ["packages/engine/build.mjs"]);
step("typecheck: preview (strict)", node, [tsc, "-p", "packages/engine-preview/tsconfig.json", "--noEmit"]);
step(".nsx fixtures", node, ["scripts/check-nsx-fixtures.mjs"], { parse: (o) => o.trim().split("\n").pop() });
step("integration tests: preview", node, ["scripts/run-tests.mjs", "packages/engine-preview"], { parse: tests });
step("build: preview", node, ["packages/engine-preview/build.mjs"]);
for (const f of readdirSync(join(root, "examples")).filter((n) => n.endsWith(".ts"))) step(`example: ${f}`, node, ["--import", "tsx", `examples/${f}`]);
step("e2e: preview in headless Chromium", node, ["scripts/e2e-preview.mjs"], { optional: true, parse: (o) => (o.match(/E2E: .*/) ?? [""])[0] });

// Artifact check
const artifacts = ["packages/engine/dist/index.js", "packages/engine/dist/index.d.ts", "packages/engine-preview/dist/index.html", "packages/engine-preview/dist/app.js", "packages/engine-preview/dist/app.css"];
const missing = artifacts.filter((a) => !existsSync(join(root, a)) || statSync(join(root, a)).size === 0);
const bundle = existsSync(join(root, "packages/engine/dist/index.js")) ? readFileSync(join(root, "packages/engine/dist/index.js"), "utf8") : "";
const leaks = ["react", "electron", "localStorage", "sessionStorage"].filter((w) => new RegExp(`\\b${w}\\b`).test(bundle));
const okArtifacts = missing.length === 0 && leaks.length === 0;
results.push({ name: "artifacts", status: okArtifacts ? "PASS" : "FAIL", ms: 0, detail: okArtifacts ? "dist files present; engine bundle free of UI/platform references" : `missing: ${missing} leaks: ${leaks}` });
console.log(`${okArtifacts ? "PASS" : "FAIL"} artifacts  — ${results.at(-1).detail}`);

const failed = results.filter((r) => r.status === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} steps passed (${results.filter((r) => r.status === "SKIP").length} skipped)`);
process.exit(failed.length ? 1 : 0);
