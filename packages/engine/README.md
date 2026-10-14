# Korczak Nexus Engine

Motor próprio de documentos (TypeScript, headless) com formato nativo **`.nsx`**, mais um app de **preview** independente.

- `packages/engine` — biblioteca `@korczak/nexus-engine` (modelo canônico, comandos, transações, seleção, histórico, `.nsx`).
- `packages/engine-preview` — app que consome o motor só pela API pública.
- `docs/` — documentação técnica · `fixtures/` — arquivos `.nsx` válidos/ inválidos · `examples/` — usos headless.

## Requisitos
Node 20+ (testado em 22), TypeScript, tsx. Em ambiente com rede: `npm install` (vitest/typescript/tsx fixados no `package.json`). Em ambiente offline, os links de workspace em `node_modules/@korczak/*` precisam existir (veja `docs/TESTING.md`).

## Comandos
```
node scripts/verify-build.mjs        # pipeline completo
npm run build                         # motor + preview
node packages/engine-preview/serve.mjs   # preview em http://localhost:5173 (após o build)
node scripts/e2e-preview.mjs          # E2E em Chromium (Playwright)
```
Também: `npm run typecheck | lint | test | test:integration | test:nsx | test:architecture`.

## API básica
```ts
import { createEditor, insertText, saveNsx, openNsx } from "@korczak/nexus-engine";
const editor = createEditor();
const id = editor.getDocument().content[0]!.id;
editor.exec([insertText({ blockId: id, offset: 0, text: "Olá" })]);
const saved = saveNsx(editor.getDocument());           // Result<string>
```

## Estado
Veja `docs/ROADMAP.md` e `docs/PROGRESS.md`. O motor está integrado ao editor web no repositório `korczaktech/kz-nexus`; confira a matriz de requisitos para os recursos ainda parciais.
