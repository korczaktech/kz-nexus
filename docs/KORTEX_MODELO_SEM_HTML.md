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

## Seleção e formatação — marcos 7 e 8

A ponte de seleção mantém os offsets DOM em unidades UTF-16, normaliza seleções
reversas e calcula intervalos de exclusão de palavra sem modificar o documento
diretamente. Backspace/Delete em limites entre parágrafos de texto também usa
comandos Kortex: ao apagar uma palavra no limite de um parágrafo, a palavra
vizinha é removida antes de unir os blocos. Seleções que abrangem vários blocos
recebem comandos por ID de bloco; alinhamento e recuo percorrem a sequência
lógica de blocos de texto do modelo, inclusive texto em listas e tabelas. A
conversão de título aplica-se a múltiplos parágrafos selecionados de nível
superior. A formatação inline já usa comandos de marcas do motor e restaura a
seleção depois de atualizar a projeção.

Os testes de `frontend/src/components/editorSelection.test.ts` cobrem a
normalização de offsets, seleção reversa, limites de texto e exclusão de
palavras. A conclusão funcional ainda depende da CI e de regressões de interação
no navegador, principalmente IME, seleções complexas em blocos aninhados e
navegação por teclado.

## Estruturas nativas — marco 9

Tabelas e imagens permanecem como nós tipados do `NexusDocument`; os bytes das imagens
são recursos incorporados e referenciados por ID, não dependem de caminhos locais ou
de URLs temporárias. A exportação HTML projeta esses recursos como data URLs, enquanto
o envelope `.nsx` salva o bloco, dimensões, texto alternativo e recurso para recuperação.

O motor oferece comandos para atualizar texto alternativo/dimensões de imagens e mover
blocos de nível superior (incluindo tabelas, imagens e divisores) sem recriar IDs ou
perder conteúdo. O editor expõe controles para redimensionar/remover imagens e mover
uma imagem selecionada ou a tabela sob o cursor. Os testes cobrem movimento estrutural,
validação de dimensões e preservação das dimensões da imagem no ciclo `.nsx`.

A validação final deste marco exige CI verde e teste manual no navegador: inserir imagem,
redimensionar, mover, salvar, recarregar e exportar; e editar células de tabela, adicionar
ou remover linhas/colunas, mover a tabela e confirmar a persistência.

## Round-trip e compatibilidade — marco 10

A suíte de ida e volta `.nsx` cobre agora conteúdo vazio e Unicode (incluindo emoji e
caracteres combinantes), metadados, configuração da página, IDs estáveis, títulos,
parágrafos, todas as marcas inline suportadas, alinhamento, recuo, espaçamento,
entrelinha, fundo/borda/padding, listas, tabelas e texto de células, citações,
separadores e imagens. Para imagens, a verificação compara também o MIME type e os
bytes Base64 do recurso incorporado, além do texto alternativo e dimensões.

O caminho de compatibilidade legado é testado separadamente: HTML antigo misto é
importado para o modelo tipado, projetado de volta em HTML e reimportado, verificando
a estrutura de títulos, listas, citações, tabelas, separadores e imagens, além de links
seguros e recursos incorporados. A importação HTML não transforma o HTML em formato
nativo; após a migração, o modelo Kortex continua sendo serializado em `.nsx`.

A versão atual do envelope `.nsx` é a 1. Ainda não existe uma versão anterior do próprio
envelope que possa ser migrada para a versão 1, portanto não foi criada uma migração
artificial. O leitor rejeita versões futuras e mantém erros explícitos quando uma
migração necessária não está registrada. Quando a versão 2 for definida, o marco de
migração deverá incluir fixtures reais da versão 1 e expectativas do documento migrado.


## Validação integral da persistência — marco 11

A fronteira de persistência nativa ganhou cobertura explícita para as classes de
falha que precisam permanecer distinguíveis para a interface: conteúdo vazio ou
JSON inválido, formato não reconhecido, versão futura do envelope, versão futura
do schema e limite de tamanho excedido. Os testes verificam os códigos de erro
esperados, para que uma limitação de segurança não seja apresentada como simples
corrupção de arquivo.

O ciclo válido de codificação e decodificação continua comparando o documento
canônico completo, incluindo identidade, metadados, configuração de página e
conteúdo. A identificação da extensão nativa .nsx também cobre espaços externos,
maiúsculas/minúsculas e caminhos Windows/POSIX, sem aceitar extensões adicionais
como .nsx.backup.

Esta etapa valida automaticamente a fronteira do formato nativo; não comprova
sozinha toda a experiência de edição. Continuam pendentes testes manuais reais no
navegador para composição IME, cursor/seleção após operações estruturais, edição
de células, redimensionamento e movimentação de imagens, paginação e persistência
após recarregar. Esses cenários não devem ser declarados aprovados apenas porque
a suíte automatizada passa.

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
