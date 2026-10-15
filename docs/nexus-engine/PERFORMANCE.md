# Desempenho

## Motor (Node.js)

Metodologia histórica: `node scripts/bench.mjs` (mediana de 3–7 execuções, Node 22, Linux x64, sandbox de CI; valores variam por máquina). Documento = N parágrafos de ~80 caracteres via `importPlainText`. Estes números medem operações do motor em Node e **não** são uma medição da RAM total do editor no navegador.

| Documento | bytes .nsx | criar | validar | normalizar | inserir texto | negrito | dividir | undo+redo | serializar | ler |
|---|---|---|---|---|---|---|---|---|---|---|
| pequeno (10) | 3 805 | 0,07 | 0,06 | 0,23 | 0,30 | 0,15 | 0,13 | 0,01 | 0,13 | 0,34 |
| médio (500) | 165 416 | 2,73 | 0,98 | 2,22 | 1,08 | 0,69 | 0,52 | 0,01 | 1,32 | 9,67 |
| grande (5 000) | 1 654 417 | 12,43 | 7,58 | 29,53 | 9,61 | 5,09 | 4,37 | 0,00 | 15,04 | 46,47 |

Tempos em milissegundos. Gargalo previamente identificado: cada transação revalida o documento inteiro (O(n)); cerca de 10 ms por edição em 5.000 parágrafos no ambiente da medição histórica. Validação incremental não foi aplicada: aguardar medições comparáveis antes de otimizar.

## Memória do navegador (baseline SmartCanvas)

Execute depois de construir o motor e o preview, com Playwright e Chromium instalados:

```sh
cd packages/engine
npm ci
npm run build
cd ../engine-preview
npm install --no-audit --no-fund
npm run build
cd ../engine
npm run memory:baseline
```

O script `tooling/memory-baseline.mjs` carrega o preview real e registra fases: Chrome sem página, documento vazio, fixture existente de pelo menos 400 parágrafos e fixture após undo/redo. Gera JSON com versão do navegador, heap JS do renderer via CDP, memória privada reportada para processos Chrome, blocos/nós/recursos e caracteres do documento. Requer Playwright + Chromium globalmente instalados, como o E2E existente.

**Interpretação:** heap JS não inclui necessariamente DOM nativo, Canvas, imagens e buffers. A memória privada de processos Chrome é uma métrica de escopo diferente e não deve ser somada ao heap JS. O script mede o preview isolado do motor, não diretamente o editor React de produção; é uma primeira linha de base arquitetural, não um substituto para medições do app completo.

Para reduzir ruído, executar pelo menos três vezes na mesma máquina, manter versão do browser e viewport, e comparar medianas. O workflow manual `SmartCanvas Memory Baseline` executa três rodadas e guarda os relatórios como artefato.

No preview, o fixture de 400 parágrafos foi previamente montado e renderizado em ~0,25–0,3 s no E2E histórico. Não havia medições registradas de memória do navegador, tabelas grandes, imagens grandes ou dispositivos móveis antes deste baseline.


## Medição real do preview do motor — 2026-10-15

Executadas três rodadas no GitHub Actions, Linux x64, Node 22.23.3, Chromium 156.0.8078.4, viewport 1400×860. Os números abaixo são medianas das três rodadas; o documento de teste contém 400 parágrafos, 800 nós, 33.463 caracteres e nenhum recurso de imagem.

| Fase | Heap JS do renderer | Memória privada do grupo Chromium | Soma RSS dos processos Chromium |
|---|---:|---:|---:|
| Chromium iniciado, sem página | 0,48 MB | 72,52 MB | 414,36 MB |
| Preview aberto, documento vazio | 2,92 MB | 100,04 MB | 475,93 MB |
| Documento com 400 parágrafos | 4,66 MB | 121,80 MB | 512,17 MB |
| Após inserir 1 caractere e executar undo/redo | 6,70 MB | 130,61 MB | 522,64 MB |

**Como interpretar:** entre o preview vazio e o documento de 400 parágrafos, a mediana aumentou cerca de 21,76 MB de memória privada do grupo Chromium, 36,24 MB de RSS agregado e 1,74 MB de heap JavaScript. A RSS agregada inclui páginas compartilhadas e pode contá-las mais de uma vez; para comparar consumo privado, use a coluna de memória privada. O heap JavaScript não inclui necessariamente DOM nativo, Canvas, imagens e outros buffers.

Esses dados são de um **preview isolado do motor**, não do editor React de produção nem de um Chromebook físico. A memória total do grupo Chromium (incluindo browser, renderer, GPU e processos auxiliares) não deve ser confundida com o consumo incremental do editor. O baseline correspondente ao editor React está sendo preparado separadamente. Os números não são, por si só, evidência de vazamento nem prova de cumprimento da meta de 100 MB; são uma linha de base para comparar implementações no mesmo ambiente.


## Medição real do editor React de produção — 2026-10-15

Executadas três rodadas pelo workflow SmartCanvas Memory Baseline em Linux x64, Node 22.23.3, Chromium 156.0.8078.4 e viewport 1400×860. O frontend de produção foi construído no CI; as respostas da API foram simuladas localmente pelo Playwright, sem acessar conta ou documentos reais. Documento sintético: 400 parágrafos HTML, renderizados em 29 páginas.

| Fase | Heap JS do renderer | Memória privada do grupo Chromium | Soma RSS do grupo Chromium |
|---|---:|---:|---:|
| Chromium iniciado, sem página | 0,48 MB | 71,32 MB | 406,18 MB |
| Editor React aberto, 400 parágrafos | 5,46 MB | 264,24 MB | 718,99 MB |

No estado do editor com o documento carregado, o processo **renderer** sozinho apresentou medianas de 209,80 MB de memória privada e 320,84 MB de RSS. A diferença entre o grupo Chromium sem página e o editor carregado foi de aproximadamente **192,92 MB de memória privada** e **312,81 MB de RSS agregado**. O heap JS aumentou cerca de 4,98 MB, o que mostra que heap JavaScript isolado não representa o custo completo do editor: DOM, layout/paginação e alocações nativas também contam.

A soma RSS inclui páginas compartilhadas e pode contá-las mais de uma vez; para comparações de consumo privado, use a coluna de memória privada. O grupo inclui browser, renderer, GPU e processos auxiliares. O resultado é uma linha de base de Chromium headless no CI, não uma medição em Chromebook físico; a diferença inclui o shell React, o editor e a paginação de 29 páginas, não apenas o motor TypeScript.

**Conclusão arquitetural, sem otimizar nesta etapa:** o editor React de produção custa substancialmente mais que o preview isolado do motor. A meta de 100 MB não é demonstrada como cumprida por esta linha de base; precisamos definir se ela se refere à memória incremental do editor, ao renderer ou ao grupo completo do navegador antes da etapa final de otimização. Os números atuais ficam registrados como referência de comparação, não como uma meta revisada.
