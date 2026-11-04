#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
CODE="${CODE:-DEM-O01}"

json_field() {
  bun -e 'const data = JSON.parse(await Bun.stdin.text()); process.stdout.write(String(data[process.argv[1]] ?? ""))' "$1"
}

echo "health"
curl -fsS "$BASE_URL/healthz"
echo

echo "status"
curl -fsS "$BASE_URL/v1/status"
echo

echo "review pairing qr"
curl -fsS -o /dev/null "$BASE_URL/review-pairing-qr.png"
echo "qr served"

echo "claim"
CLAIM="$(curl -fsS -X POST -H 'content-type: application/json' -d '{"name":"ignored"}' "$BASE_URL/v1/pairing-codes/$CODE/claim")"
TOKEN="$(printf '%s' "$CLAIM" | json_field credential)"
if [[ -z "$TOKEN" ]]; then
  echo "claim did not return a credential" >&2
  exit 1
fi
echo "credential acquired"

AUTH=(-H "Authorization: Bearer $TOKEN")

echo "workspaces"
curl -fsS "${AUTH[@]}" "$BASE_URL/v1/workspaces?limit=100"
echo

echo "sessions"
SESSIONS="$(curl -fsS "${AUTH[@]}" "$BASE_URL/v1/sessions")"
printf '%s\n' "$SESSIONS"
SESSION_ID="$(printf '%s' "$SESSIONS" | bun -e 'const data = JSON.parse(await Bun.stdin.text()); process.stdout.write(data.items?.[0]?.sessionId ?? "")')"
if [[ -z "$SESSION_ID" ]]; then
  echo "no demo session found" >&2
  exit 1
fi

echo "sse (first frames)"
timeout 2 curl -sN "${AUTH[@]}" "$BASE_URL/v1/sessions/$SESSION_ID/events?agentId=opencode" |
  head -n 20 || true

echo "smoke ok"
