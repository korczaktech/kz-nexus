# Renderização e layout

O motor mantém o modelo de documento independente do DOM e oferece agora um **motor próprio de layout geométrico** em `layoutDocument(document, options)`, exportado pela API pública de `@korczak/nexus-engine`.

## Responsabilidades do layout

- Calcula a área útil a partir do tamanho, orientação e margens da página, em pontos tipográficos (pt).
- Quebra texto em linhas com offsets no texto de origem, posições X/Y, largura e altura de linha; preserva métricas por trecho para tamanhos e famílias de fonte mistos.\n- Expõe alinhamento e segmentos tipográficos na geometria de cada linha para o renderizador aplicar os estilos sem reconstruir a origem do texto.
- Calcula espaçamentos, recuos, tamanho de fonte, altura de linha e caixas de parágrafos e títulos.
- Pagina blocos longos entre páginas, mantendo o identificador original e marcando fragmentos continuados.
- Calcula linhas, células e alturas de linhas de tabelas; tabelas extensas são divididas entre páginas por limites de linha para preservar a integridade das células.
- Aceita quebras explícitas por meio de `LayoutOptions.breakBefore`, que lista os IDs de bloco que devem iniciar página.
- Retorna páginas, caixas posicionadas e diagnósticos para configurações de página inválidas e blocos maiores que a área útil.

## Métricas tipográficas e precisão

A API aceita `TextMetrics` para que o host injete medidas reais da fonte e alturas de linha do renderizador da plataforma. Sem essa implementação, usa um medidor determinístico aproximado, útil para testes, fallback e layout inicial, mas **não é uma garantia de correspondência pixel a pixel** com o navegador, Android ou PDF. Um host de produção deve fornecer métricas de fonte consistentes com o renderizador usado para desenhar o documento.

O layout é headless: não acessa DOM, Canvas, React ou APIs de plataforma. O resultado é uma descrição geométrica; o host é responsável por desenhar as páginas e por aplicar estilos visuais. A API não altera o documento NSX canônico.

## Limites conhecidos

- Uma linha de tabela é mantida íntegra. Uma linha individual maior que a área útil é reportada em `diagnostics`, não cortada silenciosamente.
- Cabeçalhos podem ser mantidos com a primeira linha do bloco seguinte via `keepHeadingsWithNext`; parágrafos podem ser mantidos juntos quando couberem em uma página via `keepParagraphsTogether`. As alturas variáveis das linhas são consideradas ao distribuir fragmentos.
- A divisão de linhas considera texto simples e medidas de fonte injetadas. Para quebra perfeita em conteúdo com estilos mistos, ligaturas, idiomas complexos, colunas, cabeçalhos/rodapés repetidos, notas de rodapé e regras avançadas de órfãs/viúvas, o host precisa ampliar as métricas e a camada de composição.
- A pré-visualização web chama `layoutDocument` com o documento canônico e métricas de texto do navegador para mostrar a contagem e os diagnósticos do Kortex. Paged.js continua sendo o compositor visual de HTML nesta etapa; portanto, a geometria nativa ainda não determina diretamente cada posição visual do preview. A equivalência pixel a pixel entre a geometria nativa e a composição HTML não é garantida.

Consulte `src/layout/layout.test.ts` para os testes de margens, quebra de linhas, quebra explícita, paginação de tabelas, títulos com o próximo parágrafo, marcadores de continuação, alinhamento, listas aninhadas, citações, estilos mistos e recuperação de configuração inválida.
