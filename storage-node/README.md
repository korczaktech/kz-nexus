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

## Estado atual e limites

- O backend fornece pareamento temporário, heartbeat, listagem e revogação.
- O agente ainda não lê comandos remotos, não transfere arquivos e não garante inicialização automática após reinício do Android.
- Para operação contínua, configure um serviço de inicialização do Termux/Termux:Boot e exclua o Termux das otimizações de bateria do Android. Isso precisa ser validado no dispositivo real.
- O nó aparece como online quando recebe heartbeat; a API ainda não calcula uma janela de expiração para exibir offline automaticamente.
