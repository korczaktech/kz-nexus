# Modelo do documento

`NexusDocument { id, schemaVersion, metadata, pageConfig, content: Block[], resources }`.

Blocos: `paragraph`, `heading` (1–6), `blockquote`, `thematicBreak`, `bulletList`, `orderedList` (com `start`), `table` (linhas → células → parágrafos), `image` (referência a recurso + `alt`).
Texto: `TextRun { type:"text", id, text, marks }`. Marcas: `bold`, `italic`, `underline`, `strike`, `color` (#RGB/#RRGGBB), `highlight`, `fontSize` (pt), `fontFamily`, `link`, `superscript`, `subscript` (URLs `http`, `https`, `mailto` ou âncoras internas; esquemas executáveis são rejeitados).
Parágrafo/título: alinhamento e recuo esquerdo opcional em pontos. Página: unidade `pt`, largura/altura, orientação, margens.

Invariantes validadas (`validateDocument`, com caminho do nó): raiz válida, tipos conhecidos, ids válidos e únicos, filhos permitidos por tipo, tabelas retangulares, marcas válidas, números finitos, profundidade e quantidade de nós dentro dos limites, referências de imagem a recursos existentes.

Normalização (`normalizeDocument`): une runs adjacentes com as mesmas marcas, remove runs vazios (mantém um se for o único), limita nível de título, regenera **apenas** ids duplicados/inválidos. Não apaga conteúdo estrutural. Idempotente (testado com sementes).

Os comandos de edição também unem runs adjacentes iguais (`coalesceRuns`), de modo que digitar não gera um run por tecla (defeito encontrado pelo E2E; teste de regressão em `tests/regression.test.ts`).
