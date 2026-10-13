# Decisões

1. **TypeScript strict + ES2022 sem DOM/Node typings** no motor (`lib: ["ES2022"]`, `types: []`); só `TextEncoder`/`structuredClone` declarados em `globals.d.ts`.
2. **Modelo imutável e congelado** (deepFreeze) em vez de proxies ou cópias totais por operação.
3. **Comandos puros** `(doc, ctx) => Result`; ids injetados (`IdGenerator`), relógio injetado (`Clock`) → testes determinísticos.
4. **Histórico por snapshots** (simplicidade; limite 200).
5. **`.nsx` = JSON UTF-8 versionado**; sem compressão/cripto (nada a justificar ainda).
6. **Preview em TypeScript + DOM puro** (sem React): `@types/react`/Vite não estavam disponíveis offline; o prompt permite React, não exige.
7. **Build com esbuild** (bundle ESM do motor + `tsc --emitDeclarationOnly`) para o pacote ser importável em Node ESM puro sem extensões `.js` nos imports.
8. **Teste/lint offline**: shim de vitest sobre `node:test` e lint próprio (ver TESTING.md). Declarado, não escondido.
9. **Sem `console` no núcleo**: falha de listener é reportada via `onListenerError`.
10. **Run coalescing** nos comandos de edição (defeito achado no E2E).
11. **`LIMIT_EXCEEDED` preservado** na leitura em vez de virar `CORRUPTED_CONTENT`.
12. **Preview nunca afirma "salvo"**: só "gerado e entregue ao navegador para download" após o disparo real do download.
