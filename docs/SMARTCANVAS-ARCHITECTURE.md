# SmartCanvas — arquitetura-alvo e plano de transição

**Status (2026-10-17):** preview, layout e renderer do SmartCanvas validados por CI. A edição opt-in usa seleção lógica independente da seleção DOM para comandos do corpo, histórico canônico, busca/substituição, clipboard de toolbar e exportação baseada no modelo. A integração E2E com API real passou novamente na cabeça `768747ea` para salvamento, payload NSX, recuperação de rascunho, exportação DOCX/PDF, autosave e conflito de versão. SmartCanvas validation, Kortex validation, baseline de memória e publicação GitHub Pages também passaram nesse commit. O fechamento integral continua bloqueado por estruturas aninhadas editáveis, seleção unificada entre células, comparação de regressão visual e validação manual multi-navegador/IME.  
**Escopo:** editor Web do Korczak Nexus (frontend/ + packages/engine/).  
**Regra de segurança:** o editor atual continua sendo o caminho padrão até que cada capacidade seja migrada e validada.

## 1. Diagnóstico do código atual

O repositório já contém a maior parte dos fundamentos de um motor próprio:

- **Modelo canônico:** NexusDocument e blocos tipados em packages/engine/src/model/.
- **Operações:** comandos de texto, marcas, blocos, listas, tabelas, imagens, configuração de página e objetos em packages/engine/src/commands/.
- **Sessão e histórico:** createEditor e HistoryManager em packages/engine/src/editor/ e packages/engine/src/history/.
- **Seleção lógica:** posições por blockId + offset em packages/engine/src/selection/selection.ts.
- **Layout e paginação próprios:** layoutDocument() em packages/engine/src/layout/layout.ts.
- **Renderização Canvas 2D:** CanvasDocumentRenderer.tsx, atualmente usada na pré-visualização paginada.
- **Adaptador DOM/modelo:** nexusEngineAdapter.ts, que importa/exporta HTML, mapeia seleção e restaura a seleção nativa.
- **Ponto de integração experimental:** editorSmartCanvas.ts, habilitado somente com ?smartCanvas=1.

Entretanto, o componente Editor.tsx ainda mantém uma projeção HTML oculta para compatibilidade e fallback. O modo SmartCanvas usa sua própria superfície de entrada, seleção lógica por ID/offset, histórico do motor e comandos de busca/substituição; o adaptador de seleção do SmartCanvas já não precisa ler nem restaurar Range no DOM legado. O histórico HTML local é desativado nesse modo. Exportação DOCX/PDF, pré-visualização, estatísticas e compartilhamento agora partem do documento canônico quando a sessão do motor está disponível.

A migração ainda não está concluída: o corpo do SmartCanvas não monta a projeção DOM legada nem depende de `contentEditable`/`execCommand` para editar o texto. Formatação, links, comentários, capitalização, limpeza de formatação e recorte usam comandos do motor também em seleções que abrangem vários blocos. Permanecem limites em estruturas aninhadas editáveis (listas/tabelas dentro de células), seleção unificada entre células, algumas ferramentas contextuais dentro de contêineres e validação manual multi-navegador/IME. Cabeçalho/rodapé têm controles próprios no SmartCanvas; o editor legado segue disponível fora do modo opt-in.

## 2. Decisões arquiteturais

### 2.1 Fonte única da verdade

NexusDocument dentro da sessão createEditor é a fonte canônica do conteúdo editável. O DOM, os pixels do Canvas, a seleção visual e o HTML exportado são projeções — nunca fontes independentes de verdade.

Toda edição persistente deve passar por comandos do motor. O renderer não modifica o documento; ele recebe um snapshot do documento e o resultado de layout.

### 2.2 Camadas e responsabilidades

```text
Editor UI (ribbon, menus, atalhos, diálogos)
                 |
                 v
Input Controller (teclado, pointer, clipboard, IME)
                 |
                 v
Logical Selection + Command Dispatcher
                 |
                 v
Editor Session / NexusDocument / History
                 |
                 v
Layout Engine (medidas, linhas, blocos, tabelas, páginas)
                 |
                 v
SmartCanvas Renderer (Canvas 2D por página + overlays)
```

Serviços transversais de persistência, importação/exportação e recursos (imagens) ficam fora do renderer e interagem com o modelo por contratos explícitos.

| Camada | Responsabilidade | Não deve fazer |
|---|---|---|
| UI | Comandos de usuário e estado visual da interface | Editar HTML diretamente para alterar o conteúdo |
| Input Controller | Converter eventos de teclado/pointer/IME/clipboard em intenções | Tornar a seleção nativa a fonte de verdade |
| Seleção lógica | Guardar âncora e foco por ID de bloco e offset; no futuro, suportar células/objetos | Depender de nós DOM como identidade persistente |
| Engine/session | Validar e executar comandos, manter documento e histórico | Conhecer React, DOM ou Canvas |
| Layout | Converter documento + métricas em geometria determinística de páginas/linhas/blocos | Mutar o documento |
| Renderer | Desenhar páginas, texto, tabelas, imagens e objetos a partir do layout | Ser editável por mutação de pixels ou guardar conteúdo próprio |
| Overlay de interação | Desenhar caret, seleção, alças, foco de tabela/objeto e IME | Substituir o modelo canônico |
| Persistência/exportação | Serializar o documento e produzir HTML/formatos externos | Usar o DOM visual como única cópia recuperável |

### 2.3 Contratos principais

- **Documento:** NexusDocument é a estrutura serializável e validável.
- **Comando:** toda alteração gera um resultado explícito do motor; erros não devem deixar o estado parcialmente aplicado.
- **Seleção:** posições lógicas devem continuar válidas por ID de bloco e offset; a migração deve definir como mapear seleção em células de tabela, imagens/objetos e blocos aninhados.
- **Layout:** entrada = documento + configuração de página + métricas de texto; saída = páginas, retângulos, linhas e diagnósticos. O layout não escreve no documento.
- **Renderização:** entrada = layout + documento/recursos; saída = pixels e hit regions. Canvas não é a fonte da verdade.
- **Entrada:** beforeinput, teclado, pointer, clipboard e composição IME são normalizados em intenções e convertidos em comandos do motor.
- **Histórico:** um único histórico de edição deve ser autoritativo. Durante a migração, comparar o histórico local de HTML do componente com HistoryManager e transferir o controle de forma explícita, preservando seleção antes/depois e agrupamento de digitação.
- **Persistência:** salvamento, recuperação de rascunho, versões e exportações devem serializar o documento canônico; HTML continua sendo formato de intercâmbio, não estado principal.

### 2.4 Seleção, cursor e entrada

A seleção nativa pode ser lida temporariamente pelo adaptador de compatibilidade, mas não pode permanecer como autoridade no SmartCanvas final.

A seleção lógica mínima atual usa { blockId, offset } para âncora e foco. O contrato de interação deverá adicionar, sem quebrar a API atual, alvos de seleção para células de tabela e objetos. A posição visual do caret e o hit-testing devem ser derivados da geometria do layout, e não da árvore DOM.

O controlador de entrada precisa cobrir:
- inserção e exclusão de texto, incluindo backspace/delete por caractere e palavra;
- setas, Home/End, Shift+setas, seleção de palavra/parágrafo e atalhos;
- composição IME sem inserir texto duplicado ou perder o texto final;
- copiar, recortar e colar texto/HTML/imagens com sanitização;
- formatação em seleção colapsada e em intervalo;
- desfazer/refazer com restauração do documento e da seleção;
- navegação e edição em tabelas, listas, imagens, quebras de página, cabeçalho e rodapé.

## 3. Estratégia de migração sem interromper o editor

A migração é por capacidades, com a implementação nova opt-in e o caminho atual como fallback. Não ativar SmartCanvas para todos os usuários até a aprovação dos critérios de saída de cada fase.

1. **Arquitetura (esta etapa):** documentar fontes de verdade, limites entre camadas, lacunas conhecidas, contratos e critérios de aceite. Não trocar o renderer nem o mecanismo de entrada nesta etapa.
2. **Motor de desenho:** consolidar o layout e o renderer para todas as páginas; implementar hit-testing e overlays separados; cobrir texto, marcas, tabelas, imagens, objetos, cabeçalho/rodapé e quebras.
3. **Entrada e seleção próprias:** criar seleção lógica visual, caret, hit-testing e controlador de teclado/IME/clipboard. Migrar primeiro texto simples e seleção, mantendo adaptadores de compatibilidade sob flag.
4. **Paridade de recursos:** migrar formatação, listas, tabelas, imagens, atalhos, undo/redo, paginação, cabeçalho/rodapé, salvamento, rascunhos, versões e exportação; remover dependências nativas somente quando cada caminho tiver testes equivalentes.
5. **Validação e ativação:** executar testes unitários, integração, regressão de documentos e testes manuais nos navegadores suportados. Ativar gradualmente e manter rollback até os critérios serem atendidos.
6. **Memória e desempenho:** medir a nova baseline antes de otimizar. Priorizar cache de layout, invalidação por bloco/página e histórico incremental somente com testes de correção.

## 4. Critérios de aceite

### Etapa 1 — arquitetura
- [x] Fonte canônica e responsabilidades por camada documentadas.
- [x] Lacunas do código atual registradas.
- [x] Ordem de migração e estratégia de fallback definidas.
- [x] Contratos de interação e seleção validados com testes unitários e de componente do hit-testing, geometria de seleção, células, imagens e operações estruturais.

### Etapa 2 — SmartCanvas
- [x] O caminho experimental opt-in renderiza as páginas a partir do layout do motor via SmartCanvasPreview; testes de regressão cobrem documentos representativos no renderer.
- [x] Hit-testing do motor mapeia coordenadas em pontos para posições lógicas, blocos e células sem consultar seleção DOM; há testes unitários dedicados.
- [x] O renderer Canvas aceita um callback opcional de pointer hit-test, mantendo o comportamento existente quando não configurado.
- [x] Caret e seleção lógica visual são desenhados em overlay independente do conteúdo; a geometria agora cobre seleções entre blocos e páginas, com teste dedicado entre blocos.
- [x] Renderer desenha tabelas, marcas inline, imagens, objetos semânticos, cabeçalho/rodapé alinhados e respeita quebras explícitas de página; a saída de desenho é verificada por regressão automatizada.
- [x] Testes de renderização/regressão cobrem parágrafo, título, listas, blockquote, tabela, imagem, objeto semântico, cabeçalho/rodapé, numeração e quebra de página em documentos representativos (`CanvasDocumentRenderer.test.tsx` e `PagedPreview.test.tsx`).

### Etapa 3 — edição própria
- [x] Controlador experimental cobre digitação/IME, seleção com Shift, navegação entre blocos e linhas visuais com setas, Home/End na linha renderizada, Ctrl/Cmd+A, atalhos de formatação, navegação por palavra, exclusão por palavra, duplo clique para selecionar palavra, triplo clique para selecionar parágrafo, clipboard de texto e undo/redo.
- [x] Seleção/exclusão de objetos semânticos e imagens, propriedades básicas de imagem, formatação pendente em célula vazia, colagem HTML sanitizada em parágrafo/célula e colagem rica sobre seleções entre parágrafos de topo estão cobertos por testes automatizados.
- [x] Objetos semânticos selecionados podem ser movidos entre blocos e redimensionados/editados por comandos do motor; há teste de componente para edição e reordenação.
- [x] Imagens podem ser coladas em células como recursos canônicos; o layout mantém imagens de linhas de tabela muito altas em um único fragmento de página, com teste de paginação.
- [x] Colagem de HTML estrutural em células preserva listas e tabelas aninhadas como nós editáveis, mantém marcas inline (incluindo negrito) e suporta substituição integral da célula ou inserção no caret lógico; testes de componente cobrem esses caminhos. Permanecem pendentes a paridade completa de edição/navegação em todas as estruturas aninhadas, a seleção unificada entre células e a validação manual de IME nos navegadores suportados.
- [x] No modo SmartCanvas, o corpo não depende de `contentEditable` nem de `execCommand`; o teste de integração confirma que não há projeção de editor nativo montada. O modo legado continua como fallback e o SmartCanvas permanece opt-in.
- [x] No modo SmartCanvas, undo/redo usa exclusivamente o histórico do motor; a seleção lógica é sincronizada com eventos externos de histórico e o histórico HTML paralelo fica desativado.
- [x] Cabeçalho e rodapé têm controles próprios de texto/alinhamento/números no SmartCanvas; edição rica legada permanece isolada no fallback.

### Etapa 4 — paridade
- [x] Testes de integração cobrem entrada de texto, seleção/substituição entre blocos com undo, edição de células, imagens/objetos, colagem HTML sanitizada, persistência .nsx e exportação HTML.
- [x] E2E com API real cobre salvamento, round-trip do payload NSX, recuperação de rascunho, exportação DOCX/PDF, autosave e conflito de versão (passou na cabeça `768747ea`). Ainda falta incluir a paginação nessa bateria e acrescentar comparação visual automatizada.
- [ ] Comparação visual de regressão entre modo legado e SmartCanvas em documentos representativos e em vários navegadores/dispositivos.
- [ ] O modo SmartCanvas permanece opt-in até a aprovação de todos os critérios críticos.

### Etapa 5 — memória
- [ ] Baseline reproduzível antes/depois em documentos pequenos, médios e longos.
- [ ] Nenhuma otimização altera a semântica de edição, histórico, paginação ou persistência.

## 5. Progresso e próxima tarefa

**Implementado nesta iteração:** hit-testing puro e geometria de seleção; offsets de grafemas Unicode; seleção de palavra/parágrafo; atalhos de formatação enviados ao motor; navegação vertical; caret e seleção em overlay; prévia opt-in sob `?smartCanvas=1`; controlador ligado à sessão do motor para digitação, Shift+setas, navegação, Home/End, Ctrl/Cmd+A, clipboard, Enter, composição IME, edição de células, marcas pendentes em célula vazia, colagem HTML sanitizada em células com múltiplos parágrafos e colagem rica sobre seleção entre blocos de texto de topo. A célula ativa agora recebe contorno visual no overlay, e digitar com um intervalo selecionado dentro da célula substitui esse intervalo em vez de inserir texto no cursor antigo. Parágrafos internos de tabelas ficam fora da lista de blocos de texto usada pela navegação e seleção global do documento, pois têm um controlador próprio de edição por célula. A navegação e a exclusão por teclado preferem limites de grafemas Unicode com `Intl.Segmenter`, evitando separar emojis compostos (como sequências com ZWJ) e letras com marcas combinantes; em runtimes sem esse recurso, há fallback para limites de pontos de código. Essas funções foram isoladas em `smartCanvasTextOffsets.ts` e receberam testes unitários para emojis suplementares e compostos, marcas combinantes, exclusão e limites; os testes e builds foram executados no CI. Backspace no início e Delete no fim tentam unir parágrafos adjacentes via comando semântico do motor. O documento é propagado ao fluxo existente de salvamento/rascunhos. O modo somente leitura desativa o controlador. O editor legado continua disponível como fallback.

**Atualização da integração de produção — 2026-10-16:** o contexto de seleção do SmartCanvas agora é construído diretamente de `engine.getSelection()` e do modelo lógico; não tenta recuperar um Range antigo do DOM para executar comandos de toolbar. Copiar/recortar pela toolbar, selecionar palavra/linha/parágrafo/bloco e localizar/substituir usam posições lógicas. A seleção de célula é sincronizada com eventos do motor sem sobrescrever o caret local durante a digitação. O fluxo de desfazer/refazer não mantém um segundo histórico HTML no modo SmartCanvas. DOCX, PDF, pré-visualização, contagem de palavras, estatísticas e compartilhamento usam o HTML projetado a partir do documento canônico. Os testes automatizados cobrem a seleção lógica entre blocos, restauração de seleção após undo, origem canônica da exportação e inserção/renderização de imagens em células.

**Limitações conhecidas:** exclusão e recorte de seleção entre blocos usam comandos sequenciais de exclusão e junção; só funcionam quando o motor aceita a estrutura adjacente. No recorte, o texto é enviado à área de transferência antes da tentativa de remoção; a remoção entre blocos é registrada como uma transação estrutural separada no histórico para que o recorte tenha um passo de desfazer próprio. Se o motor rejeitar os comandos, a interface informa que o conteúdo foi copiado, mas não removido. Navegação vertical usa a geometria de linha e medidas de texto do Canvas para aproximar a mesma coordenada horizontal entre linhas; a medição considera escala pt/px, família/tamanho da fonte, negrito/itálico e sobrescrito/subscrito. O contexto Canvas é reutilizado durante cada evento de navegação para evitar recriações por medição, mas ainda requer validação visual e teste de integração. Os comandos de célula preservam marcas inline nos trechos não alterados, herdam marcas do ponto de inserção e aceitam marcas pendentes para texto novo; testes cobrem formatação em célula vazia e colagem HTML rica com múltiplos parágrafos. A sobreposição do SmartCanvas desenha o cursor e o realce da seleção de texto simples dentro da célula com base na geometria das linhas; atalhos de negrito/itálico/sublinhado também aplicam marcas ao intervalo selecionado em células com múltiplos parágrafos; o hit-testing agora traduz offsets locais de parágrafo para offsets do texto combinado da célula, com teste unitário para essa fronteira, mas o comportamento ainda precisa de validação visual. Tab percorre células; Enter insere uma quebra de parágrafo na célula e Escape encerra a edição. Seleção por teclado, copiar/recortar e digitação de texto simples na célula usam comandos do motor. A extração de conteúdo de células agora preserva separadores de linha reais entre parágrafos, em vez de produzir os caracteres literais `\\n`. O comando `setCellText` também converte quebras de linha em parágrafos separados na célula e preserva IDs dos parágrafos existentes quando possível; a edição de texto simples agora preserva as marcas inline fora do intervalo alterado e herda as marcas do ponto de inserção para o texto novo; atributos de parágrafo existentes também são mantidos quando o parágrafo correspondente continua presente. Esse comportamento tem teste unitário, mas ainda precisa de validação em documentos reais e em operações complexas de substituição. O controlador sincroniza novamente o texto e os offsets da célula ativa após undo/redo, e encerra a edição da célula se ela não existir mais no documento restaurado. A substituição por digitação/colagem de uma seleção que atravessa vários blocos agora executa exclusões, junções e inserção em uma transação do motor, preservando as marcas do ponto inicial e evitando deixar a seleção parcialmente removida quando uma operação estrutural falha. Blocos semânticos recebem contorno visual ao serem selecionados; enquanto não há controlador de edição de objetos, a seleção limpa a posição de texto anterior para impedir que uma digitação acidental altere outro parágrafo. A seleção lógica entre blocos tem teste unitário de geometria; a compilação, os testes do motor, do preview e do frontend passam no CI.

**Validação automatizada atualizada:** o CI cobre entrada de texto, desfazer/refazer, composição IME, edição de célula e criação de linha com Tab, marcas pendentes, colagem HTML sanitizada em parágrafo/célula e seleção entre blocos, propriedades/exclusão de imagem, exclusão de objeto semântico, persistência `.nsx` e exportação HTML para conteúdo rico. O teste do renderer também cobre a saída de desenho de blocos representativos e encontrou uma corrida de carregamento de imagem; o renderer foi corrigido para definir `paint` antes de atribuir `image.src`. A validação de paridade da superfície de produção continua sendo uma etapa separada; não ativar por padrão nem remover o fallback legado antes dessa migração.

**Implementações recentes da etapa 2:**
- A navegação vertical percorre linhas visuais entre blocos e páginas e mantém a coluna horizontal preferida.
- Ctrl/Cmd+Home/End percorre o primeiro/último bloco de texto editável. As linhas de células de tabela são excluídas do controlador de documento para não aplicar offsets de célula a parágrafos alheios.
- Em células, setas verticais preservam a coluna desejada, Home/End percorre a linha atual e Ctrl/Cmd+Home/End percorre o conteúdo da célula. Os offsets verticais respeitam limites de grafemas Unicode.
- Tab avança entre células e cria uma linha ao sair da última célula; Shift+Tab recua sem circular para o fim da tabela.
- Backspace/Delete remove blocos/objetos selecionados quando a operação estrutural é compatível; Escape cancela a seleção. Há teste do motor para exclusão estrutural com undo e testes dos auxiliares de navegação multilinear.

- O comando `addTableRow` agora rejeita `afterRowId` inexistente em vez de inserir silenciosamente no início da tabela; testes unitários cobrem a posição de inserção e o erro `NODE_NOT_FOUND`. O teste passou no CI mais recente.

- A exclusão por Backspace/Delete agora usa `removeImage` para blocos de imagem, limpando o recurso embutido quando ele não é mais referenciado e preservando recursos compartilhados por outras imagens; os demais blocos continuam usando `deleteBlock`. A integração está coberta por teste de componente para seleção/exclusão de objeto e imagem.

- A prévia agora exibe controles para a imagem selecionada: texto alternativo, largura e altura. A ação usa `updateImage` no motor, valida dimensões entre 1 e 2000 px e permite deixar dimensões vazias para voltar ao tamanho automático. O foco do mouse foi ajustado para não roubar a interação dos campos/botão. Testes, typecheck e builds passaram no CI mais recente.

- Corrigida uma falha de integração dos controles de imagem: a busca anterior `findBlock` só reconhecia parágrafos/cabeçalhos, portanto não localizava blocos `image`. A prévia agora usa uma busca genérica na árvore do documento para ler propriedades, aplicar alterações e excluir imagens selecionadas. O campo de texto alternativo também limita a entrada a 2000 caracteres, igual ao motor.
- Adicionado teste para garantir que remover uma imagem não apague um recurso ainda referenciado por outra imagem. O teste passou no CI mais recente.

**Limite de validação:** o CI confirma testes e builds para o incremento, mas ainda não comprova paridade completa da superfície de produção. Não remover `contentEditable` nem alterar o editor padrão até concluir a migração do corpo, a integração real de salvamento/exportação e a comparação com o editor legado.

## Incremento de integração e regressão — 2026-10-16

- [x] O comando de edição de célula aceita marcas explícitas para texto recém-digitado, permitindo Ctrl/Cmd+B, I e U numa célula vazia sem alterar o conteúdo anterior; os testes verificam marcas explícitas e preservação das marcas do sufixo.
- [x] A colagem HTML no SmartCanvas passa pelo adaptador de importação HTML e pelo sanitizador existente antes de inserir blocos no modelo canônico. O caminho rico funciona em parágrafos/cabeçalhos, em células para conteúdo de parágrafo com marcas inline e múltiplas linhas, e sobre seleções entre blocos de texto de topo; imagens/listas/tabelas dentro de células e estruturas aninhadas ainda usam fallback de texto simples.
- [x] Adicionados testes de componente para ciclo de composição IME (texto intermediário não é inserido; o resultado final é inserido uma vez), colagem HTML sanitizada, edição de célula vazia com marca pendente, exclusão de objeto semântico, remoção de imagem e limpeza de recursos não utilizados, e substituição estrutural entre blocos com undo.
- [x] A persistência do editor agora força o estado dirty e agenda o autosave quando um comando SmartCanvas muda o documento canônico mesmo se a projeção HTML serializada permanecer igual.
- [x] Validação do commit de código 4efdaf4c65ca2031760ead76ff95dccc224062a6: [Kortex validation](https://github.com/korczaktech/kz-nexus/actions/runs/38845815631) e [SmartCanvas validation](https://github.com/korczaktech/kz-nexus/actions/runs/38845815579) concluíram com sucesso, incluindo testes do motor, testes do preview, typecheck e builds. A baseline de memória em Chromium também concluiu com sucesso: [SmartCanvas Memory Baseline](https://github.com/korczaktech/kz-nexus/actions/runs/38845815656). As medianas e ressalvas estão registradas em `docs/nexus-engine/PERFORMANCE.md`.

**Incremento de layout e migração — 2026-10-16:** o motor agora entrega a geometria de cabeçalho e rodapé em cada página, e o renderer consome essa geometria em vez de decidir suas coordenadas por conta própria. Imagens dentro de células também têm geometria calculada pelo motor e, quando uma linha precisa ser dividida entre páginas, a imagem é tratada como objeto indivisível: o fragmento termina antes da imagem e ela é posicionada inteira na página seguinte. Testes verificam a geometria de cabeçalho/rodapé e que a imagem não desaparece, não se duplica e permanece dentro da área imprimível. A colagem HTML em células aceita conteúdo misto: texto e imagens são importados; listas e tabelas são convertidas em texto estruturado porque o modelo atual de célula ainda não admite listas/tabelas aninhadas como nós canônicos. A colagem de imagem diretamente na célula tem teste de componente. O ciclo de vida inicial do motor e os fluxos de importação de texto/documento não exigem mais a presença do DOM legado, embora o editor antigo ainda seja mantido como fallback e o restante da superfície de produção continue em migração.

**Limite atual:** esses incrementos fecham casos específicos de layout e colagem, mas não declaram paridade total do editor de produção. O modo experimental continua opt-in; estruturas semânticas aninhadas, seleções atravessando estruturas diferentes, integração E2E com API real para autosave/rascunhos/conflitos/DOCX/PDF e validação manual multi-navegador continuam pendentes. Não trocar o editor padrão nem remover o fallback legado antes desses critérios.


## Atualização de aceite — Fases 2A e 2B (2026-10-16)

O aceite automatizado mais recente está documentado em [SMARTCANVAS-PHASE-2-ACCEPTANCE.md](nexus-engine/SMARTCANVAS-PHASE-2-ACCEPTANCE.md). No commit de código `df745b9081e59c7ba3a30210010b0d1086f40567`, SmartCanvas validation, Kortex validation, integração API/MongoDB/Playwright, baseline e publicação concluíram com sucesso. O E2E confirmou salvamento, payload NSX, recuperação de rascunho, DOCX, PDF, autosave e conflito de versão. O frontend passou 189 testes em 31 arquivos e o motor 211 testes em 27 arquivos.

A atualização acima substitui os apontamentos de E2E pendente registrados em seções anteriores deste documento. O SmartCanvas continua opt-in e o editor legado permanece como fallback. Colagem de listas/tabelas em células, seleção em estruturas aninhadas e validação manual multi-navegador de IME continuam como limites conhecidos. Nenhuma otimização de memória foi iniciada.
