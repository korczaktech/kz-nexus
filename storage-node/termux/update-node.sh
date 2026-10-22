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

# Only the runtime agent and its tests are updated automatically.
# Other files (including package-lock.json and supervisor customizations) are untouched.
if [ -f "$APPLIED_FILE" ]; then
  BASELINE="$(cat "$APPLIED_FILE")"
else
  BASELINE="$CURRENT"
fi

TMP_DIR="$(mktemp -d "$LOG_DIR/update.XXXXXX")"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT HUP INT TERM

# Three-way merge: local working copy + last applied upstream base + newest upstream.
# Non-conflicting local customizations survive together with upstream changes.
merge_managed_file() {
  path="$1"
  label="$2"
  git show "$BASELINE:$path" > "$TMP_DIR/$label.base"
  cp "$path" "$TMP_DIR/$label.local"
  git show "$TARGET:$path" > "$TMP_DIR/$label.remote"
  if ! git merge-file -p "$TMP_DIR/$label.local" "$TMP_DIR/$label.base" "$TMP_DIR/$label.remote" > "$TMP_DIR/$label.merged"; then
    echo "UPDATE_ERROR: conflito de mesclagem em $path; arquivo original preservado para resolução manual." >&2
    return 1
  fi
}

if ! merge_managed_file "$AGENT_PATH" "agent"; then exit 1; fi
if ! merge_managed_file "$TEST_PATH" "tests"; then exit 1; fi

# Avoid restarting the agent when the upstream runtime files have not changed.
if cmp -s "$TMP_DIR/agent.merged" "$AGENT_PATH" && cmp -s "$TMP_DIR/tests.merged" "$TEST_PATH"; then
  printf '%s\n' "$TARGET" > "$APPLIED_FILE"
  chmod 600 "$APPLIED_FILE"
  echo "UP_TO_DATE"
  exit 0
fi

# Keep rollback copies until the merged files pass the complete agent test suite.
cp "$AGENT_PATH" "$TMP_DIR/agent.js.old"
cp "$TEST_PATH" "$TMP_DIR/agent.test.js.old"

mv "$TMP_DIR/agent.merged" "$AGENT_PATH"
mv "$TMP_DIR/tests.merged" "$TEST_PATH"

if ! (cd "$NODE_DIR" && npm test); then
  mv "$TMP_DIR/agent.js.old" "$AGENT_PATH"
  mv "$TMP_DIR/agent.test.js.old" "$TEST_PATH"
  echo "UPDATE_ERROR: testes falharam; arquivos anteriores restaurados." >&2
  exit 1
fi

printf '%s\\n' "$TARGET" > "$TMP_DIR/agent-source-commit"
mv "$TMP_DIR/agent-source-commit" "$APPLIED_FILE"
chmod 600 "$APPLIED_FILE"
echo "UPDATED:$TARGET"
