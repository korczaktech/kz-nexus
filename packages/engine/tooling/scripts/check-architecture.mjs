// Architectural boundary checks (Sections 4.3, 15.1, 23.3).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// 1. Core must not touch platform globals.
const FORBIDDEN = [
  [/\bwindow\b/, "window"], [/(?<![\w.$])document\.(?:body|getElementById|createElement|querySelector|cookie|addEventListener)/, "document (DOM)"], [/\bHTMLElement\b/, "HTMLElement"], [/\bnavigator\b/, "navigator"],
  [/\blocalStorage\b/, "localStorage"], [/\bsessionStorage\b/, "sessionStorage"], [/\bconsole\./, "console"],
  [/from\s+["']node:/, "node: import"], [/from\s+["'](electron|@capacitor\/[^"']+|react|react-dom)["']/, "platform/UI import"],
  [/\beval\s*\(/, "eval"], [/new Function\s*\(/, "new Function"], [/\brequire\s*\(/, "require"], [/\bprocess\./, "process"],
];
const engineSrc = join(root, "packages/engine/src");
for (const file of walk(engineSrc, [".ts"])) {
  if (file.endsWith(".d.ts") || file.endsWith(".test.ts")) continue;
  const text = strip(readFileSync(file, "utf8"));
  for (const [re, label] of FORBIDDEN) if (re.test(text)) problems.push(`core uses forbidden API (${label}): ${relative(root, file)}`);
}

// 2. Engine must not import the preview; no relative escapes out of the package.
for (const file of walk(join(root, "packages/engine"), [".ts"])) {
  const text = readFileSync(file, "utf8");
  if (/engine-preview/.test(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))) problems.push(`engine references preview: ${relative(root, file)}`);
}

// 3. Preview may import the engine ONLY via its package name.
const previewDir = join(root, "packages/engine-preview");
// Applies to the app code (src/) and its tests; build tooling (build.mjs, serve.mjs) may use shared repo scripts.
for (const file of [...walk(join(previewDir, "src"), [".ts", ".tsx"]), ...walk(join(previewDir, "tests"), [".ts", ".tsx"])]) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
    const spec = m[1] ?? m[2];
    if (spec.startsWith(".")) {
      const target = resolve(dirname(file), spec);
      if (!target.startsWith(previewDir)) problems.push(`preview escapes its package via relative import "${spec}": ${relative(root, file)}`);
    }
    if (/^@korczak\/nexus-engine\/.+/.test(spec) || /packages\/engine\//.test(spec) || /\/engine\/src/.test(spec)) {
      problems.push(`preview imports engine internals "${spec}": ${relative(root, file)}`);
    }
  }
}

// 4. Circular dependencies between engine top-level modules (direct-import graph).
const graph = new Map();
for (const file of walk(engineSrc, [".ts"])) {
  if (file.endsWith(".test.ts") || file.endsWith(".d.ts")) continue;
  const mod = relative(engineSrc, file).split("/")[0].replace(/\.ts$/, "");
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/from\s+["'](\.[^"']*)["']/g)) {
    const target = relative(engineSrc, resolve(dirname(file), m[1])).split("/")[0].replace(/\.ts$/, "");
    if (target !== mod && target !== "..") { if (!graph.has(mod)) graph.set(mod, new Set()); graph.get(mod).add(target); }
  }
}
graph.delete("index");
const visiting = new Set(), done = new Set();
function dfs(n, stack) {
  if (done.has(n)) return;
  if (visiting.has(n)) { problems.push(`circular module dependency: ${[...stack, n].join(" -> ")}`); return; }
  visiting.add(n);
  for (const next of graph.get(n) ?? []) dfs(next, [...stack, n]);
  visiting.delete(n); done.add(n);
}
for (const n of graph.keys()) dfs(n, []);

if (problems.length) { console.error("Architecture check FAILED:\n - " + problems.join("\n - ")); process.exit(1); }
console.log(`Architecture check passed (${[...graph.keys()].length} engine modules, 4 rule groups).`);
