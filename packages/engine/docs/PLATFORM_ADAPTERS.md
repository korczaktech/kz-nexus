# Adaptadores de plataforma

Contratos em `adapters/contracts.ts`: `FileIO`, `ResourceProvider`, `StorageAdapter`. O motor nunca os implementa.

| Plataforma | Estado |
|---|---|
| Web | Preview em DOM puro implementado, buildado e validado em Chromium headless (E2E). Firefox/Safari: **não testados**. |
| Desktop (Electron) | Host Electron independente implementado; o build gera bundle local do núcleo compartilhado. O adaptador Desktop abre/valida/exporta `.nsx` e usa `layoutDocument`; build/teste do host é coberto pelo workflow Desktop. A interface ainda usa Chromium embarcado, não widgets nativos do SO. |
| Android | Apenas arquitetura prevista (WebView + ponte nativa para `FileIO`). Sem SDK no ambiente: **nada compilado ou testado**. |
| iOS | Idem (WKWebView). **Nada compilado ou testado**. |

Matriz: código compartilhado TS ✔ · compila ES2022 sem DOM/Node ✔ · testes headless Node ✔ · build web ✔ · E2E Chromium ✔ · host Electron + adaptador NSX ✔ · UI de widgets nativos ✘ · Android ✘ · iOS ✘ · dispositivo real ✘.
