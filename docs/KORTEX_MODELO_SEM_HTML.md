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
- A digitação comum, exclusão, quebra de parágrafo/linha, atalhos de formatação,
  desfazer/refazer do motor e operações de estrutura são encaminhados como
  comandos Kortex. Colagem, recorte e entrada por páginas criadas pelo paginador
  também usam os mesmos caminhos do motor. Eventos nativos de edição não suportados são bloqueados e a
  projeção é reconstruída a partir do modelo, em vez de ser aceita como fonte.
- As páginas geradas dinamicamente pelo paginador recebem os mesmos listeners
  de entrada, colagem, recorte e composição; a integração não depende apenas dos
  handlers React do primeiro render.
- Ao salvar, a API persiste o envelope `.nsx` em `native_content` na mesma versão
  que o HTML de compatibilidade. A resposta mantém `content` para visualizadores,
  integrações e versões antigas do cliente.
- O histórico de versões grava e restaura os dois campos, permitindo recuperar o
  modelo nativo junto com sua projeção HTML.
- O histórico de desfazer/refazer de compatibilidade mantém snapshots `.nsx` do
  `NexusDocument`, não snapshots HTML. Ao restaurar um snapshot nativo, o editor
  carrega o modelo e regenera a projeção visual. Snapshots HTML antigos ainda são
  aceitos como fallback de migração.
- As preferências de layout do editor (página, margens, cabeçalho, rodapé e fonte)
  também são serializadas como metadado `editorLayout` no modelo Kortex; o
  comentário HTML de layout permanece apenas para compatibilidade com clientes antigos.
- A importação e exportação de arquivos `.nsx` usam a API nativa do motor.
- O salvamento é interrompido se a sincronização HTML → Kortex falhar; não deve
  enviar um snapshot nativo possivelmente desatualizado.
- Rascunhos locais guardam a projeção HTML e o payload nativo separadamente; a
  recuperação prioriza o modelo Kortex mesmo quando o rascunho HTML legado não
  existe, evitando reabrir silenciosamente a versão antiga do servidor.

## Limite conhecido

A integração ainda não é 100% independente de HTML/DOM: a superfície visual
continua usando `contentEditable`, e a composição de texto por IME (por exemplo,
teclados de idiomas asiáticos) ainda precisa reconciliar a composição final com o
modelo. O DOM serve como projeção e como ponte limitada para essa composição;
salvamento e exportação NSX usam o modelo Kortex como fonte. O paginador ainda
organiza nós DOM para exibição e snapshots HTML antigos só são aceitos como fallback de migração do histórico.

## Próximas etapas seguras

1. Fechar as lacunas restantes de edição em que ferramentas auxiliares ainda modificam DOM diretamente.
2. Fazer com que seleção, formatação, tabelas, imagens e paginação operem primeiro sobre comandos do Kortex.
3. Adicionar testes de ida e volta para todos os blocos, marcas, recursos e versões legadas.
4. Remover gradualmente os fallbacks HTML do histórico depois de confirmar compatibilidade com documentos existentes.
