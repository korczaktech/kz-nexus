import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");

test("fase 1: arquivos principais existem",()=>{
  for(const file of ["src/main.js","src/preload.js","src/renderer.html","src/renderer.js","src/renderer.css","src/editor-model.js"]) assert.equal(fs.existsSync(path.join(root,file)),true,file);
});
test("fase 1: renderer permanece sem Node integration",()=>{
  const main=fs.readFileSync(path.join(root,"src/main.js"),"utf8");
  assert.match(main,/contextIsolation:true/); assert.match(main,/sandbox:true/); assert.match(main,/nodeIntegration:false/);
});
test("fase 1: CSP e hardening existem",()=>{
  const html=fs.readFileSync(path.join(root,"src/renderer.html"),"utf8"), main=fs.readFileSync(path.join(root,"src/main.js"),"utf8");
  assert.match(html,/object-src 'none'/); assert.match(html,/base-uri 'self'/); assert.match(main,/setWindowOpenHandler/); assert.match(main,/will-navigate/);
});
test("fase 1: editor possui canvas, ribbon, atalhos e modos",()=>{
  const renderer=fs.readFileSync(path.join(root,"src/renderer.js"),"utf8");
  for(const token of ["editor-shell","editor-page","ribbonContent","editorKeydown","editorPaste","contextRibbon","continuous-mode","focus-mode","saveEditor"]) assert.equal(renderer.includes(token),true,token);
});
test("fase 1: modelo estruturado é importável",async()=>{
  const model=await import(path.join(root,"src/editor-model.js")+"?test="+Date.now());
  const doc=model.createDocumentModel({name:"Teste",content:"<p>Olá</p>"});
  assert.equal(doc.name,"Teste"); assert.equal(doc.content.html,"<p>Olá</p>"); assert.equal(model.serializeDocumentModel(doc),"<p>Olá</p>");
});
