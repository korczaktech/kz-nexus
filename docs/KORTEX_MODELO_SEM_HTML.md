# Kortex — modelo documental independente de HTML

## Princípio

O modelo canônico é `NexusDocument`, definido em
`packages/engine/src/model/types.ts`. O Kortex edita essa estrutura tipada.
O HTML é uma representação de apresentação e um formato de intercâmbio; não é
o formato nativo de persistência.

O formato nativo é `.nsx`: um envelope JSON UTF-8 versionado que contém
`format`, `formatVersion` e `document`.

## Fronteira de persistência

`frontend/src/services/nexusDocumentPersistence.ts` é uma fronteira sem DOM:

- `encodeNexusDocument(document, options?)` delega serialização e validação a `saveNsx`;
- `decodeNexusDocument(payload, options?)` delega leitura, validação, migração e normalização a `openNsx`;
- `isNsxFilename(filename)` verifica somente a extensão, sem ler o conteúdo.

Os limites e a validação continuam centralizados no motor. As opções permitem
injetar limites de execução e um gerador de IDs determinístico para cenários de
migração/teste. A camada não duplica o parser, o envelope ou as regras de
segurança do Kortex.

## Estado da migração

O adaptador `nexusEngineAdapter.ts` ainda faz a ponte entre a superfície de
edição HTML existente e o modelo Kortex. A fronteira `.nsx` cria um caminho de
persistência direto do modelo, mas não significa que o editor já deixou de usar
HTML/DOM durante a edição.

## Próximas etapas seguras

1. Conectar abrir/salvar à fronteira `.nsx` sem alterar abruptamente o contrato do backend.
2. Substituir gradualmente sincronizações HTML → modelo por comandos do Kortex.
3. Manter HTML como adaptador explícito de importação/exportação.
4. Adicionar testes de ida e volta para todos os blocos, marcas e recursos.
5. Só remover o caminho legado depois de confirmar compatibilidade com documentos existentes.
