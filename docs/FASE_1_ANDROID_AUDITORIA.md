# Fase 1 — Android — Auditoria de fechamento

Data: 2026-10-05

## Decisões

- Web e Android possuem frontends independentes por decisão arquitetural.
- O asset Android em `android/app/src/main/assets/` é a fonte da experiência Android.
- O frontend em `frontend/` não precisa permanecer visualmente idêntico ao Android.
- Backend, autenticação, dados e NexusAPI permanecem compartilhados.

## 12 pendências da revisão anterior

1. **Permissões Android** — concluído. Removida a permissão ampla `MANAGE_EXTERNAL_STORAGE`; o app usa Storage Access Framework conforme necessidade.
2. **Offline** — concluído na camada Android. Criados cache local, fila de gravações pendentes e retenção limitada.
3. **Estado de sincronização/rede** — concluído. Android publica `nexusNetworkState` no WebView e exibe estado offline.
4. **Meu plano / Configurações / Sobre / Atualizações** — verificados no asset Android; as páginas existem e permanecem independentes do frontend web.
5. **Atualizador e nomenclatura** — concluído. O artefato oficial passou a ser `Korczak-HUB-Nexus-<versão>.apk`, e o updater rejeita nomes de APK fora desse padrão.
6. **Testes automatizados** — concluído. Foram adicionados testes JVM de contrato e smoke test instrumentado da Activity.
7. **Matriz de dispositivos** — automatizada no CI com APIs 29 e 35 e perfis Pixel 2, Pixel 5 e Nexus 7.
8. **Teclado/layout** — Activity usa `adjustResize`, WebView recebe insets do sistema e o editor possui toolbar nativa separada.
9. **Lifecycle** — concluído. Estado do WebView é salvo/restaurado e o app trata `onResume` e pressão de memória.
10. **Baixa memória/offline/conexão lenta** — concluído na camada de resiliência: timeouts existentes, cache/fila offline, retomada de estado e tratamento de memória.
11. **Permissões/erros de acesso** — concluído. Acesso ao armazenamento é solicitado sob demanda e falhas de provider são tratadas sem exigir acesso global.
12. **Auditoria final** — automatizada no CI; o release depende dos testes JVM e smoke tests em emuladores.

## CI

O job `verify` precisa concluir antes do job `release`.

Ele executa:

- testes JVM;
- smoke test instrumentado;
- APIs Android 29 e 35;
- perfis Pixel 2, Pixel 5 e Nexus 7.

## Release

Nome do APK:

```
Korczak-HUB-Nexus-<versão>.apk
```

Manifesto do updater:

```
https://github.com/korczaktech/kz-nexus/releases/download/v<versão>/Korczak-HUB-Nexus-<versão>.apk
```

O SHA-256 do APK é publicado junto ao manifesto e validado antes da instalação.

## Limite da auditoria

O CI confirma comportamento automatizável, mas não pode declarar teste físico em aparelhos reais. Teste manual em Android físico continua recomendado antes de distribuição pública, especialmente para fabricantes com WebView customizada, permissões específicas e gerenciamento agressivo de bateria.
