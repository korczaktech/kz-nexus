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
