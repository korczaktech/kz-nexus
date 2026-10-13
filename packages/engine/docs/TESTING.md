# Testes

Comandos (raiz): `npm run typecheck | lint | test | test:integration | test:nsx | test:architecture | build | verify`; E2E: `node scripts/e2e-preview.mjs` (requer Playwright + Chromium); benchmarks: `node scripts/bench.mjs`.

Ambiente de construção **offline**: `vitest` e `eslint` não puderam ser instalados. `package.json` declara vitest; `scripts/run-tests.mjs` usa vitest real quando instalado e, senão, `tools/vitest-shim` (API compatível mínima sobre `node:test`). Lint é um script próprio (`scripts/lint.mjs`), **não** ESLint. Cobertura de código **não foi medida** (sem ferramenta); a cobertura é descrita por testes, não por porcentagem.

Suítes: modelo/validação/normalização/ids, comandos, transações (atomicidade, rollback), seleção/mapeamento, histórico, `.nsx` (round-trip, versões, limites, malformados, Unicode), recursos, editor/eventos, API pública, propriedades com 25 sementes × 60 operações (validate/serialize não mutam, normalize idempotente, round-trip, undo/redo caminho completo, transação rejeitada não muda estado), regressões, integração do preview (controlador + motor) e E2E no navegador.
