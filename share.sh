#!/bin/bash
# Fleet Logger Secure Sharing Launcher via localhost.run (Production Mode)
set -e

cd "$(dirname "$0")"

# Explicitly set production environment variable so the backend serves the compiled static bundle
export NODE_ENV=production

# 1. Start local Node server and Python speech sidecar (Production Mode)
echo "Starting local Node server and Python speech sidecar (Production Mode)..."
./start.sh prod

# Ensure logs directory exists
mkdir -p logs

# 2. Start SSH tunnel via localhost.run in background
echo "Establishing secure tunnel..."
nohup ssh -tt -o StrictHostKeyChecking=no -R 80:localhost:3000 nokey@localhost.run < /dev/null > logs/tunnel.log 2>&1 &
TUNNEL_PID=$!

# 3. Wait for the URL to be generated
for i in {1..30}; do
  if grep -q "tunneled with tls termination" logs/tunnel.log; then
    break
  fi
  sleep 0.5
done

# Extract URL from logs
URL=$(grep -o '[a-zA-Z0-9.-]*\.lhr\.life' logs/tunnel.log | head -n 1)

if [ -z "$URL" ]; then
  echo "Error: Failed to generate tunnel URL. Check logs/tunnel.log"
  kill $TUNNEL_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "═════════════════════════════════════════════════════════"
echo "  Fleet Logger Secure Public Tunnel"
echo "═════════════════════════════════════════════════════════"
echo "  Direct URL for Client (NO passwords, NO bypass codes):"
echo "  >>>  https://$URL  <<<"
echo "═════════════════════════════════════════════════════════"
echo ""

# Keep running to maintain the background tunnel
wait $TUNNEL_PID
