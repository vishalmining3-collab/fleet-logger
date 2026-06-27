#!/bin/bash
# Fleet Logger launcher — production mode (stable, no HMR).
# Run with:  ./start.sh   or   ./start.sh dev   (vite dev mode)
set -e
cd "$(dirname "$0")"

MODE="${1:-prod}"

# Clean any prior runs
lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
lsof -ti:5050 2>/dev/null | xargs -r kill -9 2>/dev/null || true
sleep 1

# Find LAN IP for mobile access
LAN_IP=$(ipconfig getifaddr en0 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')

mkdir -p logs

# Start sidecar
nohup python3 sidecar/speech_sidecar.py < /dev/null > logs/sidecar.log 2>&1 &
SIDECAR_PID=$!
disown $SIDECAR_PID 2>/dev/null || true
echo "Sidecar PID: $SIDECAR_PID (port 5050)"

# Wait for sidecar prewarm
for i in {1..30}; do
  if curl -s --max-time 1 http://127.0.0.1:5050/health > /dev/null 2>&1; then
    echo "  ✓ Sidecar ready"
    break
  fi
  sleep 0.5
done

# Start Node server in the requested mode
if [ "$MODE" = "dev" ]; then
  echo "Mode: DEV (Vite HMR — restart on file changes)"
  nohup npx tsx server.ts < /dev/null > logs/server.log 2>&1 &
else
  echo "Mode: PROD (static bundle — no restart, no HMR)"
  [ -f dist/server.cjs ] || npm run build > /dev/null 2>&1
  nohup node dist/server.cjs < /dev/null > logs/server.log 2>&1 &
fi
SERVER_PID=$!
disown $SERVER_PID 2>/dev/null || true
echo "Server PID: $SERVER_PID (port 3000)"

# Wait for server
for i in {1..20}; do
  if curl -s --max-time 1 http://localhost:3000/ > /dev/null 2>&1; then
    echo "  ✓ Server ready"
    break
  fi
  sleep 0.5
done

echo ""
echo "═══════════════════════════════════════════════"
echo "  Fleet Logger is running (mode: $MODE)"
echo "═══════════════════════════════════════════════"
echo "  Local:   http://localhost:3000"
if [ -n "$LAN_IP" ]; then
  echo "  Mobile:  http://${LAN_IP}:3000  (same WiFi)"
fi
echo "═══════════════════════════════════════════════"
echo "  Sidecar: http://127.0.0.1:5050/health"
echo "  Logs:    tail -f logs/server.log logs/sidecar.log"
echo "  Stop:    kill $SERVER_PID $SIDECAR_PID"
echo "═══════════════════════════════════════════════"
