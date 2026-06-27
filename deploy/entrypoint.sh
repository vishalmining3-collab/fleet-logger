#!/usr/bin/env bash
# =============================================================================
# Fleet Logger container entrypoint
# =============================================================================
# Supervises the Python speech sidecar (port 5050) and the Node Express
# server (port $PORT, default 3000) inside the same container.
#
# Why this script:
#   Render's free tier gives one process supervision per service. We use two
#   workers — the entrypoint runs the sidecar first (ginstalling pip deps +
#   warming gRPC), tracks its PID, and restarts it up to 5 times if it dies.
#   When the Node server exits, the container exits (so Render sees a clean
#   crash and re-deploys).
#
# Lifecycle:
#   1. Wait for $NVIDIA_API_KEY to be present (otherwise sidecar exits fast)
#   2. Launch sidecar (python3 sidecar/speech_sidecar.py -> uvicorn on :5050)
#   3. Wait until /health on 5050 returns 200 (max 30 s)
#   4. Launch Express server (tsx server.ts)
#   5. If Node exits: kill sidecar, exit container
#      If sidecar dies: relaunch with backoff until 5 strikes
# =============================================================================

set -euo pipefail

# --- Sanity check the secrets required for AI features ---
if [ -z "${NVIDIA_API_KEY:-}" ]; then
  echo "[entrypoint] WARNING: NVIDIA_API_KEY is unset. The /api/transcribe " \
       "and /api/chat endpoints will return 500." >&2
fi

# --- Backend URL the Node server uses to reach the sidecar ---
export SIDECAR_URL="${SIDECAR_URL:-http://127.0.0.1:5050}"

# --- Default port for the Express server (Render sets $PORT) ---
: "${PORT:=3000}"
export PORT

# --- Helper to launch + restart the sidecar ---
SIDECAR_RESTARTS=0
MAX_SIDECAR_RESTARTS=5
SIDECAR_PID=""

start_sidecar() {
  echo "[entrypoint] launching sidecar on :5050 (attempt $((SIDECAR_RESTARTS + 1)))"
  python3 /app/sidecar/speech_sidecar.py &
  SIDECAR_PID=$!
}

wait_for_sidecar() {
  local i=0
  while [ "$i" -lt 30 ]; do
    if wget -q -O- "http://127.0.0.1:5050/health" >/dev/null 2>&1; then
      echo "[entrypoint] sidecar is healthy"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  echo "[entrypoint] sidecar failed to respond in 30 s" >&2
  return 1
}

# --- Trap SIGTERM / SIGINT so Render can stop the container cleanly ---
cleanup() {
  echo "[entrypoint] shutting down"
  if [ -n "$SIDECAR_PID" ] && kill -0 "$SIDECAR_PID" 2>/dev/null; then
    kill "$SIDECAR_PID" 2>/dev/null || true
  fi
  if [ -n "${NODE_PID:-}" ] && kill -0 "$NODE_PID" 2>/dev/null; then
    kill "$NODE_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  exit 0
}
trap cleanup TERM INT

# --- 1. Start the sidecar and wait for it ---
start_sidecar
if ! wait_for_sidecar; then
  echo "[entrypoint] sidecar unreachable on first attempt"
  kill "$SIDECAR_PID" 2>/dev/null || true
  exit 1
fi

# --- 2. Background watcher: if the sidecar dies, restart it ---
(
  while true; do
    if ! kill -0 "$SIDECAR_PID" 2>/dev/null; then
      if [ "$SIDECAR_RESTARTS" -ge "$MAX_SIDECAR_RESTARTS" ]; then
        echo "[entrypoint] sidecar restarted $MAX_SIDECAR_RESTARTS times, giving up"
        kill "$NODE_PID" 2>/dev/null || true
        exit 1
      fi
      SIDECAR_RESTARTS=$((SIDECAR_RESTARTS + 1))
      echo "[entrypoint] sidecar died, restarting"
      start_sidecar
      wait_for_sidecar || true
    fi
    sleep 2
  done
) &
WATCHER_PID=$!

# --- 3. Launch the Express server in the foreground (PID 1 style) ---
echo "[entrypoint] launching Express server on :$PORT"
node /app/dist/server.cjs &
NODE_PID=$!

# Wait for the node process; if it exits we tear down the sidecar
wait "$NODE_PID"
EXIT_CODE=$?

echo "[entrypoint] node server exited ($EXIT_CODE), tearing down sidecar + watcher"
kill "$WATCHER_PID" 2>/dev/null || true
cleanup
exit "$EXIT_CODE"
