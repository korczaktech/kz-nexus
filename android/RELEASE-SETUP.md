# KZ Documents Android — Release

O APK é sempre a variante release. A primeira versão é 0.0.0.1.

O workflow .github/workflows/android-release.yml cria uma nova versão para cada push em main usando o número da execução: 0.0.0.1, 0.0.0.2, 0.0.0.3...

Para assinar o APK de release e permitir atualizações sobre a instalação anterior, configure estes quatro Secrets em GitHub Actions:

- ANDROID_KEYSTORE_BASE64
- ANDROID_KEYSTORE_PASSWORD
- ANDROID_KEY_ALIAS
- ANDROID_KEY_PASSWORD

O mesmo keystore deve ser usado em todas as versões. O Android exige a mesma assinatura para aceitar uma atualização como atualização do mesmo aplicativo.

O APK publicado no GitHub Release recebe o nome Korczak Nexusuments-vX.Y.Z.W.apk.

O aplicativo consulta a última release pública do repositório korczaktech/kz-nexus, compara a versão instalada, valida o SHA-256 do APK e inicia o fluxo nativo de instalação do Android.

## BYOS

O armazenamento de arquivos usa o Storage Access Framework do Android. O usuário escolhe uma pasta pelo seletor do sistema; provedores instalados no aparelho podem aparecer no mesmo seletor. O KZ Documents não cria um armazenamento de arquivos próprio.
