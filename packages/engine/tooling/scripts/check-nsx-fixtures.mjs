// Opens every fixture with the built engine and checks the documented outcome.
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openNsx, saveNsx, validateDocument, DEFAULT_LIMITS } from "@korczak/nexus-engine";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (msg) => { failures += 1; console.error("FAIL  " + msg); };

for (const name of readdirSync(resolve(root, "fixtures/valid")).filter((n) => n.endsWith(".nsx"))) {
  const text = readFileSync(resolve(root, "fixtures/valid", name), "utf8");
  const opened = openNsx(text);
  if (!opened.ok) { fail(`valid/${name} was rejected: ${opened.error.code} ${opened.error.message}`); continue; }
  if (!validateDocument(opened.value).ok) fail(`valid/${name} opened but is not valid`);
  const again = saveNsx(opened.value);
  if (!again.ok) { fail(`valid/${name} could not be re-saved`); continue; }
  const reopened = openNsx(again.value);
  if (!reopened.ok || JSON.stringify(reopened.value) !== JSON.stringify(opened.value)) fail(`valid/${name} round-trip changed the document`);
  else console.log(`PASS  valid/${name}`);
}

const expectations = JSON.parse(readFileSync(resolve(root, "fixtures/invalid/expectations.json"), "utf8"));
for (const [name, code] of Object.entries(expectations)) {
  const opened = openNsx(readFileSync(resolve(root, "fixtures/invalid", name), "utf8"));
  if (opened.ok) fail(`invalid/${name} was accepted`);
  else if (opened.error.code !== code) fail(`invalid/${name}: expected ${code}, got ${opened.error.code}`);
  else console.log(`PASS  invalid/${name} -> ${code}`);
}

// Security limits are enforced on untrusted input.
const big = readFileSync(resolve(root, "fixtures/valid/structures.nsx"), "utf8");
const limited = openNsx(big, { limits: { ...DEFAULT_LIMITS, maxDocumentBytes: 100 } });
if (limited.ok || limited.error.code !== "LIMIT_EXCEEDED") fail("maxDocumentBytes limit not enforced"); else console.log("PASS  limit maxDocumentBytes -> LIMIT_EXCEEDED");
const nodes = openNsx(big, { limits: { ...DEFAULT_LIMITS, maxNodes: 3 } });
if (nodes.ok || nodes.error.code !== "LIMIT_EXCEEDED") fail("maxNodes limit not enforced with LIMIT_EXCEEDED"); else console.log("PASS  limit maxNodes -> LIMIT_EXCEEDED");
const deep = JSON.stringify({ format: "korczak-nexus", formatVersion: 1, document: JSON.parse(big).document });
let nested = '{"a":'.repeat(5000) + "1" + "}".repeat(5000);
const deepRes = openNsx(nested);
if (deepRes.ok) fail("deeply nested JSON was accepted"); else console.log(`PASS  deeply nested JSON -> ${deepRes.error.code}`);
void deep;

if (failures) { console.error(`\n${failures} fixture check(s) failed`); process.exit(1); }
console.log("\nAll .nsx fixture checks passed");
