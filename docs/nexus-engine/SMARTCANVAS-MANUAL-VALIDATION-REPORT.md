# SmartCanvas — relatório de validação manual para fechamento

**Status:** NÃO EXECUTADO — não representa aprovação.  
**Branch alvo:** `main`  
**Objetivo:** registrar evidência real para os bloqueios que CI automatizada não consegue validar em dispositivos, leitores de tela e suítes de escritório externos.

## Registro da execução

Preencher antes de marcar qualquer cenário como aprovado.

| Campo | Valor |
|---|---|
| Commit SHA testado | PREENCHER |
| Data/hora e fuso | PREENCHER |
| Responsável pela execução | PREENCHER |
| Dispositivo/modelo | PREENCHER |
| Sistema operacional e versão | PREENCHER |
| Navegador e versão | PREENCHER |
| Build/ambiente | PREENCHER |
| Link de evidências (vídeo/capturas/logs) | PREENCHER |

Resultado permitido por cenário: **PASSOU**, **FALHOU**, **NÃO EXECUTADO** ou **NÃO APLICÁVEL**. Não alterar para PASSOU sem evidência observável. Para falhas, incluir passos de reprodução, resultado esperado/obtido e issue/commit de correção.

## A. Teclado físico e seleção

| ID | Cenário | Resultado | Evidência/observações |
|---|---|---|---|
| KBD-01 | Setas esquerda/direita no meio e nas extremidades do texto | NÃO EXECUTADO | |
| KBD-02 | Setas para cima/baixo entre linhas e páginas | NÃO EXECUTADO | |
| KBD-03 | Home/End em parágrafos curtos e longos | NÃO EXECUTADO | |
| KBD-04 | Backspace/Delete em início/fim de bloco | NÃO EXECUTADO | |
| KBD-05 | Shift+setas seleciona texto esperado; digitação substitui somente seleção | NÃO EXECUTADO | |
| KBD-06 | Seleção atravessa quebra de página sem duplicar, perder ou deslocar texto | NÃO EXECUTADO | |
| KBD-07 | Repetir em parágrafo, citação, lista e tabela | NÃO EXECUTADO | |
| KBD-08 | Undo/redo depois de digitação, seleção, formatação e exclusão | NÃO EXECUTADO | |

## B. IME e composição real

Executar em cada combinação de sistema operacional, navegador e método de entrada oficialmente suportada.

| ID | Cenário | Resultado | Evidência/observações |
|---|---|---|---|
| IME-01 | Compor texto e confirmar | NÃO EXECUTADO | |
| IME-02 | Iniciar composição e cancelar | NÃO EXECUTADO | |
| IME-03 | Acentos, caracteres repetidos e caracteres combinantes | NÃO EXECUTADO | |
| IME-04 | Composição sobre seleção existente | NÃO EXECUTADO | |
| IME-05 | Composição no início/fim de parágrafo e dentro de tabela | NÃO EXECUTADO | |
| IME-06 | Confirmar ausência de duplicação/perda após composição, blur e salvamento | NÃO EXECUTADO | |

## C. Acessibilidade e operação sem mouse

| ID | Cenário | Resultado | Evidência/observações |
|---|---|---|---|
| A11Y-01 | Completar fluxo de edição apenas por teclado | NÃO EXECUTADO | |
| A11Y-02 | Foco visível e ordem de tabulação previsível | NÃO EXECUTADO | |
| A11Y-03 | Ribbon: nome acessível, estado anunciado e foco para todos os comandos | NÃO EXECUTADO | |
| A11Y-04 | Controles de cabeçalho/rodapé têm nome, estado e foco compreensíveis | NÃO EXECUTADO | |
| A11Y-05 | Mensagens de status são anunciadas sem roubar foco | NÃO EXECUTADO | |
| A11Y-06 | Leitor de tela real: navegação, edição, tabela, salvamento, erros e exportação | NÃO EXECUTADO | |
| A11Y-07 | Read-only e payload NSX inválido são anunciados e não permitem edição/sobrescrita | NÃO EXECUTADO | |

## D. Paridade visual entre motores

Usar o mesmo corpus de documentos, fontes instaladas, zoom, tamanho de página e configuração. Anexar capturas lado a lado.

| ID | Cenário | Resultado | Evidência/observações |
|---|---|---|---|
| VIS-01 | Chromium: legado vs SmartCanvas | NÃO EXECUTADO | |
| VIS-02 | Firefox: legado vs SmartCanvas | NÃO EXECUTADO | |
| VIS-03 | WebKit: legado vs SmartCanvas | NÃO EXECUTADO | |
| VIS-04 | Margens, fontes, alinhamento, espaçamento e numeração | NÃO EXECUTADO | |
| VIS-05 | Imagens, objetos, tabelas longas e tabelas que quebram páginas | NÃO EXECUTADO | |
| VIS-06 | Cabeçalhos, rodapés, quebras e páginas finais | NÃO EXECUTADO | |

## E. Round-trip e recuperação externa

| ID | Cenário | Resultado | Evidência/observações |
|---|---|---|---|
| FILE-01 | Abrir DOCX exportado no Microsoft Word | NÃO EXECUTADO | |
| FILE-02 | Abrir o mesmo DOCX no LibreOffice Writer | NÃO EXECUTADO | |
| FILE-03 | Comparar PDF exportado com a prévia | NÃO EXECUTADO | |
| FILE-04 | Fechar e reabrir navegador com rascunho não salvo | NÃO EXECUTADO | |
| FILE-05 | Payload NSX inválido: bloquear edição e impedir sobrescrita de conteúdo legado | NÃO EXECUTADO | |
| FILE-06 | Documento somente leitura: todas as ações de mutação bloqueadas, leitura/exportação conforme política | NÃO EXECUTADO | |
| FILE-07 | Falha de exportação: erro visível, foco acessível e documento/rascunho preservados | NÃO EXECUTADO | |

## F. Ativação padrão, observabilidade e rollback

| Campo | Decisão/evidência |
|---|---|
| Critérios de entrada para ativar SmartCanvas por padrão | PENDENTE DE ACEITE DE PRODUTO |
| Janela de observação e responsável | PENDENTE DE ACEITE DE PRODUTO |
| Métricas de falha de edição/salvamento/exportação | PREENCHER |
| Limiares objetivos para rollback | PENDENTE DE ACEITE DE PRODUTO |
| Procedimento testado para voltar ao editor anterior | PENDENTE DE TESTE |
| Aprovação de produto e engenharia | PENDENTE |

## Critério de fechamento

A Etapa 3 não está concluída enquanto houver cenários obrigatórios como NÃO EXECUTADO, falhas sem resolução ou decisões de produto pendentes. Anexar evidências e associar falhas a issues/commits. Depois da correção, repetir os cenários afetados e executar novamente todos os workflows automatizados no mesmo SHA final.

Este relatório é um formulário de execução, não evidência de que os testes foram realizados.
