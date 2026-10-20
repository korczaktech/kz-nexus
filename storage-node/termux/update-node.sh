#!/data/data/com.termux/files/usr/bin/sh
set -eu

REPO_DIR="${HOME}/kz-nexus"
NODE_DIR="$REPO_DIR/storage-node"
LOG_DIR="$HOME/.local/state/korczak-nexus"
LOG_FILE="$LOG_DIR/agent.log"

mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "UPDATE_ERROR: repositório Git ausente em $REPO_DIR" >&2
  exit 1
fi

cd "$REPO_DIR"
if [ -n "$(git status --porcelain)" ]; then
  echo "UPDATE_ERROR: há alterações locais; atualização automática cancelada para preservar arquivos." >&2
  exit 1
fi

git fetch --quiet origin main
CURRENT="$(git rev-parse HEAD)"
TARGET="$(git rev-parse origin/main)"
if [ "$CURRENT" = "$TARGET" ]; then
  echo "UP_TO_DATE"
  exit 0
fi

if ! git merge-base --is-ancestor "$CURRENT" "$TARGET"; then
  echo "UPDATE_ERROR: a atualização não é fast-forward; intervenção manual necessária." >&2
  exit 1
fi

git merge --ff-only --quiet "$TARGET"
if ! (cd "$NODE_DIR" && npm test); then
  git reset --hard --quiet "$CURRENT"
  echo "UPDATE_ERROR: testes falharam; versão anterior restaurada." >&2
  exit 1
fi

echo "UPDATED:$TARGET"
