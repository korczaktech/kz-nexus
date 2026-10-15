# SmartCanvas — arquitetura, consolidação e migração

Status: Passo 1 concluído; Passo 2 implementado e validado no preview; mapa de integração do editor React de produção criado. A migração do editor de produção ainda não foi iniciada.

## Objetivo

Consolidar uma superfície de edição própria, controlada pelo modelo canônico do Nexus, para reduzir a dependência de mutações nativas do DOM e permitir medir comportamento e memória antes de otimizar. SmartCanvas é o nome de trabalho para a camada de renderização/interação; não deve virar um segundo modelo de documento nem duplicar comandos do motor.

## Estado atual verificado no repositório

- `packages/engine/src/model`, `commands`, `transactions`, `selection`, `history`, `layout` e `resources`: modelo e operações TypeScript. O motor é headless e não deve importar DOM, React, navegador ou backend.
- `frontend/src/components/Editor.tsx`: editor de produção React; usa seleção DOM e ainda tem integração entre a árvore editável e o adaptador do motor. Deve permanecer funcionando durante a migração.
- `frontend/src/services/nexusEngineAdapter.ts`: ponte entre HTML/seleção do editor web e o modelo do motor. Deve ser gradualmente reduzida, não apagada antes de os casos de uso equivalentes estarem cobertos.
- `frontend/src/components/PagedPreview.tsx`: layout nativo com métricas Canvas 2D quando possível e fallback Paged.js; são dois caminhos de paginação que precisam ser explicitamente comparados.
- `frontend/src/components/CanvasDocumentRenderer.tsx`: renderer Canvas existente no frontend; avaliar se pode ser reaproveitado sem introduzir dependência cíclica ou renderização duplicada.
- `packages/engine-preview/src/editor/render.ts` + `input.ts` + `dom-selection.ts`: protótipo útil de projeção do modelo para DOM e tradução de eventos para comandos. Não é ainda um editor sem DOM: usa DOM para renderizar e traduz seleção do navegador para posições lógicas. O código cancela a edição nativa em `beforeinput`, mas ainda usa a seleção nativa como mecanismo de ponte.
- `packages/engine/src/layout/layout.ts`: layout geométrico TypeScript; precisa de métricas de fonte fornecidas pelo host. Não confundir cálculo geométrico com desenho final.
- API/backend: processo remoto separado. Não mover renderização ou comandos de digitação para a API como solução de memória; isso adicionaria latência e não eliminaria a RAM do cliente.

## Arquitetura-alvo

```
Editor React (shell, menus, acessibilidade, estado da aplicação)
  └── SmartCanvas Host (eventos, viewport, foco, composição/IME, clipboard)
       ├── Input Adapter → comandos semânticos
       ├── Selection Adapter → Selection lógica {blockId, offset}
       ├── Layout Adapter → medidas de fonte e layout paginado
       └── Renderer → projeção visual do modelo (DOM virtualizado/Canvas conforme decisão medida)
              ↑
       Nexus Engine (modelo único, comandos, transações, histórico, seleção, recursos)
              ↕
       Persistence Adapter → .nsx/API/storage
```

### Fronteiras obrigatórias

1. **Modelo único:** `NexusDocument` é a fonte de verdade; DOM/Canvas nunca são a fonte de verdade do conteúdo.
2. **Motor puro:** comandos, transações e histórico não conhecem React, DOM, Canvas, rede nem API.
3. **SmartCanvas é host:** recebe input e renderiza estado do motor; não reimplementa comandos ou histórico.
4. **Seleção lógica:** a seleção pública usa IDs de bloco e offsets UTF-16; a seleção visual é apenas um adaptador. Evitar depender de `window.getSelection()` como estado persistente.
5. **Layout isolado:** métricas da plataforma entram por interface explícita. O layout não deve chamar APIs globais do browser.
6. **Persistência isolada:** serialização .nsx e salvamento remoto não bloqueiam cada tecla nem fazem a API participar da edição local.
7. **Recursos fora do texto:** imagens/binários devem ser medidos separadamente; evitar cópias de base64 em cada render/transação.
8. **Compatibilidade incremental:** a implementação nova deve coexistir atrás de uma flag de desenvolvimento até passar a matriz de testes; não substituir toda a produção em um commit.
9. **Sem otimização prematura:** primeiro medir e registrar; otimização de memória fica para a última etapa acordada.

## Passo 2 — implementação incremental

- [x] Introduzir SmartCanvasSurface como coordenador da superfície do preview.
- [x] Definir contratos explícitos SmartCanvasRenderer, SmartCanvasSelectionAdapter e SmartCanvasInputAdapter.
- [x] Tornar renderização, seleção e input substituíveis por dependências injetadas.
- [x] Integrar a superfície no preview sem alterar o modelo canônico ou duplicar comandos/histórico.
- [x] Adicionar testes de lifecycle, renderização por mudança de modelo e passagem de seleção lógica.
- [x] Passar typecheck, testes e build do preview antes de fechar a etapa (workflow `Kortex validation`, run 38815982388: sucesso).
- [x] Mapear os pontos de integração equivalentes do editor React de produção, sem trocar ainda o caminho de edição (veja `SMARTCANVAS-PRODUCTION-INTEGRATION.md`).

## Etapas de migração (ordem obrigatória)

1. **Preparação e baseline (este passo):** mapa arquitetural, script reproduzível de memória do navegador e medições do motor, identificação dos caminhos atuais.
2. **Consolidar SmartCanvas:** extrair interfaces explícitas de host, renderer, input, seleção e layout; reaproveitar o protótipo sem duplicar o motor.
3. **Substituir a edição nativa gradualmente:** input por comandos, seleção lógica, teclado, clipboard e IME. O DOM pode continuar como superfície de renderização; “editor próprio” não significa necessariamente desenhar todos os glifos manualmente em Canvas.
4. **Integração e regressão:** tabelas, listas, imagens, seleção, undo/redo, importação/exportação, paginação, acessibilidade e persistência.
5. **Otimização de memória por último:** comparar a mesma matriz de documentos e navegador antes/depois; otimizar somente os maiores consumidores medidos.

## Matriz mínima de medição

Executar no mesmo navegador/ambiente, com cache frio e depois de uma execução de aquecimento:

- app recém-aberto, documento vazio;
- documento de 400 parágrafos (fixture já existente);
- documento de 5.000 parágrafos (motor/bench Node, e cenário de browser quando o fixture permitir);
- digitação, formatação, undo/redo;
- preview/paginação;
- documento com tabela/lista e imagem.

Registrar separadamente:
- heap JavaScript do renderer (CDP `Runtime.getHeapUsage`);
- memória privada dos processos Chrome reportada por CDP (`SystemInfo.getProcessInfo`; métrica do grupo do browser, não deve ser somada ao heap como se fosse outra categoria);
- bytes serializados .nsx, contagem de nós/blocos/recursos;
- tempo das operações e tempo de renderização;
- navegador/versão, sistema, arquitetura, quantidade de execuções e mediana.

O heap JavaScript não equivale à RAM total do processo: Canvas, DOM nativo, imagens, buffers e código podem ficar fora dele. A memória de processos também pode variar por GPU, cache, extensões e versão do navegador. Não declarar um número universal de RAM com uma única execução.

## Critérios para encerrar o Passo 1

- [x] Mapear os módulos atuais e os caminhos paralelos de renderização.
- [x] Definir limites entre motor, host, renderer, seleção, layout e persistência.
- [x] Preparar um teste repetível de memória no browser e apontar as limitações da medição.
- [x] Executar o teste em Chromium e registrar heap JS, memória privada e RSS do grupo de processos para o preview do motor (3 rodadas; veja PERFORMANCE.md).
- [x] Validar o script, o build do motor e o preview via workflow automatizado.
- [x] Registrar também a linha de base do editor React de produção, com API simulada e documento de 400 parágrafos (veja PERFORMANCE.md).
- [x] Confirmar que o workflow de build e medição do motor, preview e editor React concluiu com sucesso.

O passo só pode ser marcado como concluído depois dos dois últimos itens. Se Playwright/Chromium não estiver instalado no ambiente de execução, o script deve falhar com uma mensagem explícita; não substituir medições reais por estimativas.


## Estado de validação atualizado — 2026-10-15

O workflow [Kortex validation](https://github.com/korczaktech/kz-nexus/actions/runs/38815982388) concluiu com sucesso. Os jobs **Frontend typecheck and build**, **SmartCanvas preview tests, types and build** e **Engine tests, types and build** estão verdes. Isso valida os comandos automatizados configurados; não substitui testes manuais nem uma matriz completa de regressão do editor de produção.

O mapa de integração React foi documentado em `SMARTCANVAS-PRODUCTION-INTEGRATION.md`. A implementação atual do SmartCanvas está integrada ao preview do motor, não à superfície de edição React de produção. O próximo passo funcional é introduzir a camada de contratos/adaptadores no editor React sob flag de desenvolvimento, começando por seleção lógica e input de texto, sem alterar a persistência ou o renderer de preview na mesma mudança.


## Passo 3 — primeira fatia no editor React (em andamento)

Primeira integração de baixo risco registrada em `frontend/src/components/editorSmartCanvas.ts`:

- [x] Criar uma fronteira explícita para leitura/restauração da seleção no editor de produção.
- [x] Encaminhar `engineContext()` pelo contrato quando `?smartCanvas=1` estiver presente.
- [x] Manter o comportamento legado como padrão, sem a flag.
- [x] Adicionar testes da flag e do isolamento dos diagnósticos.
- [ ] Confirmar frontend typecheck, testes e build no GitHub Actions após a integração.
- [ ] Instrumentar e migrar eventos de entrada sem alterar IME ou histórico até existir cobertura específica.
- [ ] Só então migrar digitação e exclusão para comandos semânticos do motor.

A flag é um mecanismo de teste, não uma declaração de que a nova seleção lógica já substituiu o DOM. A implementação ainda chama o adaptador de seleção existente para mapear posições e restaurar o cursor. Não ativar por padrão nem iniciar otimização de memória nesta fase.


## Incremento de integração de input — 2026-10-15

- [x] Adicionar despacho explícito do evento `beforeinput` pelo adaptador SmartCanvas quando `?smartCanvas=1` estiver ativo.
- [x] Manter o handler semântico atual como autoridade para executar comandos Nexus; o adaptador não altera o texto nem cancela eventos.
- [x] Instrumentar eventos `beforeinput` e eventos de composição/IME em memória.
- [x] Testar encaminhamento do evento, ausência de cancelamento implícito e contadores de composição.
- [ ] Validar o novo commit no CI antes de ampliar a fatia.

A flag continua desligada por padrão. O próximo passo não deve ativar SmartCanvas globalmente: deve testar e corrigir os casos de digitação/deleção em fronteiras de blocos e páginas, além da composição IME real, preservando o histórico e o salvamento.
