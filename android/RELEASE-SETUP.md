
# Korczak Nexus Android — Publicação de releases

O APK de release é gerado pelo workflow `.github/workflows/release.yml`, acionado por uma tag no padrão `v0.0.0.*` ou manualmente em GitHub Actions. Um push comum para `main` não publica automaticamente uma release.

## Versões e artefatos

- A versão do APK usa quatro componentes, por exemplo `0.0.0.294`.
- Se o workflow for executado manualmente sem versão informada, ele procura a maior tag `v0.0.0.N` publicada e incrementa o quarto componente. Se não encontrar releases, usa o valor-base 293 e gera a próxima versão `0.0.0.294`.
- O artefato publicado recebe o nome `Korczak-HUB-Nexus-0.0.0.N.apk`.
- O mesmo release workflow também cria pacotes Desktop para Windows (`.exe`), macOS (`.dmg`) e Linux (`.deb`) e valida a presença de todos os artefatos antes de publicar a release.
- Depois da publicação, o workflow atualiza `update.json` na branch `updates` com a URL e o SHA-256 do APK.

## Assinatura

Configure estes quatro GitHub Actions Secrets antes de executar a publicação Android:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

O mesmo keystore precisa ser reutilizado nas atualizações para que o Android aceite a nova versão como atualização do aplicativo instalado.

## Atualizador e armazenamento

O aplicativo consulta a última release pública, compara a versão instalada, valida o SHA-256 do APK e inicia o fluxo nativo de instalação.

O armazenamento de arquivos usa o Storage Access Framework do Android. O usuário escolhe uma pasta pelo seletor do sistema; provedores instalados no aparelho podem aparecer no mesmo seletor. O Nexus não cria um armazenamento de arquivos próprio.

**Status:** a configuração de release está presente no repositório. Uma release só deve ser considerada publicada depois que o workflow completo gerar, validar e anexar os quatro artefatos com assinatura válida.
