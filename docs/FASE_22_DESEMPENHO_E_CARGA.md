# Fase 22 — Desempenho e teste de carga

**Itens:** 376–388  
**Estado:** 🟡 Instrumentação inicial criada; baselines e otimização baseada em dados ainda pendentes.

## Teste automatizado disponível

O workflow `.github/workflows/performance-smoke.yml` é manual e limitado para evitar carga acidental:

1. exige uma URL HTTPS explicitamente fornecida pelo operador;
2. limita a execução a 1–10 usuários virtuais;
3. limita a duração a 99 segundos ou 1–2 minutos;
4. consulta apenas `/health` e `/ready`, sem autenticação ou mutações;
5. aplica thresholds iniciais: menos de 1% de requisições com falha e p95 inferior a 1.500 ms.

O script está em `scripts/performance/api-health.js`. Execute somente contra ambientes que a Korczak Technologies controla ou tem autorização para testar. O smoke test não equivale a um teste de carga completo de documentos ou banco.

## Como executar

No GitHub, abra **Actions → API Performance Smoke Test → Run workflow**, informe a URL HTTPS da API autorizada e mantenha os valores baixos na primeira execução. Guarde o resumo e os percentis produzidos pelo k6 como baseline datado.

## Pendências

- [ ] Registrar baseline por ambiente e commit.
- [ ] Testar fluxos autenticados de pesquisa, listagem e leitura com dados sintéticos.
- [ ] Medir consultas MongoDB e identificar índices/planos de execução relevantes.
- [ ] Estabelecer objetivos de latência e disponibilidade aprovados para produção.
- [ ] Definir carga progressiva, limite de concorrência e critérios de interrupção.
- [ ] Medir memória/CPU e otimizar apenas após identificar gargalos.
- [ ] Não executar carga alta em produção sem autorização, janela e monitoramento.

## Critério de aceite

A fase permanece parcial até que metas mensuráveis, testes representativos e resultados reproduzíveis sejam registrados. Um teste de saúde com baixa carga valida apenas o caminho básico de disponibilidade.
