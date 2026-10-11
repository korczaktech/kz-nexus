# Fase 25 — Publicação e releases

**Itens:** 417–428  
**Estado:** 🟡 Workflow de release revisado; nenhuma nova release assinada foi publicada nesta alteração.

## Artefatos esperados

- Android: APK de release assinado, nomeado `Korczak-HUB-Nexus-<versão>.apk`.
- Windows: instalador `.exe`.
- macOS: imagem `.dmg`.
- Linux: pacote `.deb` e AppImage.

O workflow `.github/workflows/release.yml` valida o formato da versão, evita reutilização acidental de versão em execução manual, exige os quatro segredos de assinatura Android, valida o keystore e executa verificação da assinatura do APK antes de carregar o artefato.

## Segredos necessários para Android

Configurar no repositório ou ambiente autorizado, sem colocá-los no código:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Se qualquer segredo estiver ausente, o workflow deve falhar antes da publicação. Nunca substituir essa validação por um APK de debug ou não assinado.

## Fluxo de publicação

1. executar os testes e builds;
2. validar artefatos e assinaturas;
3. publicar todos os pacotes esperados;
4. confirmar a existência dos cinco artefatos na release;
5. gerar o manifesto de atualização Android com URL e SHA-256;
6. verificar o resultado do workflow e guardar a evidência.

O workflow de release não foi disparado contra uma versão assinada nesta revisão, porque isso exige segredos válidos e publicação real. A execução do CI normal prova builds de teste, não publicação final.

## Pendências

- [ ] Executar release candidata com segredos válidos e autorização explícita.
- [ ] Verificar o APK assinado e instalar a release candidata em ambiente de homologação.
- [ ] Confirmar os cinco assets publicados e o manifesto no branch de atualização.
- [ ] Definir assinatura/notarização de Windows e macOS se exigida pela distribuição.
- [ ] Documentar rollback e processo de retirada de uma release defeituosa.

## Critério de aceite

Não declarar a fase concluída até que uma release candidata real seja publicada, seus artefatos verificados e o procedimento de rollback seja documentado.
