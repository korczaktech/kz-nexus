# Desempenho

Metodologia: `node scripts/bench.mjs` (mediana de 3–7 execuções, Node 22, Linux x64, sandbox de CI; valores variam por máquina). Documento = N parágrafos de ~80 caracteres via `importPlainText`.

| Documento | bytes .nsx | criar | validar | normalizar | inserir texto | negrito | dividir | undo+redo | serializar | ler |
|---|---|---|---|---|---|---|---|---|---|---|
| pequeno (10) | 3 805 | 0,07 | 0,06 | 0,23 | 0,30 | 0,15 | 0,13 | 0,01 | 0,13 | 0,34 |
| médio (500) | 165 416 | 2,73 | 0,98 | 2,22 | 1,08 | 0,69 | 0,52 | 0,01 | 1,32 | 9,67 |
| grande (5 000) | 1 654 417 | 12,43 | 7,58 | 29,53 | 9,61 | 5,09 | 4,37 | 0,00 | 15,04 | 46,47 |

Gargalo identificado: cada transação revalida o documento inteiro (O(n)); ~10 ms por edição em 5 000 parágrafos. Possível otimização futura: validação incremental só dos nós tocados (não feita — não otimizar sem necessidade medida). No preview, o fixture de 400 parágrafos foi montado e renderizado em ~0,25–0,3 s no E2E. Sem medições com tabelas grandes ou recursos grandes nem em dispositivos móveis.
