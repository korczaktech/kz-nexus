# Arquitetura

O documento é um **modelo de dados**; a interface é uma projeção dele.

```
packages/engine           biblioteca headless (sem DOM, sem Node, sem React)
packages/engine-preview   app de desenvolvimento (DOM puro + esbuild) que consome o motor via pacote
```

## Módulos do motor (`packages/engine/src`)

| Módulo | Responsabilidade |
|---|---|
| `model` | tipos canônicos (`NexusDocument`, blocos, runs, marcas) e utilitários de árvore |
| `schema` | tipos conhecidos, limites de segurança (`DEFAULT_LIMITS`), validação de cor/tamanho |
| `validation` | invariantes e `ValidationIssue` com caminho do nó |
| `normalization` | normalização determinística e idempotente |
| `commands` | operações semânticas puras: `(doc, ctx) => Result` |
| `transactions` | aplicação atômica de comandos + validação do resultado |
| `selection` | posições lógicas `{blockId, offset}` e mapeamento |
| `history` | undo/redo por snapshots imutáveis com agrupamento |
| `nsx` | envelope, escritor, leitor, migrações |
| `resources` | recursos (imagens) embutidos em base64 |
| `editor` | sessão: junta documento, seleção, histórico, eventos |
| `events` | emissor tipado; listener que falha não desfaz transação |
| `importers`/`exporters` | texto simples (implementado) |
| `adapters` | contratos que o host implementa (`FileIO`, `ResourceProvider`, `StorageAdapter`) |

Dependências fluem de baixo para cima (tipos → modelo → validação → comandos → transações → editor). `scripts/check-architecture.mjs` verifica:
1. o núcleo não usa `window`, `document` (DOM), `navigator`, `localStorage`, `console`, `process`, `require`, `eval`, imports `node:`/React/Electron/Capacitor;
2. o motor não referencia o preview;
3. o preview só importa o motor pelo nome do pacote (nunca `src/` interno nem caminhos relativos para fora);
4. não há ciclos entre módulos de topo.

Imutabilidade: o documento exposto é profundamente congelado (`deepFreeze`); mutar lança erro. Comandos produzem novos objetos (cópia estrutural nos caminhos alterados).
