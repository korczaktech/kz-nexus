#!/data/data/com.termux/files/usr/bin/sh
set -eu

REPO_DIR="${HOME}/kz-nexus"
NODE_DIR="$REPO_DIR/storage-node"
LOG_DIR="$HOME/.local/state/korczak-nexus"
LOG_FILE="$LOG_DIR/agent.log"
APPLIED_FILE="$LOG_DIR/agent-source-commit"
AGENT_PATH="storage-node/src/agent.js"
TEST_PATH="storage-node/test/agent.test.js"

mkdir -p "$LOG_DIR"
chmod 700 "$LOG_DIR"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "UPDATE_ERROR: repositório Git ausente em $REPO_DIR" >&2
  exit 1
fi

cd "$REPO_DIR"
git fetch --quiet origin main
CURRENT="$(git rev-parse HEAD)"
TARGET="$(git rev-parse origin/main)"

if ! git merge-base --is-ancestor "$CURRENT" "$TARGET"; then
  echo "UPDATE_ERROR: a atualização não é fast-forward; intervenção manual necessária." >&2
  exit 1
fi

# Only the runtime agent and its tests are updated automatically. Local
# supervisor scripts, lockfiles, and other user files are never reset or stashed.
if [ -f "$APPLIED_FILE" ]; then
  BASELINE="$(cat "$APPLIED_FILE")"
else
  BASELINE="$CURRENT"
fi

for path in "$AGENT_PATH" "$TEST_PATH"; do
  if ! git diff --quiet "$BASELINE" -- "$path"; then
    echo "UPDATE_ERROR: alteração local em $path; atualização cancelada para preservar o arquivo." >&2
    exit 1
  fi
done

if git diff --quiet "$TARGET" -- "$AGENT_PATH" "$TEST_PATH"; then
  printf '%s\n' "$TARGET" > "$APPLIED_FILE"
  chmod 600 "$APPLIED_FILE"
  echo "UP_TO_DATE"
  exit 0
fi

TMP_DIR="$(mktemp -d "$LOG_DIR/update.XXXXXX")"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT HUP INT TERM

git show "$TARGET:$AGENT_PATH" > "$TMP_DIR/agent.js.new"
git show "$TARGET:$TEST_PATH" > "$TMP_DIR/agent.test.js.new"
cp "$AGENT_PATH" "$TMP_DIR/agent.js.old"
cp "$TEST_PATH" "$TMP_DIR/agent.test.js.old"

mv "$TMP_DIR/agent.js.new" "$AGENT_PATH"
mv "$TMP_DIR/agent.test.js.new" "$TEST_PATH"

if ! (cd "$NODE_DIR" && npm test); then
  mv "$TMP_DIR/agent.js.old" "$AGENT_PATH"
  mv "$TMP_DIR/agent.test.js.old" "$TEST_PATH"
  echo "UPDATE_ERROR: testes falharam; arquivos anteriores restaurados." >&2
  exit 1
fi

printf '%s\n' "$TARGET" > "$TMP_DIR/agent-source-commit"
mv "$TMP_DIR/agent-source-commit" "$APPLIED_FILE"
chmod 600 "$APPLIED_FILE"
echo "UPDATED:$TARGET"
