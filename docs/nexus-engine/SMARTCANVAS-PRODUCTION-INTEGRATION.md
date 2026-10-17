# SmartCanvas — mapa de integração do editor de produção

Data da análise: 2026-10-15  
Escopo: inspeção estática de `frontend/src/components/Editor.tsx`, `frontend/src/services/nexusEngineAdapter.ts`, `frontend/src/components/PagedPreview.tsx` e `frontend/src/components/CanvasDocumentRenderer.tsx`. Nenhuma edição de produção foi migrada neste documento.

## Conclusão executiva

O editor React já instancia um `createEditor()` por componente e executa vários comandos no motor Nexus, mas a integração ainda é híbrida: a seleção visual do navegador é convertida para posições lógicas pelo adaptador; parte do conteúdo HTML é sincronizada para o modelo; o DOM paginado é reescrito a partir do modelo; e vários comandos de interface ainda operam com `Range`/seleção DOM. Portanto, não é seguro trocar a superfície inteira de uma vez.

A migração recomendada é por fatias verticais, mantendo o motor como única fonte de verdade e preservando o HTML/DOM como projeção temporária. O primeiro alvo deve ser um contrato de host/seleção/input testável e ativado por flag, não uma reescrita do renderer Canvas nem a remoção imediata do adaptador atual.

## Caminho atual observado

### 1. Modelo e comandos

- `Editor.tsx` cria `nexusEngineRef` com `createEditor({ document: ... })` e reutiliza essa instância.
- `commitEngineCommands(...)` executa comandos pelo motor, gera HTML via `htmlFromNexusDocument()`, escreve a projeção no editor, marca o documento como alterado e restaura a seleção DOM.
- O arquivo importa comandos e tipos diretamente de `packages/engine/src/index`, além de funções de persistência .nsx.
- `nexusEngineAdapter.ts` contém conversão HTML↔documento, leitura do contexto DOM, mapeamento de seleção e sincronização para o modelo.

### 2. Seleção e entrada

- O adaptador `getEngineDomContext()` lê `window.getSelection()`, valida se os extremos estão dentro de corpos editáveis e mapeia os extremos para blocos e offsets.
- `engineContext()` usa esse mapeamento e define a seleção lógica no motor antes de comandos que dependem do cursor.
- `restoreEngineDomSelection()` projeta a seleção lógica de volta no navegador.
- `lastDomRangeRef` guarda uma seleção DOM para recuperação quando a seleção atual não pode ser mapeada; `layoutRangeRef` é usado separadamente para cabeçalho/rodapé.
- `handleEditorInput()` restaura a projeção canônica do motor quando chega uma entrada que não foi traduzida em comando. A composição IME segue um caminho separado em `handleCompositionEnd()`, que sincroniza HTML depois do evento final.
- Há operações que usam `execCommand` para formatação do cabeçalho/rodapé ou fallback de clipboard. Elas precisam ser isoladas do corpo principal, não removidas em bloco sem testes.

### 3. DOM e paginação

- O editor divide o documento em elementos `.editor-page` e superfícies `.rich-editor`; `writeEditorHtml()` e `paginateEditor()` atualizam essa projeção.
- Cabeçalho e rodapé têm ciclo de edição próprio com `contentEditable`, seleção DOM e tratamento de Escape/Enter/blur.
- `PagedPreview.tsx` calcula layout nativo usando `layoutDocument()` e métricas de texto via Canvas 2D, com fallback/alternativa Paged.js.
- `CanvasDocumentRenderer.tsx` desenha páginas de preview em Canvas 2D; não é a superfície editável do corpo. Ele carrega imagens usadas na página e escala o canvas de acordo com `devicePixelRatio`.
- A edição de produção não deve ser substituída por esse Canvas de preview: são responsabilidades diferentes.

## Fronteiras propostas para a integração

| Área | Estado atual | Contrato SmartCanvas proposto | Regra de migração |
|---|---|---|---|
| Modelo | `createEditor()` no componente React | `NexusDocument` + comandos do motor | Não duplicar estado nem histórico |
| Host | Componente React contém eventos, páginas e comandos | Host React fino + superfície SmartCanvas | Extrair por etapas; preservar UI e acessibilidade |
| Seleção | Seleção do navegador mapeada por adaptador | `Selection` lógica como estado durável | DOM Range apenas como adaptador/fallback transitório |
| Input | Handlers no editor, caminhos especiais para IME e input | Adaptador de input semântico | Cobrir teclado, beforeinput, IME e clipboard antes de ativar |
| Renderer de edição | HTML DOM paginado | Renderer intercambiável com projeção do modelo | Começar com DOM; Canvas não é requisito |
| Preview | Layout nativo + Paged.js; Canvas renderer para páginas | Subsistema de preview independente | Não misturar com o renderer de edição |
| Persistência | .nsx, drafts, autosave e API integrados ao componente | Adapter de persistência fora do caminho de cada tecla | Preservar recuperação de rascunho e conflito de versão |
| Cabeçalho/rodapé | Áreas editáveis separadas e metadados de layout | Editor auxiliar separado da seleção do corpo | Não mapear seleção de cabeçalho/rodapé para parágrafo do corpo |

## Plano de migração segura

### Etapa A — instrumentação sem alteração de comportamento
1. Adicionar interfaces/adaptadores em torno de seleção e input, sem mudar o caminho atual.
2. Registrar eventos não mapeados e falhas de conversão em modo de desenvolvimento, sem persistir HTML divergente do motor.
3. Criar testes de contrato para seleção lógica, foco, edição por teclado, desfazer/refazer, IME e clipboard.
4. Adicionar flag de desenvolvimento para habilitar o host novo em uma sessão de teste.

### Etapa B — primeira fatia do corpo do documento
1. Migrar seleção lógica e restauração para um adapter explícito.
2. Migrar inserção e exclusão de texto para comandos do motor.
3. Preservar IME com composição isolada; não interromper a composição re-renderizando a cada evento intermediário.
4. Só ativar por flag depois dos testes de teclado, seleção cruzada entre páginas e histórico.

### Etapa C — recursos e comandos estruturais
Migrar formatação, listas, tabelas, imagens, objetos, links, clipboard rico, importação/exportação e seleção em blocos aninhados. Manter os caminhos especiais de cabeçalho/rodapé separados.

### Etapa D — paginação e validação
Comparar documentos iguais no layout nativo e no Paged.js; validar seleção em fronteiras de página, impressão, acessibilidade, autosave, recuperação de rascunho e conflitos.

### Etapa E — otimização (por último)
Só após equivalência funcional e medições comparáveis, avaliar virtualização, cache de layout, recursos de imagem e heap. Não introduzir otimizações de RAM durante a migração funcional.

## Critérios de aceitação antes de ativar por padrão

- [ ] Nenhuma divergência entre documento do motor e documento salvo após operações suportadas.
- [ ] Teclado, seleção por mouse/teclado e seleção entre páginas preservados.
- [ ] IME/composição testada pelo menos em Chromium e navegador alvo.
- [ ] Undo/redo consistente para digitação, formatação, estrutura e colagem.
- [ ] Clipboard simples e rico sem perda silenciosa.
- [ ] Tabelas, listas, imagens, objetos, links e importação/exportação cobertos.
- [ ] Cabeçalho/rodapé não contaminam seleção ou conteúdo do corpo.
- [ ] Autosave, recuperação de rascunho, leitura .nsx e tratamento de conflito continuam passando.
- [ ] Build, typecheck, testes unitários e testes de integração verdes.

## Limites desta análise

Este mapa foi produzido por inspeção do código e não comprova comportamento de todos os caminhos em execução. A implementação inicial criou `frontend/src/components/editorSmartCanvas.ts` como fronteira explícita de seleção e input e integrou `engineContext()` de `Editor.tsx` a essa fronteira quando a flag `?smartCanvas=1` está presente. A flag fica desligada por padrão; nesse caso, o caminho legado permanece em uso. O adaptador ainda delega a conversão à implementação DOM existente, instrumentando leituras e restaurações apenas quando ativado. Isso é uma etapa de extração de fronteira, não uma substituição da seleção nativa nem uma migração completa de entrada de texto.


## Implementação incremental iniciada — 2026-10-15

- Criado `frontend/src/components/editorSmartCanvas.ts` com gate de ativação, fronteira para leitura/restauração da seleção e contadores de diagnóstico em memória.
- `Editor.tsx` encaminha o mapeamento de seleção de `engineContext()` pelo novo contrato quando `?smartCanvas=1`; sem esse parâmetro, usa diretamente os adaptadores anteriores.
- Criados testes para a flag (padrão desligado) e isolamento dos contadores.
- Ainda não migrados: `beforeinput`, digitação/deleção, composição IME, clipboard, histórico, renderer DOM e paginação. O contrato atual continua usando o adaptador DOM existente de propósito.


## Incremento seguinte — fronteira de entrada de texto

- Com `?smartCanvas=1`, o evento `beforeinput` agora passa por `dispatchSmartCanvasBeforeInput()` antes de chegar ao handler de comandos já existente. Sem a flag, o despacho legado continua direto.
- O adaptador registra em memória a quantidade de eventos `beforeinput` e quantos coincidem com um estado/evento de composição IME. Ele não chama `preventDefault()`, não altera texto e não declara uma operação bem-sucedida; a decisão continua no handler, que converte operações conhecidas em comandos do motor Nexus.
- Testes verificam o encaminhamento do evento, a preservação do evento de composição e os contadores. A mudança é uma extração explícita de fronteira/instrumentação, não uma nova implementação de digitação ou IME.
- Validação de testes/build frontend concluída no CI para o incremento de 2026-10-16; a seleção rica entre blocos de texto de topo e o ciclo de composição IME têm testes de componente. Próxima fatia: fallback para estruturas aninhadas, composição IME em navegador real e fluxo end-to-end com API.

## Atualização após a regressão automatizada — 2026-10-16

A implementação e os testes avançaram desde o mapa inicial:

- O SmartCanvas envia edições canônicas ao callback do editor e agora força a marcação de dirty + reagendamento do autosave mesmo quando a projeção HTML permanece igual.
- O controlador de preview cobre entrada de texto, undo/redo, IME testado em ambiente de componente, edição de células, marca pendente em célula vazia, adição de linha por Tab, propriedades/exclusão de imagens, exclusão de objetos semânticos, colagem HTML sanitizada em células com múltiplos parágrafos e colagem rica sobre seleções entre blocos de texto de topo, com undo estrutural.
- Os testes de round-trip verificam conteúdo rico no formato nativo .nsx e HTML; o CI executa testes, typecheck e builds do motor, preview e frontend. A baseline Chromium do motor e do editor React também foi executada três vezes e registrada em `docs/nexus-engine/PERFORMANCE.md`.

**O que continua sem equivalência de produção:** o SmartCanvas ainda aparece como superfície experimental junto ao editor legado; não é a superfície principal substituta. Colagem de imagens/listas/tabelas dentro de células, seleções que atravessam estruturas aninhadas, edição completa de objetos, integração real com API para autosave/conflitos/versões, exportação DOCX/PDF a partir do SmartCanvas e validação manual de IME em todos os navegadores suportados continuam pendentes. O baseline de memória mede o editor React legado e o preview do motor em Chromium headless; não prova ganho de memória nem substitui medição em Chromebook físico. O CI mais recente (commit 4efdaf4c65ca2031760ead76ff95dccc224062a6) passou em [Kortex validation](https://github.com/korczaktech/kz-nexus/actions/runs/38845815631), [SmartCanvas validation](https://github.com/korczaktech/kz-nexus/actions/runs/38845815579) e [SmartCanvas Memory Baseline](https://github.com/korczaktech/kz-nexus/actions/runs/38845815656).

Portanto, os testes automatizados do incremento estão verdes, mas não há autorização técnica para ativar o SmartCanvas por padrão nem remover o fallback legado. A migração deve continuar por capacidades, com testes de paridade antes de cada troca.


## Atualização de aceite — 2026-10-16

O aceite automatizado das Fases 2A e 2B está registrado em [SMARTCANVAS-PHASE-2-ACCEPTANCE.md](SMARTCANVAS-PHASE-2-ACCEPTANCE.md). O código em `df745b9081e59c7ba3a30210010b0d1086f40567` passou em SmartCanvas validation, Kortex validation, API/MongoDB/Playwright E2E, baseline e publicação. O E2E real verificou persistência HTML/NSX, recuperação de rascunho, exportação DOCX/PDF, autosave e conflito de versão; o teste de componente cobre os estados de salvamento e falha com preservação do rascunho.

Esta atualização substitui os registros anteriores que indicavam o E2E real como pendente. Ainda não há paridade universal: listas/tabelas coladas em células viram texto estruturado, operações que cruzam estruturas aninhadas têm limites e o IME não foi validado manualmente em todos os navegadores. SmartCanvas segue opt-in; não remover o legado nem iniciar otimização de memória nesta fase.


## Atualização incremental — 2026-10-17

**Código consultado:** [a6882feb013c9086c38245e67f966f19706cd531](https://github.com/korczaktech/kz-nexus/commit/a6882feb013c9086c38245e67f966f19706cd531). Esta atualização registra progresso incremental; não representa aceite final da migração.

- No modo `?smartCanvas=1`, o componente não monta mais a projeção de páginas `.editor-pages-stack` do editor legado. A integração de salvamento verifica que não existe `.rich-editor` legado montado; a superfície SmartCanvas continua montada e salva o documento canônico.
- A seleção lógica do motor pode ser consultada sem exigir uma raiz DOM legada. `engineContext()` usa esse caminho no modo SmartCanvas.
- Os caminhos de formatação inline, links, remoção de formatação e comentários deixam de exigir uma referência ao DOM legado antes de executar os comandos do motor.
- A conversão de maiúsculas/minúsculas/título usa as faixas de seleção lógicas, incluindo texto em listas e células de tabelas; a transformação textual foi extraída e ganhou testes de locale e limites de parágrafo.
- O SmartCanvas comunica mudanças de seleção à ribbon externa, sincronizando estados de formatação para seleções de um ou vários blocos.
- Foram adicionados testes para colagem, recorte e teclado em modo somente leitura, seleção lógica sem raiz DOM e ausência da projeção legada no modo SmartCanvas.

### Validação automatizada registrada

No commit `a6882feb`, os workflows **SmartCanvas validation** e **Kortex validation** passaram. A suíte frontend registrou **207 testes em 32 arquivos** e a suíte do motor **211 testes em 27 arquivos**. A integração real com API, a baseline de memória e a publicação ainda estavam em execução na consulta deste registro; não são considerados aprovados por inferência.

- [SmartCanvas validation](https://github.com/korczaktech/kz-nexus/actions/runs/39042467278)
- [Kortex validation](https://github.com/korczaktech/kz-nexus/actions/runs/39042467237)
- [SmartCanvas API integration](https://github.com/korczaktech/kz-nexus/actions/runs/39042467239)
- [SmartCanvas Memory Baseline](https://github.com/korczaktech/kz-nexus/actions/runs/39042467320)

### Bloqueios para aceite integral

1. A célula de tabela ainda aceita apenas parágrafos no modelo canônico. Por isso, colar listas e tabelas em células converte sua estrutura em texto legível, em vez de criar listas/tabelas aninhadas editáveis.
2. Ainda é necessária auditoria completa de paridade das ferramentas avançadas e de qualquer caminho que dependa do editor DOM fora do modo opt-in.
3. O ciclo IME foi coberto em testes de componente, mas não validado manualmente em todos os navegadores/dispositivos suportados.
4. Falta comparação visual manual de paginação, margens, cabeçalho/rodapé, tabelas, imagens e objetos em documentos reais.
5. O modo SmartCanvas continua protegido por `?smartCanvas=1`; não ativar por padrão nem considerar a migração integralmente aceita até concluir os bloqueios e os testes de integração/manuais.

A remoção da projeção DOM no modo opt-in é um avanço estrutural, mas não equivale à remoção de todos os caminhos legados nem à paridade universal de produto.
