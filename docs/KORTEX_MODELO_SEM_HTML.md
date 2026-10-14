# Kortex — separação do modelo documental e HTML

## Decisão

O **modelo canônico do documento** é NexusDocument, definido em
packages/engine/src/model/types.ts. O motor Kortex manipula essa estrutura
tipada; HTML é uma representação de apresentação e um formato de
importação/exportação, não o formato nativo de persistência.

O formato nativo é **.nsx**, serializado como um envelope JSON UTF-8 versionado
com format = "korczak-nexus", formatVersion e document.
A leitura passa por validação, migração e normalização.

## Fronteira de persistência

frontend/src/services/nexusDocumentPersistence.ts oferece uma fronteira sem DOM:

- encodeNexusDocument(document) serializa diretamente o modelo para .nsx;
- decodeNexusDocument(payload) lê e valida .nsx para o modelo;
- isNsxFilename(filename) identifica a extensão nativa.

Esse serviço não aceita HTML e não usa document, HTMLElement ou APIs de navegador.

## Migração incremental

O adaptador nexusEngineAdapter.ts ainda faz a ponte entre a área de edição HTML
existente e o modelo do Kortex. Essa ponte é transitória: esta etapa cria e testa
o caminho de persistência direto do modelo, mas **não declara que a área de
edição já deixou de usar o DOM como superfície de edição**.

Próximas etapas:
1. direcionar abrir/salvar documentos para a fronteira .nsx quando o contrato
   da API e os documentos legados estiverem compatibilizados;
2. substituir gradualmente a sincronização baseada em HTML por comandos do Kortex;
3. manter importação/exportação HTML como adaptadores explícitos;
4. adicionar testes de ida e volta para todos os blocos, marcas e recursos antes
   de remover qualquer caminho legado.

Não mudar abruptamente o formato dos documentos já persistidos no backend.
