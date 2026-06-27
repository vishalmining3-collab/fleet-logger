#!/bin/bash
# Quick smoke test — run this any time to verify the app is working.
# Usage:  ./test-app.sh
cd "$(dirname "$0")"

BOLD="\033[1m"
GREEN="\033[0;32m"
RED="\033[0;31m"
YELLOW="\033[1;33m"
NC="\033[0m"

pass=0
fail=0

check() {
  local desc="$1"
  local result="$2"
  if echo "$result" | grep -q "200\|transcript\|\"id\":\|\"entries\":\|\"inKm\":\|\"outKm\":"; then
    echo -e "  ${GREEN}✓${NC} $desc"
    pass=$((pass+1))
  else
    echo -e "  ${RED}✗${NC} $desc"
    echo "    Got: $(echo "$result" | head -c 200)"
    fail=$((fail+1))
  fi
}

echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Fleet Logger — Smoke Test${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""

# Check services
if lsof -ti:3000 >/dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} Server up on :3000 (PID $(lsof -ti:3000))"
else
  echo -e "  ${RED}✗${NC} Server DOWN on :3000 — run: ./start.sh"
  exit 1
fi

if lsof -ti:5050 >/dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} Sidecar up on :5050 (PID $(lsof -ti:5050))"
else
  echo -e "  ${RED}✗${NC} Sidecar DOWN on :5050 — run: ./start.sh"
  exit 1
fi

echo ""
echo "Network endpoints (what the browser calls):"
echo ""

check "1. GET / (HTML page)" "$(curl -s -w '\nHTTP:%{http_code}' http://localhost:3000/)"
check "2. GET /api/health" "$(curl -s -w '\nHTTP:%{http_code}' http://localhost:3000/api/health)"
check "3. POST /api/chat" "$(curl -s -X POST -H 'Content-Type: application/json' -d '{"transcript":"Rajesh in WB 02 AB 1234, out at 09:00, in at 18:00, hospital run"}' -w '\nHTTP:%{http_code}' http://localhost:3000/api/chat)"
check "4. POST /api/tts (en-US)" "$(curl -s -X POST -H 'Content-Type: application/json' -d '{"text":"Hello.","language":"en-US"}' -w '\nHTTP:%{http_code}' -o /tmp/_tts.ogg http://localhost:3000/api/tts | xxd | head -1)"
check "5. POST /api/tts (hi-IN)" "$(curl -s -X POST -H 'Content-Type: application/json' -d '{"text":"Namaste.","language":"hi-IN"}' -w '\nHTTP:%{http_code}' -o /tmp/_tts_hi.ogg http://localhost:3000/api/tts | xxd | head -1)"
check "6. POST /api/entries" "$(curl -s -X POST -H 'Content-Type: application/json' -d '{"id":"smoke","date":"2026-06-22","carNumber":"WB 02","driverName":"X","duty":"Y","inTime":"09:00","outTime":"18:00","inKm":0,"outKm":0}' -w '\nHTTP:%{http_code}' http://localhost:3000/api/entries)"

# Cleanup
curl -s -X DELETE http://localhost:3000/api/entries/smoke -o /dev/null

echo ""
echo "Unit tests:"
npm test 2>&1 | grep -E "^[0-9]+ passed" | sed 's/^/  /'

echo ""
if [ $fail -eq 0 ]; then
  echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  ALL CHECKS PASSED  ($pass/${pass})${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
  echo ""
  echo "Open the app at:"
  echo "  http://localhost:3000  (this Mac)"
  LAN_IP=$(ipconfig getifaddr en0 2>/dev/null)
  [ -n "$LAN_IP" ] && echo "  http://$LAN_IP:3000  (mobile, same WiFi)"
else
  echo -e "${RED}═══════════════════════════════════════════════${NC}"
  echo -e "${RED}  $fail CHECKS FAILED${NC}"
  echo -e "${RED}═══════════════════════════════════════════════${NC}"
  echo "  Try: ./start.sh   (to restart everything)"
fi
rm -f /tmp/_tts.ogg /tmp/_tts_hi.ogg
