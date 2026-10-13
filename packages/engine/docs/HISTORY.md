# Histórico

Estratégia da v1: **snapshots imutáveis** do documento (+ seleção antes/depois) por passo. Simples e seguro porque o modelo é imutável e compartilha estrutura; custo de memória cresce com o número de passos × mudanças, limitado por `maxEntries` (200 por padrão). Evolução possível: patches/operações inversas.

Agrupamento: somente operações do grupo `typing`, consecutivas e dentro de `typingGroupWindowMs` (800 ms), viram um passo; `formatting`, `structural` e `external` sempre abrem um passo novo. Nova operação após undo descarta o redo. `dispose()` libera pilhas.
