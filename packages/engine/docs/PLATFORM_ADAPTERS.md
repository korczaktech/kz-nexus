# Adaptadores de plataforma

Contratos em `adapters/contracts.ts`: `FileIO`, `ResourceProvider`, `StorageAdapter`. O motor nunca os implementa.

| Plataforma | Estado |
|---|---|
| Web | Preview em DOM puro implementado, buildado e validado em Chromium headless (E2E). Firefox/Safari: **não testados**. |
| Desktop (Electron) | Apenas contrato; o núcleo roda em Node (testes headless). Nenhum host Electron foi criado ou compilado. |
| Android | Apenas arquitetura prevista (WebView + ponte nativa para `FileIO`). Sem SDK no ambiente: **nada compilado ou testado**. |
| iOS | Idem (WKWebView). **Nada compilado ou testado**. |

Matriz: código compartilhado TS ✔ · compila ES2022 sem DOM/Node ✔ · testes headless Node ✔ · build web ✔ · E2E Chromium ✔ · Electron ✘ · Android ✘ · iOS ✘ · dispositivo real ✘.
