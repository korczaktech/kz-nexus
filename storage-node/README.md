# Korczak Nexus — agente de nó de armazenamento (Termux)

Este agente mantém um heartbeat autenticado, informa a capacidade livre do dispositivo e busca tarefas de gravação no backend Nexus. Ele **não** abre uma porta de entrada no Android: as transferências usam conexões de saída iniciadas pelo próprio nó.

## Requisitos

- Node.js 20 ou superior no Termux.
- Um nó já pareado pelo backend.
- Credencial do nó guardada no diretório privado do Termux, nunca em armazenamento compartilhado.
- Permissão do Termux para acessar o armazenamento compartilhado do Android.

Instale as ferramentas e clone o repositório em um diretório separado do protótipo anterior:

```sh
pkg install git nodejs-lts curl jq
termux-setup-storage
git clone https://github.com/korczaktech/kz-nexus.git "$HOME/kz-nexus"
cd "$HOME/kz-nexus/storage-node"
npm test
```

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

## Armazenamento compartilhado do Android (.Nexus)

O destino oficial dos documentos é a pasta **Armazenamento interno/.Nexus** do aplicativo Meus Arquivos. Antes de iniciar o agente, execute `termux-setup-storage` e aceite a permissão de arquivos do Android. Isso cria o atalho `$HOME/storage/shared` para o armazenamento interno compartilhado.

Estrutura criada pelo agente:

```text
Armazenamento interno/
└── .Nexus/
    ├── users/
    │   └── <ID_DO_USUARIO>/
    │       └── documents/
    │           └── <ID_DA_TAREFA>-<nome-original>
    └── system/
        └── nodes/
            └── <ID_DO_NO>/
```

O backend inclui o identificador do proprietário em cada tarefa, para que cada usuário tenha seu próprio diretório. Os documentos são gravados diretamente em `.Nexus/users/<ID_DO_USUARIO>/documents/`; `.Nexus/system/nodes/` reserva a área de metadados do nó. A credencial continua apenas no diretório privado do Termux.

O agente valida que `$HOME/storage/shared` aponta para o armazenamento interno compartilhado real. Se a permissão não foi concedida ou o atalho não existe, ele **não** grava numa pasta alternativa escondida no Termux: a tarefa falha e o erro aparece no log. Se a pasta não aparecer em Meus Arquivos, ative a exibição de arquivos ocultos.

## Executar

A partir da raiz do repositório:

```sh
cd storage-node
npm test
npm start
```

O agente envia um heartbeat imediatamente e depois a cada 15 segundos. Falhas transitórias usam backoff exponencial limitado. Uma resposta 401/403 encerra o agente, pois indica credencial inválida ou revogada. O encerramento por SIGINT/SIGTERM é suportado.


## Atualização automática do agente Android

O supervisor `storage-node/termux/supervise-node.sh` verifica a branch `main` na inicialização e, enquanto estiver ativo, a cada 30 minutos. Quando encontra uma atualização, aplica apenas um avanço fast-forward, executa `npm test` e só mantém a nova versão se os testes passarem. Se os testes falharem, restaura o commit anterior. A configuração privada em `~/.config/korczak-nexus/node.json` e os documentos em `/storage/emulated/0/.Nexus/` ficam fora do repositório e não são substituídos pela atualização.

Se o GitHub estiver indisponível, houver alterações locais no clone ou os testes falharem, o supervisor mantém a versão instalada e registra o resultado em `~/.local/state/korczak-nexus/agent.log`. Atualizações aprovadas reiniciam o agente para carregar o código novo. O supervisor também tenta iniciar novamente o agente se o processo terminar.

### Ativar ou atualizar o lançador do Termux:Boot

Depois de atualizar o clone do repositório, instale o lançador atualizado (este passo é necessário uma vez em cada celular; o lançador copiado para `~/.termux/boot` não é atualizado automaticamente pelo Git):

```sh
# Encerre o agente antigo, se houver PID registrado.
PID_FILE="$HOME/.local/state/korczak-nexus/agent.pid"
if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    kill -TERM "$OLD_PID" 2>/dev/null || true
    sleep 2
  fi
  rm -f "$PID_FILE"
fi

mkdir -p "$HOME/.termux/boot"
cp "$HOME/kz-nexus/storage-node/termux/boot/korczak-nexus-node" "$HOME/.termux/boot/korczak-nexus-node"
chmod 700 "$HOME/.termux/boot/korczak-nexus-node"
chmod 700 "$HOME/kz-nexus/storage-node/termux/update-node.sh" "$HOME/kz-nexus/storage-node/termux/supervise-node.sh"
```

Instale o aplicativo Termux:Boot, abra-o pelo menos uma vez e exclua o Termux das otimizações de bateria do Android. Para iniciar o supervisor imediatamente sem reiniciar, execute:

```sh
sh "$HOME/.termux/boot/korczak-nexus-node"
```

Confira os registros com:

```sh
tail -n 100 "$HOME/.local/state/korczak-nexus/agent.log"
```

A atualização automática depende de internet, Git e Node.js/npm funcionais. Ela atualiza o código do agente de armazenamento; não atualiza automaticamente o aplicativo Android/Termux, não implanta o backend hospedado e não substitui testes reais de gravação/restauração nos dispositivos.

## Parear o Note20 sem exibir a credencial permanente

1. No site do Nexus, entre na sua conta, abra **Configurações → Nós de armazenamento** e clique em **Gerar código de pareamento**. O código é válido por cinco minutos e só pode ser usado uma vez.
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

- O backend fornece pareamento temporário, heartbeat com capacidade, fila autenticada de gravação, confirmação do resultado, listagem e revogação.
- Ao receber uma tarefa, o agente grava o conteúdo diretamente em `/storage/emulated/0/.Nexus/users/<ID_DO_USUARIO>/documents/` e confirma à API o caminho físico da gravação.
- O armazenamento é **dividido, sem replicação automática**: cada salvamento é enfileirado em apenas um nó elegível. O backend escolhe o nó com menor proporção de armazenamento ocupado; em empate, prefere o Servidor I. Um nó pausado, offline, sem internet ou sem espaço suficiente é excluído da seleção.
- Se nenhum nó elegível estiver disponível no momento do salvamento, o navegador tenta o Google Drive conectado; se não conseguir, cria um backup persistente no IndexedDB local. Esse backup de contingência não significa que o documento foi gravado no celular.
- O agente processa uma tarefa por ciclo de heartbeat; por padrão, o intervalo é de 15 segundos. O site espera até 20 segundos por confirmação e informa quando a gravação física não foi confirmada. A instalação, o pareamento, a execução contínua e a gravação real precisam ser verificados nos dois celulares.
- Para instalar o projeto no telefone, clone o repositório em `$HOME/kz-nexus` e execute `cd "$HOME/kz-nexus/storage-node" && npm test`.
- Para iniciar automaticamente após reiniciar, instale o aplicativo Termux:Boot, crie `$HOME/.termux/boot` e copie `storage-node/termux/boot/korczak-nexus-node` para esse diretório; aplique `chmod 700 "$HOME/.termux/boot/korczak-nexus-node"`. O script registra logs em `$HOME/.local/state/korczak-nexus/agent.log`, sem gravar o token nos logs.
- Exclua o Termux das otimizações de bateria do Android. Não habilite um wake lock permanente sem avaliar o consumo. O comportamento após reinício, bloqueio de tela e Doze precisa ser validado no dispositivo real.
- O nó aparece como online quando recebe heartbeat e muda para offline se não houver heartbeat nos últimos 180 segundos. A revogação aparece como estado `revoked`.
