# SmartCanvas — arquitetura-alvo e plano de transição

**Status:** etapa 1 — arquitetura definida; implementação incremental ainda em andamento.  
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

Entretanto, o editor principal em Editor.tsx ainda cria páginas e conteúdo HTML no DOM, usa contentEditable para o corpo e para campos de cabeçalho/rodapé, e consulta window.getSelection(). Há chamadas a document.execCommand nos fluxos de formatação de cabeçalho/rodapé e como fallback de clipboard. A integração SmartCanvas atual é principalmente uma camada de adaptação e instrumentação: ela **não** substitui ainda a entrada de texto, a seleção do navegador ou a edição DOM.

Também há responsabilidades sobrepostas que precisam ser resolvidas durante a migração: o modelo do motor, a projeção HTML, o estado React baseado em HTML e arrays locais de histórico history/future. A paginação do editor principal e o layout nativo usado pela pré-visualização não são ainda um único caminho de renderização.

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
- [ ] Contratos de interação e seleção validados com testes de implementação nas próximas etapas.

### Etapa 2 — SmartCanvas
- [x] O caminho experimental opt-in renderiza as páginas a partir do layout do motor via SmartCanvasPreview; validar visualmente em execução antes de considerar paridade concluída.
- [x] Hit-testing do motor mapeia coordenadas em pontos para posições lógicas, blocos e células sem consultar seleção DOM; há testes unitários dedicados.
- [x] O renderer Canvas aceita um callback opcional de pointer hit-test, mantendo o comportamento existente quando não configurado.
- [x] Caret e seleção de texto de um único bloco podem ser desenhados em um canvas overlay independente do conteúdo, quando a seleção lógica é fornecida.
- [ ] Imagens, tabelas, marcas, objetos, cabeçalho/rodapé e quebras têm cobertura explícita.

### Etapa 3 — edição própria
- [ ] Controlador inicial de entrada implementado para digitação, IME, seleção de bloco, setas esquerda/direita, Home/End, Backspace/Delete, Ctrl/Cmd+A, cópia, recorte, colagem de texto e undo/redo; ainda faltam seleção estendida, navegação entre blocos, Enter/Tab e testes de integração.
- [ ] O conteúdo do corpo não depende de contentEditable nem de execCommand.
- [ ] Undo/redo restaura documento e seleção sem histórico paralelo divergente.
- [ ] Cabeçalho e rodapé também têm fluxo de edição próprio, ou um escopo de compatibilidade explicitamente isolado até sua migração.

### Etapa 4 — paridade
- [ ] Testes de integração cobrem edição, paginação, tabelas, imagens, HTML import/export, salvamento, rascunhos e versões.
- [ ] Comparação de regressão entre modo legado e SmartCanvas em documentos representativos.
- [ ] O modo SmartCanvas permanece opt-in até a aprovação de todos os critérios críticos.

### Etapa 5 — memória
- [ ] Baseline reproduzível antes/depois em documentos pequenos, médios e longos.
- [ ] Nenhuma otimização altera a semântica de edição, histórico, paginação ou persistência.

## 5. Progresso e próxima tarefa

**Implementado nesta iteração:** função pura hitTestLayout; geometria de caret/seleção e overlay; testes unitários do motor; prévia opt-in sob `?smartCanvas=1`; controlador inicial ligado à sessão do motor para inserir texto, excluir caracteres/seleção no mesmo bloco, navegar com setas esquerda/direita e Home/End, selecionar o texto do bloco, copiar/recortar/colar texto, processar composição IME e desfazer/refazer. O estado do documento é propagado ao editor para manter o salvamento e os rascunhos existentes. O modo somente leitura desativa o controlador. O editor legado continua disponível como fallback.

**Limitações conhecidas:** a seleção é restrita a um bloco; exclusão não atravessa blocos; Enter e Tab ainda não editam estrutura; navegação vertical e seleção estendida com Shift ainda faltam. A prévia não é fonte única da verdade e os testes/build ainda precisam ser executados.

**Próxima tarefa:** adicionar testes do controlador e do fluxo de persistência; implementar seleção estendida e navegação entre blocos; em seguida, implementar Enter/quebra de parágrafo e edição de células. Não remover contentEditable nem alterar o caminho padrão antes de validar os fluxos e a paridade de recursos.
