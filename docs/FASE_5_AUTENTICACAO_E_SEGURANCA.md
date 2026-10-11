# FASE 5 — AUTENTICAÇÃO E SEGURANÇA

## Escopo oficial

A Fase 5 corresponde aos itens 85–100 da checklist de execução.

## Implementação

- **85 — Criação de contas:** cadastro com normalização de e-mail, validação de senha e criação de sessão.
- **86 — Login:** autenticação por e-mail e senha com resposta genérica para credenciais inválidas.
- **87 — Logout:** encerramento e revogação da sessão no servidor.
- **88 — Sessão:** token opaco, hash persistido, validade de 24 horas, revogação e índice TTL.
- **89 — Rotas:** dependência de usuário atual para rotas protegidas; sessões inválidas, expiradas ou revogadas são recusadas.
- **90 — Senhas:** bcrypt com salt aleatório gerado pela biblioteca; política mínima de 12 caracteres, maiúscula, minúscula, número e especial.
- **91 — Autorização:** verificações são executadas no servidor.
- **92 — Níveis:** papéis `user`, `manager` e `admin`.
- **93 — Documentos:** consultas e mutações verificam o proprietário.
- **94 — Propriedade:** acesso a documento ou pasta pertencente a outro usuário retorna recurso não encontrado.
- **95 — Administração:** operações administrativas verificam papel e não ficam disponíveis a usuários comuns.
- **96 — Segredos:** nenhum segredo operacional é colocado em código; valores de ambiente são separados da implementação.
- **97 — Ambiente:** configurações sensíveis são carregadas por variáveis de ambiente e o banco padrão permanece `KZDocs`.
- **98 — Git:** `scripts/security-secret-scan.sh` verifica a árvore atual e o histórico disponível com `fetch-depth: 0`.
- **99 — Logs:** eventos são registrados sem senha, token, segredo, autorização, cookie, API key ou conteúdo sensível.
- **100 — Testes:** testes unitários, HTTP, integração com MongoDB, isolamento, autorização, logout, política de senha, rate limit, headers e redação de logs.

## Proteções adicionais implementadas

- Rate limit por cliente para cadastro, login e recuperação.
- CORS restrito à origem configurada.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY`.
- `Referrer-Policy: no-referrer`.
- `Permissions-Policy` restritiva.
- HSTS em produção.
- Índice único de e-mail no MongoDB para evitar duplicidade mesmo sob concorrência.
- Respostas de usuário nunca incluem `password_hash`.

## CI

O workflow `.github/workflows/backend-ci.yml` executa:

1. checkout do histórico completo e varredura de segredos na árvore e no histórico Git;
2. instalação do Python 3.12 e inicialização de MongoDB 8;
3. instalação das MongoDB Database Tools, usadas nos testes de backup e restauração;
4. instalação do backend com as dependências opcionais de teste;
5. execução de `pytest -q`, incluindo testes unitários, contratos HTTP e integração com MongoDB.

A execução do commit `86d95305bd1db6b3a2df71cb48097c3586cea0e5` passou. O CI não substitui a revisão final de segurança, a verificação dos segredos de produção ou a homologação operacional.

## Correções de falhas do Actions

O teste de segurança tinha sido gravado com sequências literais `\\n`, além de possuir uma chamada incompatível com a função importada. O arquivo foi reescrito como Python válido e o teste de rate limit passou a testar o fluxo HTTP real.

O pipeline de backend e a varredura de segredos passaram no commit `86d95305bd1db6b3a2df71cb48097c3586cea0e5`. Isso comprova a suíte automatizada naquele commit, mas não substitui a revisão final de segurança, a verificação dos segredos e a homologação da configuração de produção. A fase permanece parcialmente validada até esses critérios serem documentados.
