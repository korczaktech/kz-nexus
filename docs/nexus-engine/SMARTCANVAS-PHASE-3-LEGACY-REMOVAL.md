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
- [ ] Seleção de texto linear entre células é coberta por testes de mapeamento nos dois sentidos e preserva a identidade dos contêineres. **Contrato pendente de aceite de produto:** isso não equivale a seleção retangular/unificada de células; essa interação continua fora do escopo implementado. Antes do fechamento, decidir formalmente se seleção retangular será suportada; se não for, a UI deve explicar o limite quando o usuário tentar essa interação, sem falha silenciosa.

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

Último commit funcional validado por CI: [`a20ba971db865a0d4a5421436aec73c3fdbfed40`](https://github.com/korczaktech/kz-nexus/commit/a20ba971db865a0d4a5421436aec73c3fdbfed40).

- **Integração real aprovada:** workflow [SmartCanvas API integration `39202816236`](https://github.com/korczaktech/kz-nexus/actions/runs/39202816236), concluído com sucesso no SHA `a20ba97`. Executou testes da API com MongoDB, build de frontend e E2E Playwright contra API real em Chromium, Firefox e WebKit.
- **Validação geral aprovada:** workflow [Kortex validation `39202816325`](https://github.com/korczaktech/kz-nexus/actions/runs/39202816325), concluído com sucesso no mesmo SHA; engine tests, SmartCanvas preview tests, typechecks e builds passaram.
- **Nova cobertura de recuperação:** o E2E agora recarrega a página inteira após autosave e verifica a restauração do conteúdo canônico no editor, além do fluxo existente de sair e reabrir o editor. A validação espera a restauração assíncrona da sessão/navegação e aceita tanto a restauração direta do editor quanto o retorno à lista.
- **Cobertura E2E reportada pelo script:** criação/edição, ausência do DOM do editor legado no fluxo SmartCanvas, digitação e projeção acessível, Backspace e reinserção, recuperação de rascunho, persistência na API real, roundtrip do payload nativo NSX, exportação DOCX/PDF, autosave, recuperação após reload completo, interrupção e reconexão de rede e conflito de versão. O workflow percorre Chromium, Firefox e WebKit.
- O teste de seleção mista revelou um defeito real: a formatação usava um coletor que omitia células simples de tabela, embora o mapeador de seleção canônica as incluísse. A formatação foi corrigida para usar os intervalos canônicos, e a suíte verifica formatação, cópia e recorte atravessando parágrafo, citação, lista e tabela sem achatar os contêineres.
- As alterações anteriores de seleção lógica e cópia/recorte permanecem cobertas pelos testes de componente e motor; ver os commits [`d97fa9a`](https://github.com/korczaktech/kz-nexus/commit/d97fa9a998032fc29ffb722af27447992f0a5a7d) e [`fb469a3`](https://github.com/korczaktech/kz-nexus/commit/fb469a39edea8c9db861a6da44c4edd68c3221d7).

### Protocolo obrigatório para a rodada manual

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
