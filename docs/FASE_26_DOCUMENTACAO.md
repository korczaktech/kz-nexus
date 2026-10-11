# Fase 26 — Documentação técnica e operacional

**Itens:** 429–445  
**Estado:** 🟡 Documentação por fase atualizada; guias completos de usuário, administrador e recuperação ainda pendentes.

## Referências atuais

- `README.md`: estado geral do produto, mapa das 31 fases e links para evidências de CI.
- `docs/FASE_3_BANCO_DE_DADOS.md`: coleções, separação entre `KZDocs` e `Contas`, índices, migrações e recuperação.
- `docs/FASE_5_AUTENTICACAO_E_SEGURANCA.md`: autenticação, política de senha, autorização, headers e varredura de segredos.
- `docs/FASE_14_RESPONSIVIDADE_ACESSIBILIDADE.md`: melhorias implementadas e critérios de validação.
- `docs/FASE_18_SINCRONIZACAO_MULTIPLATAFORMA.md`: limites atuais das filas offline e pendências de conflito/sincronização cloud.
- `docs/FASE_19_TESTES_AUTOMATIZADOS.md`: escopo, evidências de CI e cobertura pendente.
- `docs/FASE_22_DESEMPENHO_E_CARGA.md`: smoke test k6, limites e execução autorizada.
- `docs/FASE_24_OPERACAO_E_PRONTIDAO.md`: health checks, configuração, backup/restore e operação.
- `docs/FASE_25_RELEASES.md`: artefatos, segredos de assinatura, validação e publicação.

## Conteúdo que ainda precisa ser escrito ou completado

- [ ] Guia de usuário final: criar, editar, versionar, pesquisar, compartilhar e recuperar documentos.
- [ ] Guia do administrador: usuários, papéis, grupos, permissões, auditoria e gestão de acesso.
- [ ] Guia de instalação e atualização de Web/PWA, Desktop, Android e iOS.
- [ ] Referência da API: autenticação, endpoints, contratos, erros e exemplos seguros.
- [ ] Runbook de produção: incidentes, alertas, rollback, rotação de credenciais e escalonamento.
- [ ] Runbook de backup/restore com RPO/RTO aprovados e prova de recuperação.
- [ ] Política de retenção, exportação e eliminação de dados.
- [ ] Processo de versionamento, notas de versão e compatibilidade entre clientes.
- [ ] Confirmar todos os comandos e capturas contra versões publicadas, não somente contra o branch principal.

## Critério de aceite

A documentação deve permitir que uma pessoa autorizada instale, opere, recupere e atualize o sistema sem depender de conhecimento tácito. A fase só pode ser concluída após revisão dos guias contra a implementação e evidências de execução.
