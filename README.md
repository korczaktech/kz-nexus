# Korczak Nexus

Sistema multiplataforma de gestão documental.

## Plataformas

- Web / GitHub Pages
- Windows
- macOS
- Linux
- Android
- iOS

## Estado geral das fases

| Fase | Nome | Itens | Estado |
|---:|---|---:|---|
| 0 | Definição e Congelamento do Projeto | 1–16 | 🟢 Concluída |
| 1 | Preparação do Ambiente | 17–28 | 🟢 Concluída |
| 2 | Estrutura do Código | 29–44 | 🟢 Concluída |
| 3 | Banco de Dados | 45–59 | 🟢 Concluída |
| 4 | Backend / API | 60–84 | 🟢 Concluída |
| 5 | Autenticação e Segurança | 85–100 | 🟢 Concluída |
| 6 | Interface Web | 101–114 | 🟢 Concluída |
| 7 | Telas Principais | 115–135 | 🟢 Concluída |
| 8 | Editor de Documentos | 136–153 | 🟢 Concluída |
| 9 | Organização | 154–167 | 🟢 Concluída |
| 10 | Pesquisa | 168–180 | 🟢 Concluída |
| 11 | Usuários, Grupos e Permissões | 181–194 | 🟢 Concluída |
| 12 | Auditoria e Histórico | 195–204 | 🟢 Concluída |
| 13 | Integração Frontend ↔ Backend | 205–222 | 🟢 Concluída |
| 14 | Responsividade e Acessibilidade | 223–238 | ⚪ Planejada |
| 15 | Versão Web / GitHub Pages | 239–252 | ⚪ Planejada |
| 16 | Aplicação Desktop | 253–274 | ⚪ Planejada |
| 17 | Aplicação Mobile | 275–295 | ⚪ Planejada |
| 18 | Sincronização Multiplataforma | 296–312 | ⚪ Planejada |
| 19 | Testes Automatizados | 313–327 | ⚪ Planejada |
| 20 | Testes Manuais | 328–346 | ⚪ Planejada |
| 21 | Testes das 6 Plataformas | 347–375 | ⚪ Planejada |
| 22 | Desempenho | 376–388 | ⚪ Planejada |
| 23 | Segurança Final | 389–403 | ⚪ Planejada |
| 24 | Publicação do Backend | 404–416 | ⚪ Planejada |
| 25 | Publicação das Aplicações | 417–428 | ⚪ Planejada |
| 26 | Documentação | 429–445 | ⚪ Planejada |
| 27 | Operação | 446–455 | ⚪ Planejada |
| 28 | Homologação | 456–468 | ⚪ Planejada |
| 29 | Release Final | 469–479 | ⚪ Planejada |
| 30 | Conclusão Oficial | 480–503 | ⚪ Planejada |

> O estado acima representa o estado documentado e validado no repositório. Uma fase planejada não deve ser considerada concluída apenas porque sua estrutura foi criada.

# Fases do projeto

## Fase 0 — Definição e Congelamento do Projeto
**Itens:** 1–16  
**Objetivo:** transformar o Korczak Nexus em uma especificação fechada antes da implementação.

- escopo definitivo;
- funcionalidades obrigatórias e futuras;
- seis plataformas e comportamento comum;
- particularidades por plataforma;
- identidade visual;
- nomenclatura;
- regras de negócio;
- permissões;
- modelos de documentos, usuários, pastas, versões e auditoria;
- documentação oficial.

**Estado:** 🟢 Concluída.

## Fase 1 — Preparação do Ambiente
**Itens:** 17–28  
**Objetivo:** criar um ambiente reproduzível de desenvolvimento, testes e empacotamento.

- repositório e branch;
- estrutura inicial;
- .gitignore e ambiente;
- separação desenvolvimento/produção;
- Python;
- frontend;
- testes;
- empacotamento desktop;
- empacotamento mobile;
- documentação de instalação;
- validação em ambiente limpo.

**Estado:** 🟢 Concluída.

## Fase 2 — Estrutura do Código
**Itens:** 29–44  
**Objetivo:** estabelecer a organização interna definitiva.

- aplicacao-web, api, testes, documentacao e scripts;
- componentes;
- serviços;
- repositórios;
- modelos;
- rotas;
- validações;
- configurações;
- erros centralizados;
- logs;
- ambientes de desenvolvimento e produção.

**Estado:** 🟢 Concluída.

## Fase 3 — Banco de Dados
**Itens:** 45–59  
**Objetivo:** criar a persistência oficial e garantir integridade e recuperação.

- MongoDB e banco Korczak Nexuss;
- usuários, documentos, versões, pastas, etiquetas, sessões, eventos e notificações;
- índices;
- referências;
- integridade;
- dados iniciais;
- backup;
- recuperação.

**Estado:** 🟢 Concluída.

## Fase 4 — Backend / API
**Itens:** 60–84  
**Objetivo:** disponibilizar a API de negócio para Web, desktop e mobile.

- aplicação e /api/v1/;
- health check;
- autenticação e sessões;
- usuários;
- documentos;
- versões;
- pastas;
- etiquetas;
- favoritos;
- recentes;
- lixeira;
- pesquisa;
- grupos;
- permissões;
- auditoria;
- notificações;
- validação;
- respostas;
- erros;
- logs;
- testes dos endpoints.

**Estado:** 🟢 Concluída.

## Fase 5 — Autenticação e Segurança
**Itens:** 85–100  
**Objetivo:** proteger identidade, sessões, dados e operações administrativas.

- contas, login e logout;
- sessões;
- proteção de rotas;
- senhas seguras;
- autorização no servidor;
- níveis de acesso;
- propriedade de documentos;
- operações administrativas;
- variáveis de ambiente;
- revisão de segredos e histórico Git;
- proteção de logs;
- testes de segurança.

**Estado:** 🟢 Concluída.

## Fase 6 — Interface Web
**Itens:** 101–114  
**Objetivo:** construir a base visual e interativa da aplicação.

- login;
- sessão e recuperação;
- layout;
- menu lateral;
- cabeçalho;
- conteúdo;
- navegação;
- modais;
- notificações;
- tabelas;
- carregamento;
- estados vazios;
- erros;
- feedback.

**Estado:** 🟢 Concluída.

## Fase 7 — Telas Principais
**Itens:** 115–135  
**Objetivo:** transformar a interface base em uma aplicação documental funcional.

- dashboard;
- documentos;
- visualização;
- editor;
- criação e edição;
- histórico e versões;
- pastas;
- favoritos;
- recentes;
- lixeira;
- pesquisa e pesquisa avançada;
- perfil;
- usuários;
- grupos;
- permissões;
- auditoria;
- administração;
- configurações.

**Estado:** 🟢 Concluída.

## Fase 8 — Editor de Documentos
**Itens:** 136–153  
**Objetivo:** consolidar o editor como ferramenta real de criação, edição e preservação.

- editor e barra de ferramentas;
- criação e edição;
- salvamento e estado do salvamento;
- desfazer e refazer;
- saída segura;
- leitura;
- novas versões;
- histórico;
- restauração;
- proteção contra perda;
- testes de documentos pequenos e grandes;
- interrupção durante salvamento;
- abertura simultânea.

**Estado:** 🟢 Concluída.

## Fase 9 — Organização
**Itens:** 154–167  
**Objetivo:** completar a organização documental.

- criação, renomeação, exclusão lógica e restauração de pastas;
- movimentação de documentos entre pastas;
- criação, aplicação e remoção de etiquetas;
- favoritos;
- registro e consulta de documentos recentes;
- lixeira de documentos;
- restauração;
- exclusão definitiva.

**Documentação:** [Fase 9](docs/FASE_9_ORGANIZACAO.md)

**Estado:** 🟢 Concluída.

## Fase 10 — Pesquisa
**Itens:** 168–180  
**Objetivo:** criar pesquisa completa e escalável.

- nome;
- descrição;
- conteúdo quando aplicável;
- pasta;
- etiqueta;
- proprietário;
- estado;
- período;
- filtros combinados;
- ordenação;
- paginação;
- nenhuma ocorrência;
- grandes volumes.

**Documentação:** [Fase 10](docs/FASE_10_PESQUISA.md)

**Estado:** 🟢 Concluída.

## Fase 11 — Usuários, Grupos e Permissões
**Itens:** 181–194  
**Objetivo:** completar identidade, grupos e autorização.

- criar, editar e desativar usuários;
- grupos e membros;
- permissões;
- permissões documentais e de áreas;
- perfis administrador, gestor e usuário;
- acesso permitido;
- acesso negado;
- tentativa direta pela API.

**Estado:** ⚪ Planejada.

**Documentação:** [Fase 11](docs/FASE_11_USUARIOS_GRUPOS_PERMISSOES.md)

**Estado:** 🟢 Concluída.

## Fase 12 — Auditoria e Histórico
**Itens:** 195–204  
**Objetivo:** garantir rastreabilidade.

- criação;
- edição;
- exclusão;
- restauração;
- permissões;
- alterações administrativas;
- autenticações relevantes;
- consulta;
- filtros;
- integridade dos registros.

**Estado:** ⚪ Planejada.

## Fase 12 — Auditoria e Histórico
**Itens:** 195–204  
**Objetivo:** garantir rastreabilidade das operações e integridade dos registros de auditoria.

- criação, edição, exclusão e restauração;
- alterações de permissões;
- alterações administrativas;
- autenticações relevantes;
- consulta e filtros;
- integridade criptográfica e detecção de adulteração;
- redaction de dados sensíveis.

**Documentação:** [Fase 12](docs/FASE_12_AUDITORIA_E_HISTORICO.md)

**Estado:** 🟢 Concluída.

## Fase 13 — Integração Frontend ↔ Backend
**Itens:** 205–222  
**Objetivo:** garantir que toda ação da interface use a aplicação real.

- login;
- dashboard;
- documentos;
- editor;
- pastas;
- favoritos;
- recentes;
- lixeira;
- pesquisa;
- usuários;
- grupos;
- permissões;
- auditoria;
- configurações;
- eliminação de dados fictícios;
- eliminação de botões sem função;
- comportamento real;
- tratamento de erros da API.

**Estado:** ⚪ Planejada.

## Fase 14 — Responsividade e Acessibilidade
**Itens:** 223–238  
**Objetivo:** garantir qualidade em diferentes telas e condições de acesso.

- desktop;
- notebook;
- tablet;
- celulares;
- orientação vertical e horizontal;
- teclado;
- foco;
- leitores de tela quando aplicável;
- contraste;
- textos;
- toque;
- menus;
- tabelas;
- editor.

**Estado:** ⚪ Planejada.

## Fase 15 — Versão Web / GitHub Pages
**Itens:** 239–252  
**Objetivo:** preparar e publicar a versão Web.

- build de produção;
- GitHub Pages;
- domínio quando houver;
- base/path;
- comunicação segura com API;
- proteção de informações privadas;
- testes de login, documentos, editor e pesquisa;
- todas as rotas;
- recarregamento;
- publicação.

**Estado:** ⚪ Planejada.

## Fase 16 — Aplicação Desktop
**Itens:** 253–274  
**Objetivo:** disponibilizar clientes Windows, macOS e Linux.

- tecnologia definitiva;
- aplicações Windows/macOS/Linux;
- ícone, nome e informações;
- janela e inicialização;
- API e armazenamento local;
- instaladores/pacotes;
- instalação;
- atualização;
- desinstalação;
- login;
- documentos;
- editor;
- encerramento;
- execução sem privilégios administrativos.

**Estado:** 🟢 Concluída.

## Fase 17 — Aplicação Mobile
**Itens:** 275–295  
**Objetivo:** disponibilizar Android e iOS.

- tecnologia definitiva;
- Android e iOS;
- toque;
- menus;
- editor;
- listas;
- pesquisa;
- notificações quando previstas;
- armazenamento local;
- sessão;
- rotação;
- telas;
- teclado;
- perda e recuperação de conexão;
- APK/AAB;
- pacote iOS;
- instalação;
- atualização;
- preparação para lojas.

**Estado:** ⚪ Planejada.

## Fase 18 — Sincronização Multiplataforma
**Itens:** 296–312  
**Objetivo:** manter o mesmo estado de dados entre dispositivos.

- servidor como fonte central;
- identificadores;
- versões;
- documentos;
- pastas;
- favoritos;
- configurações globais;
- sessões conforme política;
- perda e reconexão;
- alterações concorrentes;
- prevenção de sobrescrita silenciosa;
- testes entre computador, celular, Web e desktop;
- múltiplos dispositivos.

**Estado:** ⚪ Planejada.

## Fase 19 — Testes Automatizados
**Itens:** 313–327  
**Objetivo:** ampliar a cobertura automática e impedir regressões.

- modelos;
- validações;
- serviços;
- repositórios;
- rotas;
- autenticação;
- permissões;
- documentos;
- versões;
- pesquisa;
- lixeira;
- auditoria;
- frontend;
- integração;
- regressão.

**Estado:** ⚪ Planejada.

## Fase 20 — Testes Manuais
**Itens:** 328–346  
**Objetivo:** validar os fluxos completos como usuário real.

- conta;
- entrada e saída;
- documentos;
- edição;
- salvamento;
- versões;
- restauração;
- movimentação;
- favoritos;
- pesquisa;
- exclusão;
- administração;
- permissões;
- auditoria;
- erros;
- rede interrompida;
- sessão expirada.

**Estado:** ⚪ Planejada.

## Fase 21 — Testes das 6 Plataformas
**Itens:** 347–375  
**Objetivo:** validar todos os ambientes oficiais.

- Web: Chrome, Firefox, Edge e Safari quando aplicável;
- Windows: instalação, execução, login, documentos e atualização;
- macOS: instalação, execução, login, documentos e atualização;
- Linux: instalação, execução, login, documentos e atualização;
- Android: instalação, login, documentos, editor e sincronização;
- iOS: instalação, login, documentos, editor e sincronização.

**Estado:** ⚪ Planejada.

## Fase 22 — Desempenho
**Itens:** 376–388  
**Objetivo:** medir e otimizar o desempenho.

- carregamento;
- login;
- abertura;
- pesquisa;
- grandes volumes;
- paginação;
- consultas;
- dados transferidos;
- frontend;
- imagens/recursos;
- memória;
- CPU;
- dispositivos de baixo desempenho.

**Estado:** ⚪ Planejada.

## Fase 23 — Segurança Final
**Itens:** 389–403  
**Objetivo:** executar a revisão de segurança antes da produção.

- autenticação;
- autorização;
- sessões;
- API;
- banco;
- ambiente;
- CORS;
- exposição de informações;
- logs;
- arquivos públicos;
- credenciais;
- chaves/tokens no histórico;
- acessos indevidos;
- manipulação de requisições;
- correção das vulnerabilidades.

**Estado:** ⚪ Planejada.

## Fase 24 — Publicação do Backend
**Itens:** 404–416  
**Objetivo:** publicar e validar a API em produção.

- ambiente;
- MongoDB;
- variáveis;
- hospedagem;
- publicação;
- health check;
- banco;
- autenticação;
- documentos;
- APIs;
- logs;
- monitoramento;
- backup.

**Estado:** ⚪ Planejada.

## Fase 25 — Publicação das Aplicações
**Itens:** 417–428  
**Objetivo:** preparar a distribuição das aplicações.

- Web;
- Windows;
- macOS;
- Linux;
- Android;
- iOS;
- páginas de download;
- instalação;
- atualização;
- versão inicial;
- versionamento;
- registro da versão publicada.

**Estado:** ⚪ Planejada.

## Fase 26 — Documentação
**Itens:** 429–445  
**Objetivo:** documentar o produto para desenvolvimento, operação e uso.

- documentação geral;
- arquitetura;
- frontend;
- backend;
- API;
- banco;
- autenticação;
- permissões;
- editor;
- implantação;
- manutenção;
- desenvolvedores;
- usuário;
- administrador;
- instalação desktop;
- mobile;
- solução de problemas.

**Estado:** ⚪ Planejada.

## Fase 27 — Operação
**Itens:** 446–455  
**Objetivo:** estabelecer a rotina de operação contínua.

- backup;
- atualização;
- monitoramento;
- correção de erros;
- revisão de segurança;
- limpeza;
- manutenção do banco;
- controle de versões;
- publicação;
- rollback.

**Estado:** ⚪ Planejada.

## Fase 28 — Homologação
**Itens:** 456–468  
**Objetivo:** validar a versão candidata antes do lançamento.

- ambiente final;
- fluxos principais;
- permissões;
- dispositivos;
- plataformas;
- aparência;
- desempenho;
- segurança;
- sincronização;
- registro de problemas;
- correções;
- nova execução dos testes;
- aprovação da versão candidata.

**Estado:** ⚪ Planejada.

## Fase 29 — Release Final
**Itens:** 469–479  
**Objetivo:** realizar o lançamento oficial.

- versão 1.0.0;
- tag Git;
- release;
- Web;
- desktop;
- mobile;
- documentação;
- backup inicial;
- changelog;
- data de lançamento;
- funcionamento em produção.

**Estado:** ⚪ Planejada.

## Fase 30 — Conclusão Oficial
**Itens:** 480–503  
**Objetivo:** comprovar a conclusão real do projeto.

### Verificações

- funcionalidades;
- ausência de botões sem função;
- ausência de telas fictícias;
- frontend ↔ backend;
- backend ↔ banco;
- autenticação;
- permissões;
- versionamento;
- histórico;
- auditoria;
- pesquisa;
- lixeira;
- sincronização.

### Plataformas

- Web;
- Windows;
- macOS;
- Linux;
- Android;
- iOS.

### Operação final

- documentação;
- segurança;
- backup;
- publicação;
- operação.

O projeto só deve ser considerado 100% concluído quando os itens **1–503** estiverem validados.

**Estado:** ⚪ Planejada.

# Estrutura principal

- 'aplicacao-web/' — raiz formal da aplicação Web.
- 'api/' — raiz formal da API.
- 'backend/' — implementação da API.
- 'frontend/' — implementação da interface Web.
- 'desktop/' — configuração do cliente desktop.
- 'mobile/' — configuração dos clientes mobile.
- 'testes/' — raiz formal da estratégia de testes.
- 'documentacao/' — raiz formal da documentação.
- 'scripts/' — raiz formal de automações.
- 'docs/' — documentação detalhada das fases.

# Documentação detalhada

- [Fase 0](docs/FASE_0_DEFINICAO_E_CONGELAMENTO.md)
- [Fase 1](docs/FASE_1_PREPARACAO_DO_AMBIENTE.md)
- [Fase 2](docs/FASE_2_ESTRUTURA_DO_CODIGO.md)
- [Fase 3](docs/FASE_3_BANCO_DE_DADOS.md)
- [Fase 4](docs/FASE_4_BACKEND_API.md)
- [Fase 5](docs/FASE_5_AUTENTICACAO_E_SEGURANCA.md)
- [Fase 6](docs/FASE_6_INTERFACE_WEB.md)
- [Fase 7](docs/FASE_7_TELAS_PRINCIPAIS.md)
- [Fase 8](docs/FASE_8_EDITOR_DE_DOCUMENTOS.md)
- Fase 8 — Editor de Documentos
- Fase 9 — Organização
- Fase 10 — Pesquisa
- Fase 11 — Usuários, Grupos e Permissões
- Fase 12 — Auditoria e Histórico
- Fase 13 — Integração Frontend ↔ Backend
- Fase 14 — Responsividade e Acessibilidade
- Fase 15 — Versão Web / GitHub Pages
- Fase 16 — Aplicação Desktop
- Fase 17 — Aplicação Mobile
- Fase 18 — Sincronização Multiplataforma
- Fase 19 — Testes Automatizados
- Fase 20 — Testes Manuais
- Fase 21 — Testes das 6 Plataformas
- Fase 22 — Desempenho
- Fase 23 — Segurança Final
- Fase 24 — Publicação do Backend
- Fase 25 — Publicação das Aplicações
- Fase 26 — Documentação
- Fase 27 — Operação
- Fase 28 — Homologação
- Fase 29 — Release Final
- Fase 30 — Conclusão Oficial

# Critério global de conclusão

O Korczak Nexus não deve ser considerado concluído somente porque o código foi escrito.

O critério final é a validação dos **503 itens da checklist oficial**, cobrindo:

**Planejamento → Ambiente → Estrutura → Banco → Backend → Segurança → Interface → Funcionalidades → Integração → Responsividade → Web → Desktop → Mobile → Sincronização → Testes → Segurança final → Produção → Documentação → Homologação → Release → Operação.**

**Projeto:** Korczak Nexus  
**Checklist total:** 503 itens  
**Fases:** 30  
**Plataformas:** 6  
