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

## Integração atual

- Ao abrir um documento, o editor prioriza `native_content` quando a versão
  contém um payload Kortex válido; documentos legados continuam abrindo pelo HTML.
- Ao salvar, a API persiste o envelope `.nsx` em `native_content` na mesma versão
  que o HTML de compatibilidade. A resposta mantém `content` para visualizadores,
  integrações e versões antigas do cliente.
- O histórico de versões grava e restaura os dois campos, permitindo recuperar o
  modelo nativo junto com sua projeção HTML.
- A importação e exportação de arquivos `.nsx` usam a API nativa do motor.
- O salvamento é interrompido se a sincronização HTML → Kortex falhar; não deve
  enviar um snapshot nativo possivelmente desatualizado.
- Rascunhos locais guardam a projeção HTML e o payload nativo separadamente; a
  recuperação prioriza o modelo Kortex quando os dois estão disponíveis.

## Limite conhecido

A integração ainda não é 100% independente de HTML/DOM: a superfície visual
continua usando `contentEditable`, e algumas operações de edição sincronizam o
HTML de volta para o modelo. Portanto, o payload nativo é persistido e priorizado
na abertura, mas a eliminação total do DOM como fonte intermediária exige uma
migração separada das operações de entrada, seleção, histórico e layout.

## Próximas etapas seguras

1. Fazer com que todos os comandos de edição alterem primeiro `NexusDocument`.
2. Usar o HTML somente como projeção de visualização e adaptador de importação/exportação.
3. Fazer com que seleção, formatação, tabelas, imagens e paginação operem primeiro sobre comandos do Kortex.
4. Adicionar testes de ida e volta para todos os blocos, marcas, recursos e versões legadas.
5. Só remover o caminho legado depois de confirmar compatibilidade com documentos existentes.
