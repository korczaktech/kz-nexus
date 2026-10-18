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


## Continuação da migração — 2026-10-17

Desde o registro anterior, foram feitos novos incrementos diretamente em `main`:

- O recorte pela ribbon agora gera comandos de exclusão por faixa lógica, inclusive em parágrafos de listas e células, preservando os contêineres.
- A ribbon externa sincroniza estado de marcas, listas e alinhamento com a seleção lógica do SmartCanvas.
- A capitalização substitui cada faixa de texto em seu próprio bloco, preservando limites de parágrafo, lista e célula.
- Aplicar/remover links, limpar formatação e anotar comentários agora percorre faixas lógicas de seleções que atravessam vários blocos.
- A inserção de imagem pela ribbon é encaminhada ao seletor do próprio SmartCanvas, para respeitar o contexto de edição da célula.
- A colagem de listas/tabelas em células continua sem criar nós aninhados, mas agora preserva marcas inline (por exemplo, negrito) ao converter as estruturas para texto, além dos marcadores, separadores e recursos de imagem.
- A suíte de integração passou a verificar explicitamente que não há `.editor-pages-stack`, `.rich-editor` nem elementos `contentEditable=true` no modo SmartCanvas.

### E2E com API real

O workflow [SmartCanvas API integration](https://github.com/korczaktech/kz-nexus/actions/runs/39068979491) passou no commit `57a743d2`. O teste real confirmou salvamento pela API, round-trip do payload nativo NSX, recuperação de rascunho, exportação DOCX/PDF, autosave e conflito de versão. A baseline de memória e os workflows SmartCanvas/Kortex também passaram nesse commit.

Os incrementos posteriores em seleção e colagem estão sendo revalidados no CI. Portanto, o resultado do commit `57a743d2` é evidência para aqueles fluxos naquele SHA, não uma declaração de que a cabeça atual já está integralmente aceita.

### Limitações que continuam abertas

1. Listas e tabelas coladas em células ainda são achatadas em texto estruturado; o modelo canônico de célula precisa ser ampliado antes de tornar essas estruturas aninhadas editáveis.
2. A seleção global não atravessa células como se fossem um único intervalo lógico; cada célula mantém seu controlador de edição.
3. Ainda falta comparação visual de regressão com documentos reais e validação manual de IME em navegadores/dispositivos suportados.
4. A baseline automatizada não substitui medições físicas em Chromebook nem prova o alvo de memória de 100 MB.
5. O SmartCanvas permanece opt-in. Não remover o fallback nem declarar a migração integral antes de validar o SHA atual e fechar os critérios restantes.


## Revalidação da cabeça atual — 2026-10-17

**Commit validado:** [92f0605a217b69b2d84142537e84e565154b25be](https://github.com/korczaktech/kz-nexus/commit/92f0605a217b69b2d84142537e84e565154b25be).

- [SmartCanvas validation](https://github.com/korczaktech/kz-nexus/actions/runs/39078368058): sucesso.
- [Kortex validation](https://github.com/korczaktech/kz-nexus/actions/runs/39078368020): sucesso.
- [SmartCanvas Memory Baseline](https://github.com/korczaktech/kz-nexus/actions/runs/39078368026): sucesso.
- [Deploy GitHub Pages](https://github.com/korczaktech/kz-nexus/actions/runs/39078368040): sucesso.

O incremento de teste nesse SHA cobre o mapeamento de faixas lógicas entre parágrafos em células distintas, nos sentidos direto e reverso, preservando a identidade de cada parágrafo. **Ele não implementa arraste visual entre células nem altera o controlador de edição de célula.** A integração E2E com API real foi aprovada em um SHA anterior (768747e); não houve workflow de API integration associado ao SHA 92f0605, portanto essa evidência não deve ser atribuída automaticamente à cabeça atual.

### Bloqueios funcionais ainda abertos

1. Seleção por arraste e edição contínua entre células ainda não estão implementadas na interface; o teste acima valida somente o helper de mapeamento lógico.
2. O modelo canônico da célula não comporta listas/tabelas aninhadas editáveis; a colagem dessas estruturas ainda é achatada em texto estruturado.
3. A paridade das ferramentas e caminhos de edição precisa de auditoria final; SmartCanvas continua opt-in e o fallback legado não deve ser removido.
4. Faltam regressão visual manual em documentos reais e validação manual de IME nos navegadores/dispositivos suportados.
5. A baseline automatizada não prova o alvo de 100 MB em Chromebook físico.

**Decisão de aceite:** CI verde confirma os jobs executados, não conclusão integral da Etapa 3. Manter a migração aberta até resolver os bloqueios funcionais e executar a validação manual pendente.

## Etapa 3 — auditoria de fechamento (2026-10-17)

### O que foi implementado nesta rodada

- O renderer de páginas resolve o alvo do ponteiro a partir das caixas geométricas de todas as páginas do mesmo renderer. Como o Pointer Capture mantém os eventos no canvas inicial, o hit-testing agora usa as coordenadas globais do ponteiro para localizar a página sob ele; durante um arraste, a página mais próxima é usada quando o ponteiro está no intervalo entre páginas.
- A seleção lógica do SmartCanvas aceita alvos de texto e de célula de tabela no início, movimento e fim do arraste. Para células, o deslocamento combinado da célula é mapeado para o ID e offset do parágrafo canônico.
- Foram acrescentados testes de contrato para arraste entre blocos de texto, entre células e entre páginas. O resultado do CI precisa ser consultado no commit final; um teste que existe, mas falha, não é aceite.

### Limites estruturais ainda não encerrados

**Estruturas aninhadas em células — migração estrutural implementada, paridade ainda em validação:** o modelo canônico agora permite Block[] nas células e a normalização, validação recursiva, busca de tabelas, comandos de tabela, importação HTML, exportação HTML/Markdown/texto, layout, renderização e hit-testing percorrem conteúdo aninhado. A colagem HTML de listas e tabelas dentro de células mantém os nós estruturais em vez de convertê-los em texto. A inserção estrutural também pode ocorrer no ponto lógico de uma seleção, dividindo o parágrafo da célula e preservando os blocos vizinhos. Os testes de integração devem confirmar round-trip de listas, tabelas, imagens e marcas, edição de células de tabelas aninhadas, seleção e navegação por teclado. A compatibilidade com documentos NSX antigos precisa continuar coberta; clientes antigos que assumam exclusivamente parágrafos em células não devem receber conteúdo aninhado sem suporte.

**Paridade funcional:** SmartCanvas não deve ser declarado substituto completo enquanto comandos avançados de interface, cabeçalho/rodapé, clipboard rico, edição por IME, navegação de teclado, undo/redo e recursos de importação/exportação não tiverem cobertura de equivalência contra o motor e o caminho legado. A presença de uma ferramenta na barra não prova que ela opera exclusivamente sobre o modelo canônico.

### Ativação segura

- O gate de produção continua desativado por padrão; a ativação requer `?smartCanvas=1`.
- Não remover o editor legado, não mudar o padrão global e não ampliar a ativação para todos os usuários apenas porque os testes unitários passam.
- Para ativação geral, exigir simultaneamente CI verde no commit final, matriz de regressão automatizada e checklist manual concluído no navegador/dispositivo-alvo.
- Se houver falha de seleção, composição, salvamento, exportação ou recuperação de rascunho, desativar a flag e usar o caminho legado; não converter silenciosamente documento canônico para HTML divergente.

### Testes automatizados e validação humana

Automatizável neste repositório: testes de hit-testing e seleção lógica entre páginas/contêineres, testes de comandos e histórico, round-trip NSX/HTML/DOCX, salvamento e recuperação de rascunho via integração existente, conflitos e builds.

Necessita de confirmação humana no navegador/dispositivo real: composição IME do sistema operacional, teclado físico e navegação por leitor de tela, diferenças de renderização/fonte, comparação visual de documentos extensos, arraste físico nas margens e no intervalo entre páginas, impressão e abertura de DOCX/PDF em aplicações externas. Não marcar esses itens como concluídos com base em Happy DOM ou CI headless.

### Critério de encerramento

A Etapa 3 só poderá ser fechada quando: (1) o teste de arraste entre páginas passar no CI; (2) a estrutura aninhada for preservada de ponta a ponta sem achatamento; (3) a auditoria de paridade identificar e fechar ou justificar explicitamente cada comando; (4) os workflows estiverem verdes no mesmo SHA de `main`; e (5) a validação humana pendente estiver registada. Até lá, o estado é **em andamento**, e o editor legado permanece como fallback.

### Resultado verificado no commit `a5f2d939f9e41a053697bff63cb3a264cac7917d`

Consulta realizada após a conclusão dos workflows no mesmo SHA da branch `main`:

- [Kortex validation](https://github.com/korczaktech/kz-nexus/actions/runs/39080394890): sucesso — testes, tipos e build do SmartCanvas preview; testes, tipos e build do motor; typecheck e build do frontend.
- [SmartCanvas validation](https://github.com/korczaktech/kz-nexus/actions/runs/39080394808): sucesso.
- [SmartCanvas Memory Baseline](https://github.com/korczaktech/kz-nexus/actions/runs/39080394870): sucesso.
- [Deploy GitHub Pages](https://github.com/korczaktech/kz-nexus/actions/runs/39080394800): sucesso.

Esses resultados confirmam que o teste de arraste entre páginas está verde nesse commit e que os quatro workflows citados concluíram com sucesso. Não encerram os bloqueios de preservação de estruturas aninhadas, auditoria completa de paridade nem validação humana descritos acima.
