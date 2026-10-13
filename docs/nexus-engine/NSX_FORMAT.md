# Formato `.nsx`

JSON UTF-8. Envelope:

```json
{ "format": "korczak-nexus", "formatVersion": 1, "document": { "id": "...", "schemaVersion": 1, "metadata": {}, "pageConfig": {}, "content": [], "resources": [] } }
```

- Escrita: valida, serializa sem alterar o original, retorna `Result<string>`.
- Leitura: checa tamanho → decodifica → valida envelope → verifica versão → migra → valida → normaliza → valida de novo. Falha **nunca** altera o documento da sessão (`editor.open`).
- Versão futura/desconhecida → `VERSION_MISMATCH` (não descarta conteúdo nem finge abrir). Formato diferente → `UNSUPPORTED_FORMAT`. JSON truncado/ids duplicados → `CORRUPTED_CONTENT`. Excesso de limites → `LIMIT_EXCEEDED`.
- Migrações: registro explícito origem→destino (`nsx/migrations.ts`). Hoje só existe a v1, portanto nenhuma migração real é exercitada (ver `fixtures/migrations/README.md`).
- Campos desconhecidos: o validador rejeita nós/marcas desconhecidos; não há mecanismo de extensões na v1.
- Garantia: equivalência **semântica** no round-trip (não igualdade byte a byte).
- Limites padrão: 25 MB, 50 000 nós, profundidade 64, 100 000 caracteres por run, 500 recursos, 10 MB por recurso, 64 metadados.
- Sem compressão, criptografia ou assinatura: **não há proteção contra adulteração**.
- Imagens são embutidas em base64 no próprio arquivo (tipos permitidos validados; MIME declarado não é confiável por si só — ver SECURITY.md).
