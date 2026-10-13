# Estado dos requisitos

Estados: ✔ testado · ◐ parcial · ✘ não feito.

| Requisito | Estado | Observação |
|---|---|---|
| Modelo, ids, validação, normalização | ✔ | |
| Operações de texto/bloco/lista/tabela/imagem/página | ◐ | Divisão/mescla em parágrafos, citações, células de tabela e itens de lista; mesclagem de células e inserção estrutural genérica ainda pendentes |
| Marcas em seleção multi-bloco | ◐ | Formatação e links do editor web usam comandos TypeScript em transação; comando de alto nível unificado e cobertura de todos os contêineres ainda pendentes |
| Transações atômicas, eventos, ciclo de vida | ✔ | Faltam eventos `transactionCommitted` e `migrationExecuted` |
| Seleção e mapeamento | ✔ | |
| Undo/redo, agrupamento, limite | ✔ | Snapshots |
| `.nsx` leitura/escrita/limites/versões | ✔ | Sem migração real (só v1) |
| Recursos (imagens embutidas) | ✔ | Sem magic bytes |
| Layout/paginação automática | ✘ | Só `pageConfig` |
| Importar HTML sanitizado / Markdown / DOCX | ◐ | Colagem HTML sanitizada em seleção de parágrafo/título de nível superior, inclusive entre vários parágrafos, preserva blocos, marcas inline e imagens embutidas via comando do motor; Markdown/DOCX nativos e colagem em contêineres aninhados ainda pendentes |
| Exportar HTML/Markdown | ◐ | Adaptador web renderiza HTML; exportadores HTML/Markdown puros no pacote do motor ainda pendentes |
| Preview (editor, inspetor, diagnóstico, abrir/salvar, fixtures) | ✔ | Chromium headless; sem IME real |
| Electron / Android / iOS | ✘ | Só contratos |
| ESLint, vitest real, medição de cobertura | ◐ | CI executa typecheck, build e Vitest de frontend, motor e preview; lint e relatório de cobertura ainda pendentes |
| Integração com Korczak Nexus / repositório remoto | — | Fora do escopo desta etapa |


## Integração do editor web (13/10/2026)

- Formatação inline, cores, fontes, hiperlinks, limpar formatação, desfazer/refazer, edição de texto e operações estruturais suportadas são encaminhadas ao motor TypeScript.
- Colagem HTML no editor: o adaptador remove elementos ativos, atributos de evento e URLs não seguras; o comando TypeScript `insertImportedBlocksAtSelection` insere parágrafos, títulos, listas, tabelas, citações, separadores e imagens embutidas com IDs/recursos regenerados. O suporte cobre seleção dentro de um parágrafo/título de nível superior e seleção entre vários parágrafos/títulos consecutivos; colagem em contêineres aninhados ou seleções que atravessem tabelas/listas/citações ainda cai no caminho de texto simples.
- As verificações do workflow `Nexus Engine Frontend Integration` agora executam `npm run build && npm test` no frontend, além de typecheck/test/build do motor e preview.
- Ainda não declarar integração completa: permanecem caminhos nativos do navegador para algumas ferramentas visuais sem representação no modelo, paginação/layout no motor, importação/exportação de formatos, mesclagem de células, migrações de schema e hosts Electron/Android/iOS.
