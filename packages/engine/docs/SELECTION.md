# Seleção

`Position = { blockId, offset }` (offset em unidades UTF-16 do texto concatenado do bloco). `Selection = { anchor, focus }` (direção preservada); `isCollapsed`, `orderedRange`. As posições são mapeadas de forma determinística após inserir/remover/dividir/mesclar (`selection/mapping.ts`, testado) e restauradas no undo/redo. Seleções para nós removidos são rejeitadas, nunca ficam apontando para eles.
Limite atual: comandos de divisão/mesclagem operam em blocos de nível superior; o preview informa isso quando o usuário tenta em listas/tabelas/citações.
