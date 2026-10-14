# Korczak Nexus Desktop

Cliente independente para Windows, macOS e Linux. A interface e a bridge são próprias do Desktop e não reutilizam as shells Android/iOS.

Inclui autenticação, documentos, pastas, favoritos, recentes, lixeira, pesquisa, editor, versões, restauração, perfil, feedback, abertura/exportação de arquivos locais, menu nativo e verificação de novas versões.

Empacotamento: Windows NSIS, macOS DMG e Linux AppImage + DEB. O comando Linux usa os alvos definidos em `desktop/package.json`; o CI deve validar a presença dos dois artefatos.

API oficial: https://kzdoc.onrender.com

Segurança: contextIsolation, sandbox e nodeIntegration false; operações nativas passam pelo preload.

## Núcleo documental compartilhado

O Desktop gera, durante start/test/build/empacotamento, um bundle local de `packages/engine/src/index.ts` usando esbuild. A interface usa o adaptador `src/engine-bridge.js` para validar, abrir e exportar documentos `.nsx` com `openNsx`/`saveNsx`, gerar HTML a partir do modelo canônico e calcular geometria/paginação com `layoutDocument`. Não há dependência de um navegador instalado pelo usuário: o executável contém o runtime Chromium do Electron.

**Limite atual:** o shell é um aplicativo desktop independente, mas a camada visual ainda é HTML/CSS/JavaScript dentro do Chromium embarcado; não é uma UI desenhada por widgets nativos do sistema. A conversão de HTML editável para `.nsx` preserva os elementos suportados pelo adaptador (parágrafos, títulos, listas, citações, tabelas e marcas de texto); elementos arbitrários ou recursos de imagem não são garantidos nessa conversão.
