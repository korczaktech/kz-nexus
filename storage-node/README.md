# Korczak Nexus — agente de nó de armazenamento (Termux)

Este agente mantém um heartbeat autenticado para o backend Nexus. Ele **não** abre uma porta de entrada no Android e não implementa ainda transferência de arquivos nem sincronização de conteúdo.

## Requisitos

- Node.js 20 ou superior no Termux.
- Um nó já pareado pelo backend.
- Credencial do nó guardada no diretório privado do Termux, nunca em armazenamento compartilhado.

## Configuração

Crie o arquivo privado:

```sh
mkdir -p "$HOME/.config/korczak-nexus"
chmod 700 "$HOME/.config" "$HOME/.config/korczak-nexus"
nano "$HOME/.config/korczak-nexus/node.json"
```

Conteúdo do arquivo, preenchido localmente com os valores recebidos no pareamento:

```json
{
  "apiBase": "https://kzdoc.onrender.com/api/v1",
  "nodeId": "UUID-RETORNADO-PELO-PAREAMENTO",
  "nodeToken": "CREDENCIAL-RETORNADA-UMA-UNICA-VEZ"
}
```

Proteja o arquivo:

```sh
chmod 600 "$HOME/.config/korczak-nexus/node.json"
```

Não cole nem envie o token em mensagens, issues, logs ou screenshots. O agente recusa arquivos com permissões acessíveis a grupo/outros.

## Executar

A partir da raiz do repositório:

```sh
cd storage-node
npm test
npm start
```

O agente envia um heartbeat imediatamente e depois a cada 60 segundos. Falhas transitórias usam backoff exponencial limitado. Uma resposta 401/403 encerra o agente, pois indica credencial inválida ou revogada. O encerramento por SIGINT/SIGTERM é suportado.

## Parear o Note20 sem exibir a credencial permanente

1. Em um cliente autenticado do Nexus, faça `POST /api/v1/storage/nodes/pairing-codes` com o token de sessão do usuário no cabeçalho `Authorization: Bearer`. O código é válido por cinco minutos e só pode ser usado uma vez.
2. No Termux, instale `curl` e `jq` caso ainda não existam (`pkg install curl jq`).
3. Execute o bloco abaixo. Ele solicita o código temporário, envia o pareamento por HTTPS e grava apenas a configuração necessária em um arquivo privado. A credencial permanente não é impressa no terminal.

```sh
set -eu
umask 077
CONFIG_DIR="$HOME/.config/korczak-nexus"
CONFIG_FILE="$CONFIG_DIR/node.json"
mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"
if [ -e "$CONFIG_FILE" ]; then
  echo "Já existe uma configuração de nó; faça backup/revogação antes de substituí-la." >&2
  exit 1
fi
printf "Código temporário: "
IFS= read -r PAIRING_CODE
printf "Nome do dispositivo [Samsung Note20 Ultra]: "
IFS= read -r DEVICE_NAME
DEVICE_NAME="${DEVICE_NAME:-Samsung Note20 Ultra}"
PAYLOAD="$(jq -n --arg code "$PAIRING_CODE" --arg name "$DEVICE_NAME" '{pairing_code:$code,device_name:$name}')"
RESPONSE="$(curl --fail --silent --show-error \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d "$PAYLOAD" \
  'https://kzdoc.onrender.com/api/v1/storage/nodes/pair')"
printf '%s' "$RESPONSE" | jq -e --arg apiBase "https://kzdoc.onrender.com/api/v1" \
  '{apiBase:$apiBase,nodeId:.node_id,nodeToken:.node_token}' > "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"
unset PAIRING_CODE PAYLOAD RESPONSE
echo "Pareamento concluído. A credencial foi salva sem ser exibida."
```

Se o pareamento falhar, gere um código novo. Não copie a resposta JSON bruta para mensagens ou arquivos compartilhados.

## Estado atual e limites

- O backend fornece pareamento temporário, heartbeat, listagem e revogação.
- O agente ainda não lê comandos remotos, não transfere arquivos e não garante inicialização automática após reinício do Android.
- Para instalar o projeto no telefone, clone o repositório em `$HOME/kz-nexus` e execute `cd "$HOME/kz-nexus/storage-node" && npm test`.
- Para iniciar automaticamente após reiniciar, instale o aplicativo Termux:Boot, crie `$HOME/.termux/boot` e copie `storage-node/termux/boot/korczak-nexus-node` para esse diretório; aplique `chmod 700 "$HOME/.termux/boot/korczak-nexus-node"`. O script registra logs em `$HOME/.local/state/korczak-nexus/agent.log`, sem gravar o token nos logs.
- Exclua o Termux das otimizações de bateria do Android. Não habilite um wake lock permanente sem avaliar o consumo. O comportamento após reinício, bloqueio de tela e Doze precisa ser validado no dispositivo real.
- O nó aparece como online quando recebe heartbeat e muda para offline se não houver heartbeat nos últimos 180 segundos. A revogação aparece como estado `revoked`.
