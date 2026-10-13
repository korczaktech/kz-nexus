# Nexus Editor Engine

Este diretório é o local oficial do motor próprio do editor Nexus.

## Responsabilidade

O engine deve conter a lógica independente da interface: modelo canônico do documento, comandos de edição, transações, seleção, histórico undo/redo, normalização/validação, importação/exportação e leitura/escrita do formato nativo `.nsx`.

## Organização prevista

- `src/` — implementação TypeScript do motor e API pública.
- `tests/` — testes unitários e de regressão do motor.
- `package.json` — pacote `@korczak/nexus-engine`.

O motor deve permanecer desacoplado de React e da camada visual. A integração com `frontend/src/components/Editor.tsx` deve ocorrer por um adaptador explícito, preservando o comportamento atual do editor enquanto cada recurso é migrado e validado.

> A pasta foi criada como destino oficial. O código-fonte do ZIP ainda precisa ser transferido integralmente para este pacote antes de considerar o engine implementado ou integrado.