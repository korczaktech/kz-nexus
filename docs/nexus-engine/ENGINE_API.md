# API pública (`@korczak/nexus-engine`)

Única porta de entrada: `packages/engine/src/index.ts` (empacotado em `dist/index.js` + `dist/index.d.ts`).

**Resultados**: `Result<T> = { ok: true, value } | { ok: false, error: EngineError }`. Falhas previsíveis nunca são exceções.

## Sessão

```ts
const editor = createEditor({ idGenerator?, clock?, limits?, historyOptions?, onListenerError? });
editor.getDocument(); editor.getSelection(); editor.setSelection(sel)
editor.exec(commands, { group?: "typing" | "formatting" | "structural" })  // transação atômica
editor.undo(); editor.redo(); editor.canUndo(); editor.canRedo(); editor.getHistoryInfo()
editor.validate(); editor.getValidationIssues(); editor.normalize()
editor.serialize(); editor.open(text); editor.load(doc)       // open/load só substituem o documento se tudo for válido
editor.addResource(input); editor.removeResource(id)
editor.on(event, listener) -> unsubscribe;  editor.dispose()
```

Eventos implementados: `documentChanged`, `transactionRejected`, `selectionChanged`, `historyChanged`, `documentOpened`, `documentSaved`, `resourceAdded`, `resourceRemoved`, `error`. **Não implementados** (previstos no prompt): `transactionCommitted` (use `documentChanged`) e `migrationExecuted`.

## Comandos (parâmetros tipados, pré-condições, erros estruturados)

Texto: `insertText`, `deleteText`, `replaceRange`. Marcas: `applyMark`, `removeMark`, `toggleMark`.
Blocos: `splitBlock`, `mergeBlockWithPrevious`, `insertParagraphAfter`, `deleteBlock`, `setHeadingLevel`, `setAlign`, `insertBlockquote`, `insertThematicBreak`.
Listas: `insertList`, `convertListType`, `insertListItem`, `removeListItem`.
Tabelas: `insertTable`, `addTableRow`, `removeTableRow`, `addTableColumn`, `removeTableColumn`, `setCellText`.
Imagens: `insertImage`, `removeImage`. Documento: `setPageConfig`, `setMetadata`.

## Formato e conversões

`saveNsx(doc, limits?)`, `openNsx(text, { limits? })`, `writeNsx`, `readNsx`; `importPlainText`, `exportPlainText`.

## Códigos de erro estáveis

`INVALID_DOCUMENT`, `NODE_NOT_FOUND`, `INVALID_POSITION`, `UNSUPPORTED_OPERATION`, `UNSUPPORTED_FORMAT`, `VERSION_MISMATCH`, `RESOURCE_NOT_FOUND`, `RESOURCE_IN_USE`, `LIMIT_EXCEEDED`, `MIGRATION_FAILED`, `CORRUPTED_CONTENT`, `TRANSACTION_REJECTED`.

Versionamento: SemVer a partir da 1.0; enquanto 0.x, mudanças incompatíveis são registradas em `DECISIONS.md`.
