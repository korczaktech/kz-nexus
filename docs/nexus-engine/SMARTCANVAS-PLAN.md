# SmartCanvas — arquitetura e preparação (Passo 1)

Status: preparação arquitetural; nenhuma substituição do editor de produção nesta etapa.

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
- [ ] Executar o teste em Chromium disponível e registrar números reais do ambiente de execução.
- [ ] Executar testes de arquitetura/build/testes existentes após as mudanças.

O passo só pode ser marcado como concluído depois dos dois últimos itens. Se Playwright/Chromium não estiver instalado no ambiente de execução, o script deve falhar com uma mensagem explícita; não substituir medições reais por estimativas.
