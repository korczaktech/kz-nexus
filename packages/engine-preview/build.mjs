// Bundles the preview (browser, IIFE) and copies static assets into dist/.
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEsbuild } from "../../scripts/esbuild-loader.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
const esbuild = loadEsbuild();
await esbuild.build({
  entryPoints: [resolve(here, "src/main.ts")],
  outfile: resolve(dist, "app.js"),
  bundle: true, format: "iife", platform: "browser", target: "es2022", sourcemap: true, minify: false, legalComments: "none",
});
copyFileSync(resolve(here, "src/styles/app.css"), resolve(dist, "app.css"));
copyFileSync(resolve(here, "index.html"), resolve(dist, "index.html"));
// Single-file variant (CSS + JS inlined) for hosting as one page.
import { readFileSync, writeFileSync } from "node:fs";
const css = readFileSync(resolve(dist, "app.css"), "utf8");
const js = readFileSync(resolve(dist, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script");
const html = readFileSync(resolve(here, "index.html"), "utf8")
  .replace('<link rel="stylesheet" href="./app.css" />', () => `<style>${css}</style>`)
  .replace('<script src="./app.js"></script>', () => `<script>${js}</script>`);
writeFileSync(resolve(dist, "preview-standalone.html"), html);
console.log("preview build ok -> packages/engine-preview/dist");
