# Fase 24/27 — Prontidão e operação do backend

**Fases:** 24 (itens 404–416) e 27 (itens 446–455)  
**Estado:** 🟡 Endpoints de liveness/readiness e CI implementados; observabilidade e recuperação operacional ainda incompletas.

## Health checks

- `GET /health`: liveness; confirma que o processo FastAPI responde.
- `GET /ready`: readiness; executa `ping` no MongoDB e retorna HTTP 503 sem expor detalhes de conexão quando o banco está indisponível.

Configure o provedor de hospedagem para usar `/health` como liveness e `/ready` como readiness quando o provedor suportar os dois tipos de probe. Não configure `/health` como prova de que o banco está saudável.

## Configuração

As configurações são carregadas por `backend/src/korczak_documents/config/settings.py` e variáveis de ambiente. Em produção, configurar explicitamente:

- `APP_ENV=production`;
- `MONGODB_URI` com credenciais de privilégio mínimo e TLS quando exigido pelo provedor;
- `MONGODB_DATABASE=KZDocs` e `MONGODB_ACCOUNTS_DATABASE=Contas`;
- `FRONTEND_URL` com a origem pública exata;
- `LOG_LEVEL` adequado à operação.

Nunca registrar URI com credenciais nem adicionar segredos ao repositório. Não assumir que um workflow de CI comprova que o serviço remoto está ativo.

## Backup e restauração

A camada de backup usa `mongodump` e `mongorestore`. A restauração aplica `--drop` e deve ser executada apenas em ambiente e banco de destino confirmados: ela substitui coleções abrangidas pelo arquivo. O comando de restauração agora restringe o escopo ao namespace do banco solicitado.

Procedimento operacional recomendado:
1. confirmar ambiente, URI e nome do banco por revisão independente;
2. criar backup antes da janela de manutenção;
3. conferir existência e tamanho não nulo do arquivo;
4. restaurar primeiro em ambiente isolado e executar verificações de integridade;
5. aprovar a janela de recuperação antes de restaurar sobre dados produtivos;
6. registrar horário, responsável, commit, arquivo e resultado sem expor credenciais.

## Pendências operacionais

- [ ] Configurar alertas de erro, latência, saturação e indisponibilidade no provedor.
- [ ] Definir retenção de logs e métricas, com redação de dados sensíveis.
- [ ] Automatizar política de retenção e cópia externa de backups.
- [ ] Fazer exercícios documentados de restauração e definir RPO/RTO aprovados.
- [ ] Documentar rollback, manutenção, rotação de credenciais e resposta a incidentes.
- [ ] Confirmar os health checks e as variáveis no ambiente real.

## Critério de aceite

Não considerar operação/produção concluída até que o provedor esteja configurado, alertas e backups sejam comprovados e um exercício de recuperação seja registrado. O endpoint `/ready` e a documentação não substituem esses resultados.
