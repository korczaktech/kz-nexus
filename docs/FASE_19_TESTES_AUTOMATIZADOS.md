# Fase 19 — Testes Automatizados

**Itens:** 313–327  
**Estado:** 🟡 Parcial — pipelines principais existentes e verdes; cobertura funcional e critérios de cobertura ainda incompletos.

## Cobertura existente

O frontend usa Vitest para testar o editor, formatos, persistência, cliente HTTP e integrações com serviços. Os testes de versão agora cobrem o quarto componente das versões de release (`0.0.0.N`), evitando regressões no comparador de atualização.

O backend usa pytest com MongoDB 8 no CI e cobre contratos HTTP, autenticação, autorização, documentos, pesquisa, auditoria, integridade de eventos, segurança, backup/restauração e persistência de integração.

- [x] Testar o cabeçalho Bearer para sessões autenticadas.
- [x] Testar a remoção do token local após resposta HTTP 401.
- [x] Testar mensagens seguras para respostas não JSON.
- [x] Testar codificação de identificadores em URLs.
- [x] Testar comparação numérica de versões de release, incluindo o quarto componente.
- [x] Executar a suíte pytest com MongoDB 8 no CI.
- [x] Executar varredura de segredos na árvore e no histórico Git.
- [x] Executar testes nativos Android e gerar APK de depuração no CI.
- [x] Executar testes/build Desktop e empacotar Windows, macOS, Linux AppImage e DEB no CI.
- [x] Executar testes frontend, TypeScript/build e deploy Web/PWA no CI.

## Evidências recentes

- **Frontend/Web:** [execução 38165161525](https://github.com/korczaktech/kz-nexus/actions/runs/38165161525) — testes, build, ícones PWA e deploy passaram.
- **Backend:** [execução 38164847983](https://github.com/korczaktech/kz-nexus/actions/runs/38164847983) — pytest com MongoDB 8 e varredura de segredos passaram.
- **Desktop:** [execução 38164998938](https://github.com/korczaktech/kz-nexus/actions/runs/38164998938) — testes/build e pacotes Windows, macOS, AppImage e DEB passaram.
- **Android:** [execução 38164937626](https://github.com/korczaktech/kz-nexus/actions/runs/38164937626) — testes nativos e build APK de depuração passaram.

## Pendências antes de concluir a fase

- [ ] Substituir todas as asserções de presença/constantes restantes por testes de comportamento quando aplicável.
- [ ] Cobrir fluxos completos de login, criação/edição/restauração de documentos e permissões com estados de erro.
- [ ] Adicionar testes de regressão para sincronização offline e resolução de conflitos.
- [ ] Definir e medir uma meta mínima de cobertura para módulos críticos.
- [ ] Executar e registrar testes manuais de ponta a ponta nas seis plataformas.
- [ ] Confirmar o build iOS e validar a experiência em dispositivos reais.
- [ ] Garantir que o release final dependa dos testes críticos e guardar evidências reproduzíveis.

## Critério de aceite

Não concluir esta fase até que os fluxos críticos tenham testes de comportamento úteis, as execuções de CI estejam verdes e os resultados sejam reproduzíveis. Contagem de testes ou asserts isolados não substitui cobertura significativa; CI verde não substitui homologação em dispositivos reais.
