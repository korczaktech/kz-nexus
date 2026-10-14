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
| Importar HTML sanitizado / Markdown / DOCX | ◐ | Colagem HTML sanitizada e importador Markdown de subconjunto estão no motor TypeScript; importação DOCX nativa e colagem em contêineres aninhados ainda pendentes |
| Exportar HTML/Markdown | ◐ | Exportadores HTML e Markdown puros estão no motor TypeScript; a exportação Markdown web usa o motor, mas importação Markdown nativa e round-trip completo ainda pendentes |
| Preview (editor, inspetor, diagnóstico, abrir/salvar, fixtures) | ✔ | Chromium headless; sem IME real |
| Electron / Android / iOS | ✘ | Só contratos |
| ESLint, vitest real, medição de cobertura | ◐ | CI executa typecheck, build e Vitest de frontend, motor e preview; lint e relatório de cobertura ainda pendentes |
| Integração com Korczak Nexus / repositório remoto | — | Fora do escopo desta etapa |


## Integração do editor web (13/10/2026)

- Formatação inline, cores, fontes, hiperlinks seguros, limpar formatação, pincel de formatação, espaçamento antes/depois, entrelinhas, borda/preenchimento de parágrafo, desfazer/refazer, edição de texto, localizar/substituir e colagem HTML estrutural suportada são encaminhadas ao motor TypeScript. O estado dos botões de formatação também é derivado da seleção e das marcas do motor. O fallback genérico de `execCommand` foi removido: comandos sem integração explícita não alteram o documento.
- Colagem HTML no editor: o adaptador remove elementos ativos, atributos de evento e URLs não seguras; o comando TypeScript `insertImportedBlocksAtSelection` insere parágrafos, títulos, listas, tabelas, citações, separadores e imagens embutidas com IDs/recursos regenerados. O suporte cobre seleção dentro de um parágrafo/título de nível superior e seleção entre vários parágrafos/títulos consecutivos; colagem em contêineres aninhados ou seleções que atravessem tabelas/listas/citações ainda cai no caminho de texto simples.
- Importação de arquivos `.md`/`.markdown` e exportação `.md` passam por APIs do motor TypeScript. O importador suporta títulos, parágrafos, marcas inline, links seguros, listas simples, tabelas simples, citações, separadores e imagens data URI; sintaxes avançadas de Markdown continuam fora do subconjunto.
- As verificações do workflow `Nexus Engine Frontend Integration` agora executam `npm run build && npm test` no frontend, além de typecheck/test/build do motor e preview.
- Ainda não declarar integração completa: permanecem caminhos nativos do navegador para ferramentas visuais sem representação no modelo (formas, caixas de texto, gráficos, notas e sumário), paginação/layout no motor, importação/exportação de formatos como DOCX, colagem estrutural em contêineres aninhados (há fallback de texto simples), mesclagem de células, migrações de schema e hosts Electron/Android/iOS.
