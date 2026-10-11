# Fase 19 — Testes Automatizados

**Itens:** 313–327  
**Estado:** 🟡 Em andamento

## Cobertura existente

O frontend executa os testes Vitest no workflow de publicação. O repositório já contém testes para o editor, formatos de documentos, armazenamento e integrações com serviços Google.

Nesta etapa foi adicionada uma suíte para o cliente HTTP da API:

- [x] Cabeçalho Bearer para sessão autenticada.
- [x] Remoção do token local após resposta HTTP 401.
- [x] Tratamento seguro de respostas não JSON e mensagens de erro.
- [x] Codificação de identificadores ao compor caminhos de documentos.
- [x] Limpeza explícita do token de sessão.

## Verificação contínua

O workflow `.github/workflows/pages.yml` executa:
1. validação de paridade da Fase 1;
2. testes do frontend;
3. verificação TypeScript e build de produção;
4. validação dos artefatos PWA;
5. publicação no GitHub Pages.

A execução do workflow precisa terminar com sucesso no commit final; a existência do arquivo de workflow não é evidência de que todos os testes passaram.

## Pendências antes de concluir a fase

- [ ] Confirmar o resultado do CI para os novos testes de API.
- [ ] Substituir testes de presença/constantes por testes de comportamento quando aplicável.
- [ ] Cobrir fluxos reais de login, criação/edição/restauração de documentos e permissões.
- [ ] Aumentar cobertura de integração do backend e verificar persistência em banco de teste.
- [ ] Adicionar testes de regressão para sincronização offline e resolução de conflitos.
- [ ] Definir e medir cobertura mínima para módulos críticos.
- [ ] Garantir que falhas de teste bloqueiem release e implantação.
- [ ] Guardar evidências da execução aprovada.

## Critério de aceite

Não concluir esta fase até que os fluxos críticos tenham testes de comportamento úteis, as execuções de CI estejam verdes e os resultados sejam reproduzíveis. Contagem de testes ou asserts isolados não substitui cobertura significativa.
