// Regenerates fixtures/ from the preview's fixture builders (which use only the engine's public API).
// Run with: node --import tsx scripts/generate-fixtures.mjs
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { saveNsx, openNsx } from "@korczak/nexus-engine";
import { FIXTURES } from "../packages/engine-preview/src/fixtures/builtin.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const d of ["valid", "invalid"]) { rmSync(resolve(root, "fixtures", d), { recursive: true, force: true }); mkdirSync(resolve(root, "fixtures", d), { recursive: true }); }
mkdirSync(resolve(root, "fixtures/migrations"), { recursive: true });

const expectations = {};
for (const f of FIXTURES) {
  if (f.id === "large") continue;
  if (f.kind === "document") {
    const saved = saveNsx(f.build());
    if (!saved.ok) throw new Error(`cannot serialize ${f.id}: ${saved.error.message}`);
    writeFileSync(resolve(root, "fixtures/valid", `${f.id}.nsx`), saved.value + "\n");
  } else {
    const text = f.build();
    const opened = openNsx(text);
    if (opened.ok) throw new Error(`invalid fixture ${f.id} was unexpectedly accepted`);
    writeFileSync(resolve(root, "fixtures/invalid", `${f.id.replace(/^bad-/, "")}.nsx`), text + "\n");
    expectations[`${f.id.replace(/^bad-/, "")}.nsx`] = opened.error.code;
  }
}
writeFileSync(resolve(root, "fixtures/invalid/expectations.json"), JSON.stringify(expectations, null, 2) + "\n");
console.log("fixtures written:", Object.keys(expectations).length, "invalid +", FIXTURES.filter((f) => f.kind === "document" && f.id !== "large").length, "valid");
