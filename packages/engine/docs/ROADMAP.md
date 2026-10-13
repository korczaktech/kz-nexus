# Estado dos requisitos

Estados: ✔ testado · ◐ parcial · ✘ não feito.

| Requisito | Estado | Observação |
|---|---|---|
| Modelo, ids, validação, normalização | ✔ | |
| Operações de texto/bloco/lista/tabela/imagem/página | ✔ | Divisão/mescla só em blocos de nível superior; sem mesclagem de células |
| Marcas em seleção multi-bloco | ◐ | Feita no controlador do preview (uma transação), não como comando único do motor |
| Transações atômicas, eventos, ciclo de vida | ✔ | Faltam eventos `transactionCommitted` e `migrationExecuted` |
| Seleção e mapeamento | ✔ | |
| Undo/redo, agrupamento, limite | ✔ | Snapshots |
| `.nsx` leitura/escrita/limites/versões | ✔ | Sem migração real (só v1) |
| Recursos (imagens embutidas) | ✔ | Sem magic bytes |
| Layout/paginação automática | ✘ | Só `pageConfig` |
| Importar HTML sanitizado / Markdown / DOCX | ✘ | Só texto simples |
| Exportar HTML/Markdown | ✘ | Só texto simples |
| Preview (editor, inspetor, diagnóstico, abrir/salvar, fixtures) | ✔ | Chromium headless; sem IME real |
| Electron / Android / iOS | ✘ | Só contratos |
| ESLint, vitest real, medição de cobertura | ✘ | Indisponíveis offline |
| Integração com Korczak Nexus / repositório remoto | — | Fora do escopo desta etapa |
