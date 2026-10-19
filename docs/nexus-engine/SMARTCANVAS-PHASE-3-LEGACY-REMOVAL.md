# SmartCanvas — Etapa 3: retirada do editor legado

Branch alvo: `main`  
Estado do plano: em execução; não declarar concluído até os critérios bloqueantes abaixo passarem.

## Regra de segurança

A Etapa 3 só pode remover definitivamente o caminho legado depois que a implementação SmartCanvas for o caminho padrão validado e a paridade de produto for comprovada. Um CI verde prova os cenários automatizados incluídos, não a compatibilidade universal com IME, leitor de tela ou dispositivos físicos. Não apagar o fallback enquanto ainda houver regressões não classificadas.

## Itens de fechamento, em ordem

### 1. Entrada de texto e teclado real
- [x] Cobertura de componente para edição canônica, undo/redo, Backspace/Delete, navegação de cursor, composição IME sintética e prevenção de duplicação após composição.
- [x] E2E de navegador contra API real para digitação no SmartCanvas e projeção acessível do texto.
- [x] E2E de navegador real cobre Backspace no fim do texto e reinserção do caractere, validando a projeção do modelo canônico.
- [x] E2E em Chromium, Firefox e WebKit cobre seleção real com `Shift+ArrowLeft` e substituição do caractere selecionado, verificando que o texto canônico permanece íntegro.
- [ ] Confirmar no Chromebook-alvo: setas, Home/End, Backspace/Delete, Shift+setas e seleção que atravessa páginas.
- [ ] Executar IME físico em cada navegador/sistema operacional suportado, incluindo confirmar, cancelar e compor caracteres repetidos.

### 2. Estruturas e seleção lógica
- [x] Testes de listas/tabelas aninhadas em células e preservação de nós, marcas inline e texto.
- [x] Testes de seleção lógica entre blocos e células, incluindo encerramento de arraste quando o hit-test final falha/cancela.
- [x] Corrigido o caminho de copiar/recortar e formatar seleções lógicas entre blocos aninhados: a seleção do motor tem prioridade sobre o estado de célula ativa.
- [x] A coleta recursiva de texto agora inclui parágrafos simples dentro de tabelas aninhadas, sem confundir células simples de topo com células complexas.
- [x] Teste de componente verifica negrito e recorte de uma seleção que atravessa lista e tabela aninhadas, preservando os contêineres.
- [x] Teste unitário mapeia a seleção nos dois sentidos entre parágrafo, citação, lista e tabela, mantendo a identidade dos contêineres.
- [x] Teste de componente cobre formatação, cópia e recorte de uma seleção lógica que atravessa parágrafo, citação, lista e célula simples de tabela, mantendo os quatro contêineres.
- [x] Corrigida a formatação de seleção lógica para usar os intervalos canônicos do motor; o coletor visual de texto não inclui células simples de tabela no mesmo caminho, o que deixava a formatação cross-container incompleta.
- [ ] Completar a matriz de comandos em ambas as direções e com mais estruturas aninhadas (lista ↔ tabela ↔ parágrafo ↔ citação), garantindo que delete/format não achatem nem removam contêineres indevidos.
- [x] Seleção de texto linear entre células é coberta por testes de mapeamento nos dois sentidos e preserva a identidade dos contêineres. Decisão de escopo da Etapa 3: seleção retangular/unificada de células não será suportada nesta etapa; ao arrastar entre células, a UI informa que a seleção resultante é linear e que a seleção retangular não está disponível. Teste de componente verifica tanto o mapeamento canônico quanto a mensagem.

### 3. Acessibilidade
- [x] A superfície de captura do teclado tem rótulo acessível; páginas do canvas expõem texto acessível para verificação automatizada.
- [ ] Testar navegação apenas por teclado, foco visível, ordem de tabulação, mensagens de status e operação com leitor de tela real.
- [ ] Confirmar que todos os comandos do ribbon e os controles de cabeçalho/rodapé têm nome, estado e foco compreensíveis.

### 4. Paridade visual e impressão
- [x] Testes automatizados do layout do motor, paginação, quebras, tabelas, imagens, cabeçalho/rodapé e exportação PDF/DOCX.
- [x] E2E contra API real agora roda os fluxos de edição, teclado, salvamento, recuperação, autosave, conflito e exportação em Chromium, Firefox e WebKit.
- [ ] Comparar o mesmo conjunto de documentos no legado e SmartCanvas em Chromium, Firefox e WebKit, incluindo margens, fontes, imagens, tabelas longas, objetos, numeração, cabeçalho/rodapé e páginas divididas.
- [ ] Abrir DOCX exportado em Word e LibreOffice e comparar PDF exportado com a prévia, registrando as diferenças aceitas.

### 5. Persistência e recuperação
- [x] E2E contra API/MongoDB para salvamento, payload nativo, recuperação de rascunho, autosave, exportação DOCX/PDF e conflito de versão.
- [x] E2E real: interromper deliberadamente uma requisição de salvamento, reconectar e verificar que HTML e payload NSX persistem o mesmo texto canônico após nova tentativa. (A indisponibilidade após fechar/reabrir o navegador ainda exige teste manual.)
- [x] Testes unitários rejeitam HTML, JSON inválido, envelope de formato incorreto e versões futuras de NSX.
- [ ] Exercitar em E2E a recuperação de payload NSX inválido, documento somente leitura e falha de exportação.

### 6. Ativação e remoção do legado
- [ ] Mudar a seleção do editor padrão para SmartCanvas somente após os itens bloqueantes acima passarem ou receberem aceite explícito de produto.
- [ ] Manter uma opção de recuperação/rollback durante a janela de observação, com métricas e critério de rollback.
- [ ] Remover o renderizador/handlers legados do corpo apenas depois de confirmar que cabeçalho/rodapé, importação, formatação, salvamento e exportação não dependem deles.
- [ ] Remover a flag experimental, o fallback e os testes exclusivos do legado após a janela de estabilidade e atualizar a arquitetura/documentação.
- [ ] Executar o conjunto completo de testes, typecheck, builds, E2E de API e baseline de memória no commit final.

## Última rodada registrada

Último commit com CI automatizada verde: [`ff72c80d8d3803818aa6ada136f8d340331b869e`](https://github.com/korczaktech/kz-nexus/commit/ff72c80d8d3803818aa6ada136f8d340331b869e), na branch `main`.

- **Backend CI aprovada:** workflow [Backend CI `39207232204`](https://github.com/korczaktech/kz-nexus/actions/runs/39207232204), concluído com sucesso no SHA `ff72c80`; testes Python com MongoDB e verificação de segredos passaram.
- **Integração da API real aprovada:** workflow [SmartCanvas API integration `39207232195`](https://github.com/korczaktech/kz-nexus/actions/runs/39207232195), concluído com sucesso no mesmo SHA. A integração MongoDB, o build do frontend contra a API local e o E2E Playwright contra a API real em Chromium, Firefox e WebKit passaram.
- **Validação geral aprovada:** workflow [Kortex validation `39207232150`](https://github.com/korczaktech/kz-nexus/actions/runs/39207232150), concluído com sucesso no mesmo SHA; testes do motor, testes de preview do SmartCanvas, verificações de tipos e builds passaram.
- **Correção de validação da API:** o handler agora normaliza o contexto de erros de validação para texto antes de serializar a resposta JSON. Isso evita que objetos de exceção não serializáveis convertam uma entrada inválida em erro interno.
- **Correção de contrato de telemetria:** `/telemetry/metrics` expõe os campos agregados na raiz e mantém o objeto `metrics` agrupado para compatibilidade com consumidores existentes.
- **Cobertura de NSX inválido:** a integração API verifica rejeição de conteúdo nativo inválido tanto na criação quanto no salvamento e confirma que uma tentativa inválida não sobrescreve o conteúdo válido existente.
- As falhas de CI nos commits anteriores `90659f7` foram seguidas pelas correções acima; os três workflows finais passaram no SHA `ff72c80`. Não usar os resultados de commits anteriores como evidência para um commit posterior.
- Os testes automatizados continuam sendo evidência apenas dos caminhos executados na CI. Teclado/IME físicos, leitor de tela real, paridade visual observada, abertura de DOCX em Word/LibreOffice, recuperação com navegador fechado e aprovação do plano de rollback continuam pendentes de evidência humana.

### Protocolo obrigatório para a rodada manual

Use o [relatório de validação manual](./SMARTCANVAS-MANUAL-VALIDATION-REPORT.md) para registrar SHA, dispositivo, sistema, navegador, resultado por cenário e evidências. O arquivo começa explicitamente como **NÃO EXECUTADO** e não deve ser marcado como aprovado sem observação real.

Registre dispositivo, sistema operacional, navegador/versão, documento de teste, resultado (passou/falhou/não executado), evidência e defeito associado. Não marque um item como aprovado sem resultado observável.

1. **Teclado:** setas, Home/End, Backspace/Delete, Shift+setas e seleção cruzando quebra de página; repetir com parágrafo, citação, lista e tabela.
2. **IME real:** compor, confirmar e cancelar texto; repetir caracteres, acentos e composição dentro de seleção; verificar ausência de duplicação/perda.
3. **Acessibilidade:** operar sem mouse; conferir foco visível, ordem de tabulação, nomes/estados dos controles, mensagens de status e fluxo com leitor de tela real.
4. **Paridade:** abrir o mesmo corpus no legado e no SmartCanvas em Chromium, Firefox e WebKit; registrar margens, fontes, imagens, tabelas longas, objetos, numeração, cabeçalhos/rodapés e quebras de página.
5. **Exportação:** abrir DOCX no Microsoft Word e no LibreOffice; comparar PDF exportado com a prévia e registrar diferenças aceitas.
6. **Recuperação e erros:** fechar e reabrir o navegador com rascunho pendente; testar payload NSX inválido, documento somente leitura e falha de exportação.
7. **Produto e rollback:** aprovar por escrito o editor padrão, janela de observação, métricas e gatilhos de rollback antes de remover o fallback.

A CI verde comprova somente os caminhos automatizados descritos. A validação física de IME, teclado e leitor de tela, a comparação visual real, a abertura dos arquivos no Word/LibreOffice e a decisão de produto sobre ativação/remoção do legado continuam sem evidência e exigem execução humana em ambientes apropriados.

## Critério de conclusão

A Etapa 3 só será marcada como concluída quando todos os itens obrigatórios estiverem marcados, os workflows finais estiverem verdes no mesmo SHA e o relatório de regressão registrar o resultado dos testes manuais. Enquanto houver verificações físicas e de paridade sem evidência, o estado correto é **em execução**, não 100%.
