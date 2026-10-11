# Fase 18 — Sincronização multiplataforma

**Itens:** 296–312  
**Estado:** 🟡 Proteção de fila offline melhorada; sincronização entre plataformas e resolução de conflitos ainda não concluídas.

## Correções realizadas

- A fila IndexedDB do cliente PWA/iOS só remove operações após resposta HTTP 2xx. Respostas de conflito, autenticação, permissão, validação ou servidor permanecem pendentes e bloqueiam a fila para evitar descartar alterações.
- O sincronizador utiliza a mesma URL base configurada no cliente API.
- A fila Android agora persiste alterações offline de forma síncrona, tenta reproduzir gravações locais ao retornar ao primeiro plano e não descarta operações apenas por terem mais de sete dias.
- Se a fila Android estiver corrompida, o conteúdo bruto é preservado em uma chave de recuperação antes de iniciar uma fila vazia.

## Limitações atuais

A fila Android descrita acima é uma fila de gravação em armazenamento local, não uma sincronização em nuvem entre dispositivos. A fila IndexedDB também não implementa, por si só, reconciliação completa de versões nem resolução interativa de conflitos.

## Pendências

- [ ] Definir um protocolo de sincronização de servidor com identificadores idempotentes e versão-base.
- [ ] Implementar replay de alterações cloud em Android e demais clientes suportados.
- [ ] Resolver conflitos com base em `base_version_id` e preservar versões concorrentes.
- [ ] Exibir ao usuário estados pendentes, bloqueados, falha permanente e recuperação.
- [ ] Adicionar testes automatizados para duplicação, ordem, expiração de sessão, conflito 409 e retomada de conexão.
- [ ] Verificar que fila e cache não exponham dados entre contas no mesmo dispositivo.

## Critério de aceite

A fase só pode ser concluída quando o mesmo documento puder ser editado em clientes diferentes, ficar offline, sincronizar com segurança e preservar conflitos sem perda de dados. Os ajustes atuais são medidas de segurança, não prova de sincronização multiplataforma completa.
