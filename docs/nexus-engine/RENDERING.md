# Renderização

O motor **não renderiza**. Separação: modelo (`NexusDocument`) → host decide layout/apresentação. Referência: `packages/engine-preview/src/editor/render.ts` projeta o modelo em DOM; `dom-selection.ts` converte seleção DOM ↔ lógica; `input.ts` converte `beforeinput`/atalhos em chamadas semânticas e **cancela** toda edição nativa do DOM.
Layout/paginação automática: **não implementado** (exige métricas de fonte da plataforma). O modelo guarda apenas `pageConfig` em pontos (pt); conversão pt→px (×96/72) fica no host.
Limitações do preview: re-render completo a cada mudança (ok até milhares de blocos; ver PERFORMANCE.md); IME/composição tratada por `compositionend` mas **não testada com IME real**.
