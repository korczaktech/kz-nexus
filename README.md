# Korczak Nexus

Sistema de gestão documental da Korczak Technologies. O repositório contém a aplicação Web (React + TypeScript + Vite), uma API Python/FastAPI, o cliente Desktop baseado em Electron e a base de clientes mobile/PWA.

> **Estado honesto do projeto:** a Web/PWA, a suíte do backend, os testes Android, o build iOS para simulador e os empacotamentos Desktop passaram em CI. Isso **não** significa que o produto inteiro esteja 100% concluído: a validação manual em dispositivos reais, a disponibilidade da API em produção, a sincronização completa, a publicação final e a homologação ainda precisam de evidências próprias.

## Estado atual — resumo executivo

- **Web:** interface implementada com autenticação/cadastro/recuperação, navegação documental, editor, pastas, favoritos, recentes, lixeira, pesquisa, perfil, administração, grupos, permissões, auditoria e configurações. O cliente HTTP usa a API configurada em `VITE_API_BASE_URL` (padrão do código: `https://kzdoc.onrender.com`).
- **PWA:** manifesto, service worker, ícones SVG e geração de PNG no pipeline de Pages. O manifesto define instalação como aplicativo Web; isso não equivale a aplicativos nativos publicados.
- **Integração:** o frontend contém chamadas reais para os endpoints de autenticação, documentos, versões, pastas, pesquisa, usuários, grupos, permissões e auditoria. Foi corrigida a comparação de versões para considerar também o quarto componente (`0.0.0.N`), com testes de regressão adicionados. A existência das chamadas não substitui testes completos de ponta a ponta.
- **Publicação Web:** o workflow `.github/workflows/pages.yml` passou no commit `bf804b12f930255b453e72fa821c2a61a9d46e29`, incluindo testes do frontend, TypeScript/build, ícones PWA e deploy do GitHub Pages ([execução 38164998952](https://github.com/korczaktech/kz-nexus/actions/runs/38164998952)). O run inclui a correção de comparação do quarto componente da versão. O sucesso de um run não garante disponibilidade contínua do site ou API.
- **Testes:** Vitest cobre editor, formatos, persistência, serviços e integrações. O backend possui CI com MongoDB 8, suíte pytest de unidade/integração e varredura de segredos; a execução do commit `ae2d27fcfb468100baf401ab6047833603b36985` passou ([execução 38164847983](https://github.com/korczaktech/kz-nexus/actions/runs/38164847983)). A cobertura de interface e os cenários manuais ainda precisam ser ampliados.
- **Desktop:** testes e build passaram, e o CI gerou os pacotes Windows NSIS (`.exe`), macOS DMG (`.dmg`), Linux AppImage e DEB no commit `bf804b12f930255b453e72fa821c2a61a9d46e29` ([execução 38164998938](https://github.com/korczaktech/kz-nexus/actions/runs/38164998938)). Isso comprova o empacotamento, não a homologação funcional manual em cada sistema.
- **Mobile:** há configuração Capacitor e projetos nativos. O CI Android passou nos testes Kotlin e gerou um APK de depuração ([execução 38164937626](https://github.com/korczaktech/kz-nexus/actions/runs/38164937626)); o build iOS para simulador e a validação do projeto também passaram ([execução 38165274452](https://github.com/korczaktech/kz-nexus/actions/runs/38165274452)). Instalação/uso em aparelhos reais, sincronização e publicação ainda precisam de validação completa.
- **API/backend:** existe implementação FastAPI com módulos de autenticação/segurança, rotas, serviços, repositórios, MongoDB, auditoria e testes. A saúde atual do serviço hospedado, os backups e a operação de produção não foram confirmados nesta atualização.

## Legenda de status

- 🟢 **Concluída:** entregáveis da fase presentes e critérios principais aceitos com evidências.
- 🟡 **Parcial / validação pendente:** há código ou configuração, mas ainda faltam testes, homologação, operação ou evidências para considerar a fase concluída.
- ⚪ **Pendente:** fase ainda não iniciada de forma suficiente para ser considerada implementada.

## Estado das 31 fases (itens 1–503)

| Fase | Itens | Escopo | Estado atual |
|---:|---:|---|---|
| 0 | 1–16 | Definição e congelamento do projeto | 🟢 Concluída documentalmente |
| 1 | 17–28 | Preparação do ambiente | 🟢 Estrutura e automação-base presentes |
| 2 | 29–44 | Estrutura do código | 🟢 Estrutura principal presente |
| 3 | 45–59 | Banco de dados | 🟡 Backup/restauração restringidos ao namespace solicitado; ensaio operacional de recuperação pendente |
| 4 | 60–84 | Backend / API | 🟡 API implementada; falta comprovação completa dos contratos e operação de produção |
| 5 | 85–100 | Autenticação e segurança | 🟡 Política de senha também limita entradas a 72 bytes UTF-8 para evitar truncamento bcrypt; auditoria final pendente |
| 6 | 101–114 | Interface Web | 🟡 Interface presente; validação de todos os estados e fluxos pendente |
| 7 | 115–135 | Telas principais | 🟡 Áreas principais existem; aceite funcional completo pendente |
| 8 | 136–153 | Editor de documentos | 🟡 Editor e testes de formatos existem; homologação de fluxos e formatos pendente |
| 9 | 154–167 | Organização | 🟡 Funções de pastas/favoritos/recentes/lixeira existem; validação ponta a ponta pendente |
| 10 | 168–180 | Pesquisa | 🟡 Pesquisa rápida/avançada implementada no cliente; validação de filtros e volume pendente |
| 11 | 181–194 | Usuários, grupos e permissões | 🟡 Código e documentação existem; repetir e registrar os testes de autorização |
| 12 | 195–204 | Auditoria e histórico | 🟡 Código e documentação existem; comprovar integridade e isolamento com testes reproduzíveis |
| 13 | 205–222 | Integração frontend ↔ backend | 🟡 Cliente HTTP e fluxos integrados existem; validar fluxos completos com backend real |
| 14 | 223–238 | Responsividade e acessibilidade | 🟡 Foco visível, skip link, redução de movimento e alto contraste inicial; testes manuais pendentes |
| 15 | 239–252 | Web / GitHub Pages | 🟡 Pipeline de build/deploy passou; confirmar disponibilidade real, rotas e fluxos em produção |
| 16 | 253–274 | Aplicação Desktop | 🟡 Testes e pacotes Windows/macOS/Linux (AppImage + DEB) passaram no CI; testes manuais e release pública pendentes |
| 17 | 275–295 | Aplicação Mobile | 🟡 CI Android e build iOS para simulador passaram; validação em dispositivos reais, sincronização e experiência manual pendentes |
| 18 | 296–312 | Sincronização multiplataforma | 🟡 Filas PWA/Android preservam operações com falha; replay cloud e resolução de conflitos ainda pendentes |
| 19 | 313–327 | Testes automatizados | 🟡 CI frontend passou e testes de API foram adicionados; ampliar cobertura e validar backend no CI |
| 20 | 328–346 | Testes manuais | ⚪ Falta executar e registrar os roteiros de aceite completos |
| 21 | 347–375 | Testes das seis plataformas | ⚪ Falta matriz de evidências Web, Windows, macOS, Linux, Android e iOS |
| 22 | 376–388 | Desempenho | 🟡 Smoke test k6 de baixa carga adicionado; baseline representativa e otimização pendentes |
| 23 | 389–403 | Segurança final | ⚪ Falta revisão final, correção de achados e evidência de aprovação |
| 24 | 404–416 | Publicação do backend | 🟡 Endpoint /ready agora verifica MongoDB; configuração real, alertas e disponibilidade ainda precisam de evidências |
| 25 | 417–428 | Publicação das aplicações | 🟡 Workflow exige keystore e valida assinatura APK; release assinada ainda não foi executada |
| 26 | 429–445 | Documentação | 🟡 Documentação técnica e de fases existe; completar guias de usuário, administrador, instalação e solução de problemas |
| 27 | 446–455 | Operação | ⚪ Falta formalizar e testar monitoramento, backup, rollback, manutenção e resposta a incidentes |
| 28 | 456–468 | Homologação | ⚪ Falta executar homologação integral e registrar aprovação |
| 29 | 469–479 | Release final | ⚪ Falta validar versão candidata e release 1.0.0 em todas as plataformas |
| 30 | 480–503 | Conclusão oficial | ⚪ Só concluir após validar e documentar todos os itens 1–503 |

**Importante:** fases com documentação ou estrutura de código não são automaticamente consideradas concluídas. Os status acima são conservadores: quando não há evidência reproduzível de aceite, a fase permanece parcial ou pendente.

## O que está implementado na aplicação Web

Com base na implementação atual em `frontend/src/App.tsx` e `frontend/src/services/api.ts`:

- Login, cadastro, recuperação de acesso e persistência do token de sessão.
- Seleção inicial de armazenamento local ou Google Drive.
- Navegação para início, documentos, pastas, favoritos, recentes, lixeira, pesquisa, perfil e configurações.
- Visualização/edição, salvamento e versões de documentos.
- Chamadas de API para documentos, pastas, favoritos, recentes, lixeira, pesquisa rápida/avançada, usuários, grupos, permissões e auditoria.
- Tratamento centralizado de erros HTTP, timeout e falhas de conexão; remoção do token quando a API responde 401.
- Interface PWA com manifesto, service worker e recursos de ícone.
- Ajustes iniciais de acessibilidade: foco de teclado visível, link para pular a navegação, respeito a `prefers-reduced-motion` e suporte inicial a `forced-colors`.

### Limitações e pontos ainda não confirmados na Web

- Não foi possível confirmar nesta revisão a disponibilidade em tempo real do domínio e do backend; o sucesso do workflow comprova a execução do pipeline naquele commit, não a saúde contínua dos serviços.
- Acessibilidade e responsividade ainda precisam de testes manuais com teclado, leitor de tela, contraste, tamanhos de tela e orientação.
- A cobertura dos testes de interface precisa ser baseada em comportamento real; alguns testes existentes apenas verificam listas/constantes e não validam interações reais.
- A suíte de testes do cliente API existe, mas precisa permanecer verde no CI do commit atual e crescer para fluxos completos.
- A seleção de armazenamento local/Google Drive não deve ser interpretada como sincronização geral entre todos os dispositivos.
- Não considerar funções como OCR, assinatura, backup de usuário ou outras operações como disponíveis se não houver fluxo implementado, endpoint ativo e teste de aceite.

## Verificação contínua

Workflows de validação:
- [Deploy GitHub Pages](.github/workflows/pages.yml) — testes frontend, TypeScript/build e publicação Web/PWA.
- [Backend CI](.github/workflows/backend-ci.yml) — pytest com MongoDB 8 e varredura de segredos no histórico.
- [Android CI](.github/workflows/android-ci.yml) — testes nativos e build do APK de depuração; a execução `38164937626` passou.
- [Desktop CI e empacotamento](.github/workflows/desktop.yml) — testes e pacotes Windows/macOS/Linux (AppImage + DEB); a execução `38164998938` passou.
- [Build iOS](.github/workflows/ios.yml) — validação do projeto e build para simulador.
- [Release multiplataforma](.github/workflows/release.yml) — APK assinado e pacotes Desktop; requer secrets Android válidos.

No último run consultado, os passos abaixo terminaram com sucesso:

1. instalação das dependências;
2. verificação de paridade da Fase 1;
3. testes do frontend (`npm test`);
4. TypeScript e build de produção (`npm run build`);
5. geração e verificação dos ícones PWA;
6. upload do artefato e etapa de deploy do GitHub Pages.

Links úteis:
- [Histórico do CI](https://github.com/korczaktech/kz-nexus/actions)
- [Fase 14 — Responsividade e acessibilidade](docs/FASE_14_RESPONSIVIDADE_ACESSIBILIDADE.md)
- [Fase 18 — Sincronização multiplataforma](docs/FASE_18_SINCRONIZACAO_MULTIPLATAFORMA.md)
- [Fase 19 — Testes automatizados](docs/FASE_19_TESTES_AUTOMATIZADOS.md)
- [Fase 22 — Desempenho e carga](docs/FASE_22_DESEMPENHO_E_CARGA.md)
- [Fases 24/27 — Operação e prontidão](docs/FASE_24_OPERACAO_E_PRONTIDAO.md)
- [Fase 25 — Releases](docs/FASE_25_RELEASES.md)
- [Fase 11 — Usuários, grupos e permissões](docs/FASE_11_USUARIOS_GRUPOS_PERMISSOES.md)
- [Fase 12 — Auditoria e histórico](docs/FASE_12_AUDITORIA_E_HISTORICO.md)
- [Fase 13 — Integração frontend/backend](docs/FASE_13_INTEGRACAO_FRONTEND_BACKEND.md)

## Estrutura principal

- `frontend/` — aplicação Web React + TypeScript + Vite.
- `backend/` — API FastAPI, serviços, repositórios, modelos e persistência.
- `api/` — documentação/raiz formal da API.
- `desktop/` — cliente Electron e configuração de empacotamento.
- `mobile/` — configuração Capacitor.
- `android/` e `ios/` — projetos nativos, quando presentes no branch.
- `backend/tests/` — testes de backend.
- `frontend/src/**/*.test.*` — testes de frontend.
- `docs/` — documentação das fases e critérios de aceite.
- `scripts/` — validações, segurança e ferramentas operacionais.
- `.github/workflows/` — CI, publicação Web, Desktop, iOS e releases.

## Critério para declarar 100%

O Korczak Nexus só estará **100% concluído** quando os itens **1–503** tiverem evidência de implementação e aceite; os fluxos críticos passarem em testes automatizados e manuais; a API e o banco estiverem validados em produção; as seis plataformas forem testadas; a sincronização e a recuperação forem comprovadas; e a release final estiver publicada e documentada. Até lá, este README deve continuar distinguindo implementação parcial de conclusão verificada.
