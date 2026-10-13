// Project lint. ESLint could not be installed in the offline build sandbox, so this script enforces the
// rules the master prompt cares about. TypeScript strict mode (npm run typecheck) covers the rest.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", "dist", "coverage", ".git"]);
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}
const RULES = [
  [/@ts-ignore|@ts-nocheck|@ts-expect-error/, "no TypeScript suppression comments"],
  [/\b(TODO|FIXME|XXX)\b/, "no TODO/FIXME markers left in code"],
  [/\bdebugger\b/, "no debugger statements"],
  [/:\s*any\b|\bas any\b|<any>/, "no explicit any"],
  [/\beval\s*\(|new Function\s*\(/, "no eval / new Function"],
  [/\.only\s*\(|\bxit\s*\(|\bxdescribe\s*\(|\bit\.skip\s*\(|\bdescribe\.skip\s*\(/, "no focused or skipped tests"],
  [/throw new Error\(["']not implemented/i, "no 'not implemented' stubs"],
];
const files = ["packages", "scripts", "examples", "tools"].flatMap((d) => { try { return walk(join(root, d)); } catch { return []; } });
const problems = [];
for (const file of files) {
  if (file.endsWith("scripts/lint.mjs")) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const [re, label] of RULES) if (re.test(line)) problems.push(`${relative(root, file)}:${i + 1}  ${label}`);
    if (/\s+$/.test(line)) problems.push(`${relative(root, file)}:${i + 1}  trailing whitespace`);
  });
}
// Engine/preview strictness flags must stay on.
const base = readFileSync(join(root, "tsconfig.base.json"), "utf8");
if (!/"strict":\s*true/.test(base)) problems.push("tsconfig.base.json: strict mode must be enabled");
if (problems.length) { console.error(`Lint FAILED (${problems.length}):\n` + problems.slice(0, 80).join("\n")); process.exit(1); }
console.log(`Lint passed (${files.length} files, ${RULES.length + 2} rules).`);
