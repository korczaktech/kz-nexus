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
- [ ] Definir e testar o comportamento de seleção unificada entre células; se não fizer parte do contrato de produto, documentar o limite e fornecer feedback explícito em vez de falhar silenciosamente.

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

Último commit funcional validado: [`54dcd90c554e9dd6b7a14ebfe0541e4f3b73bb79`](https://github.com/korczaktech/kz-nexus/commit/54dcd90c554e9dd6b7a14ebfe0541e4f3b73bb79)

- A integração real com API/MongoDB/Playwright passou em **Chromium, Firefox e WebKit** no workflow [`39165137727`](https://github.com/korczaktech/kz-nexus/actions/runs/39165137727), incluindo salvamento real, roundtrip do payload nativo NSX, recuperação de rascunho, DOCX/PDF, autosave, interrupção e reconexão de rede e conflito de versão.
- A validação Kortex, a validação SmartCanvas, o baseline de memória e o deploy GitHub Pages passaram no mesmo SHA: [Kortex `39165137817`](https://github.com/korczaktech/kz-nexus/actions/runs/39165137817), [SmartCanvas `39165137741`](https://github.com/korczaktech/kz-nexus/actions/runs/39165137741), [Memory Baseline `39165137771`](https://github.com/korczaktech/kz-nexus/actions/runs/39165137771), [Pages `39165137769`](https://github.com/korczaktech/kz-nexus/actions/runs/39165137769).
- O cenário de rede bloqueia service workers no contexto de teste e inspeciona URLs de salvamento após interceptar requisições amplamente; isso elimina a divergência de interceptação observada no WebKit.
- O timeout de reconexão é limpo ao concluir a interceptação; a espera do popup PDF tem limite explícito, e o workflow limita cada processo de navegador a 120 segundos e a etapa E2E a 8 minutos.
- O teste de seleção mista revelou um defeito real: a formatação usava um coletor que omite células simples de tabela, embora o mapeador de seleção canônica as inclua. A formatação foi alterada para usar os intervalos canônicos, e a suíte agora verifica formatação, cópia e recorte atravessando parágrafo, citação, lista e tabela sem achatar os contêineres.
- As alterações anteriores de seleção lógica e cópia/recorte permanecem cobertas pelos testes de componente e motor; ver os commits [`d97fa9a`](https://github.com/korczaktech/kz-nexus/commit/d97fa9a998032fc29ffb722af27447992f0a5a7d) e [`fb469a3`](https://github.com/korczaktech/kz-nexus/commit/fb469a39edea8c9db861a6da44c4edd68c3221d7).
- A validação física de IME, teclado e leitor de tela continua sem evidência: esses itens exigem dispositivos/sistemas reais ou resultados de teste fornecidos pela equipe. Também seguem pendentes a comparação visual real, abertura dos arquivos no Word/LibreOffice e a decisão de produto sobre ativação/remoção do legado.

## Critério de conclusão

A Etapa 3 só será marcada como concluída quando todos os itens obrigatórios estiverem marcados, os workflows finais estiverem verdes no mesmo SHA e o relatório de regressão registrar o resultado dos testes manuais. Enquanto houver verificações físicas e de paridade sem evidência, o estado correto é **em execução**, não 100%.
