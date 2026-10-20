#!/data/data/com.termux/files/usr/bin/sh
set -u

REPO_DIR="$HOME/kz-nexus"
NODE_DIR="$REPO_DIR/storage-node"
STATE_DIR="$HOME/.local/state/korczak-nexus"
LOG_FILE="$STATE_DIR/agent.log"
UPDATE_SCRIPT="$REPO_DIR/storage-node/termux/update-node.sh"
AGENT_PID=""

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

stop_agent() {
  if [ -n "$AGENT_PID" ] && kill -0 "$AGENT_PID" 2>/dev/null; then
    kill -TERM "$AGENT_PID" 2>/dev/null || true
    wait "$AGENT_PID" 2>/dev/null || true
  fi
}
trap 'stop_agent; exit 0' INT TERM HUP

while :; do
  UPDATE_RESULT="$(sh "$UPDATE_SCRIPT" 2>&1)"
  UPDATE_STATUS=$?
  printf '%s %s\n' "$(date -Iseconds)" "$UPDATE_RESULT" >> "$LOG_FILE"
  if [ "$UPDATE_STATUS" -ne 0 ]; then
    # Keep the last working agent available even when GitHub or tests fail.
    printf '%s\n' "Atualização indisponível; mantendo a versão instalada." >> "$LOG_FILE"
  fi

  cd "$NODE_DIR" || exit 1
  node src/agent.js >> "$LOG_FILE" 2>&1 &
  AGENT_PID="$!"
  SECONDS_WAITED=0
  RESTART_FOR_UPDATE=0

  while kill -0 "$AGENT_PID" 2>/dev/null; do
    sleep 60
    SECONDS_WAITED=$((SECONDS_WAITED + 60))
    if [ "$SECONDS_WAITED" -ge 1800 ]; then
      SECONDS_WAITED=0
      UPDATE_RESULT="$(sh "$UPDATE_SCRIPT" 2>&1)"
      UPDATE_STATUS=$?
      printf '%s %s\n' "$(date -Iseconds)" "$UPDATE_RESULT" >> "$LOG_FILE"
      case "$UPDATE_RESULT" in
        UPDATED:*)
          if [ "$UPDATE_STATUS" -eq 0 ]; then
            RESTART_FOR_UPDATE=1
            break
          fi
          ;;
      esac
    fi
  done

  if [ "$RESTART_FOR_UPDATE" -eq 1 ]; then
    stop_agent
    AGENT_PID=""
    printf '%s\n' "Agente reiniciará com a versão atualizada." >> "$LOG_FILE"
  else
    wait "$AGENT_PID" 2>/dev/null || true
    AGENT_PID=""
    printf '%s\n' "Agente terminou; nova tentativa em 30 segundos." >> "$LOG_FILE"
    sleep 30
  fi
done
