# SmartCanvas — aceite das Fases 2A e 2B

Data: 16 de outubro de 2026  
Código validado: [df745b9081e59c7ba3a30210010b0d1086f40567](https://github.com/korczaktech/kz-nexus/commit/df745b9081e59c7ba3a30210010b0d1086f40567)  
Branch: main. Nenhuma branch paralela ou pull request foi usada.

## Resultado automatizado

Os fluxos automatizados das Fases 2A e 2B passaram no commit de código indicado:

- [SmartCanvas validation](https://github.com/korczaktech/kz-nexus/actions/runs/38884607715)
- [Kortex validation](https://github.com/korczaktech/kz-nexus/actions/runs/38884607716)
- [SmartCanvas API integration](https://github.com/korczaktech/kz-nexus/actions/runs/38884607865)
- [SmartCanvas Memory Baseline](https://github.com/korczaktech/kz-nexus/actions/runs/38884607885)
- [Deploy GitHub Pages](https://github.com/korczaktech/kz-nexus/actions/runs/38884607733)

O conjunto do frontend passou 189 testes em 31 arquivos; o motor passou 211 testes em 27 arquivos. O E2E Playwright utilizou API real e MongoDB e confirmou: salvamento real, round-trip do payload NSX, recuperação de rascunho, exportação DOCX, exportação PDF, autosave pela API e conflito de versão.

## Fase 2A — aceite

- [x] Edição pelo documento canônico do motor Nexus no modo opt-in.
- [x] Entrada, seleção lógica, cursor, comandos e projeção renderizada cobertos por testes.
- [x] Undo/redo e regressões de layout/paginação, quebras de página, tabelas, imagens, objetos semânticos e cabeçalho/rodapé cobertos pela suíte do motor/preview.
- [x] Salvamento manual e persistência de HTML e NSX verificados contra a API real.
- [x] Recuperação de rascunho verificada ao sair e reabrir o editor.
- [x] Autosave verificado contra a API real.
- [x] Conflito de versão provocado por uma segunda gravação detectado pelo editor.
- [x] Estado de salvamento em andamento desativa o botão; falha de salvamento apresenta erro e preserva rascunhos HTML e NSX.
- [x] O motor calcula a geometria de layout/paginação consumida pelo renderer.

## Fase 2B — aceite

- [x] Conversor DOCX browser-compatible integrado e compatibilidade de ambiente de navegador aplicada.
- [x] Testes DOCX round-trip cobrem títulos, texto, negrito, itálico, listas, tabelas e imagens raster.
- [x] E2E confirma arquivo DOCX baixável e visualização PDF com o conteúdo canônico.
- [x] E2E real cobre persistência, rascunho, exportações, autosave e conflito.
- [x] Frontend, preview e motor passam testes, typecheck e build.
- [x] Estados de carregamento/salvamento, falha, recuperação e conflito têm cobertura automatizada de componente ou E2E.
- [x] A documentação de aceite e a lista de testes manuais foram registradas.
- [x] O editor legado foi mantido como fallback; não foi removido.
- [x] Nenhuma otimização de memória foi iniciada. A baseline é medição, não otimização nem prova de ganho universal de RAM.

## Limites conhecidos

A aprovação automatizada não representa paridade universal com o editor legado. O SmartCanvas permanece opt-in até os seguintes pontos serem fechados e validados:

1. A colagem estrutural de listas/tabelas em células já preserva nós aninhados no modelo canônico e tem testes de componente para inserção/substituição e marcas inline. A paridade completa de navegação, edição e seleção através de todas as estruturas aninhadas ainda precisa ser validada.
2. Seleções e operações que atravessam tipos diferentes de estruturas aninhadas ainda têm limites.
3. Algumas ferramentas avançadas de formatação/metadados continuam ligadas à projeção DOM de compatibilidade.
4. IME foi testado em componente, mas não validado manualmente em todos os navegadores e dispositivos suportados.
5. Não foi feita comparação visual manual completa entre os modos legado e SmartCanvas.

Esses limites impedem ativação por padrão e remoção do fallback legado, embora os critérios automatizados de integração das fases tenham passado.

## Checklist manual antes da ativação geral

1. Em Chromium no Chromebook-alvo, testar digitação, Backspace/Delete, setas, Home/End, seleção com Shift e seleção entre páginas em documento extenso.
2. Testar IME real, confirmação/cancelamento de composição e ausência de texto duplicado em cada navegador suportado.
3. Comparar o mesmo documento nos modos legado e SmartCanvas: títulos, marcas, listas, tabelas, imagens, objetos, quebras, cabeçalho, rodapé e numeração.
4. Colar texto simples, HTML formatado e imagens; verificar seleção correta e undo/redo.
5. Colar listas/tabelas em células e verificar explicitamente o fallback para texto estruturado.
6. Abrir DOCX no Word e LibreOffice; conferir títulos, estilos inline, listas, tabelas, imagens, margens, cabeçalho/rodapé e paginação.
7. Comparar PDF com a visualização do motor, incluindo cortes, margens, imagens e quebras de página.
8. Simular falha de rede, sair/reabrir e verificar recuperação dos rascunhos HTML e NSX.
9. Abrir o mesmo documento em duas sessões, provocar conflito e validar mesclagem/recarregamento sem perda silenciosa.
10. Testar navegação por teclado/leitor de tela, foco, rótulos acessíveis, estados do botão Salvar e mensagens de erro.
11. Testar somente leitura, payload NSX inválido e falha de exportação; confirmar que o documento não é sobrescrito.
12. Confirmar aviso de saída com alterações pendentes e disponibilidade do fallback legado.

## Decisão

Os critérios automatizados definidos para as Fases 2A e 2B estão validados. A paridade total de produto ainda depende dos limites e testes manuais acima. SmartCanvas permanece opt-in, o editor legado continua disponível e a otimização de memória permanece fora do escopo executado.
