#!/usr/bin/env bash
set -Eeuo pipefail

MODE="public"
HOSTNAME_VALUE=""
SERVICE_NAME="camo-clash-server.service"

usage() {
  cat <<'EOF'
Usage:
  healthcheck.sh --hostname game-api.example.com
  healthcheck.sh --local

Checks the systemd service when systemctl is available, then requires a 2xx
response from /healthz. Public checks require valid HTTPS and never bypass TLS.
EOF
}

fail() {
  printf 'healthcheck: %s\n' "$*" >&2
  exit 1
}

while (($#)); do
  case "$1" in
    --hostname)
      (($# >= 2)) || fail "--hostname requires a value"
      HOSTNAME_VALUE="$2"
      shift 2
      ;;
    --local)
      MODE="local"
      shift
      ;;
    --service)
      (($# >= 2)) || fail "--service requires a value"
      SERVICE_NAME="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v grep >/dev/null 2>&1 || fail "grep is required"

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files "$SERVICE_NAME" >/dev/null 2>&1; then
  systemctl is-active --quiet "$SERVICE_NAME" || fail "$SERVICE_NAME is not active"
fi

if [[ "$MODE" == "local" ]]; then
  URL="http://127.0.0.1:3002/healthz"
  CURL_PROTOCOL=(--proto '=http')
else
  [[ -n "$HOSTNAME_VALUE" ]] || fail "--hostname is required for a public check"
  [[ "$HOSTNAME_VALUE" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$ ]] \
    || fail "hostname is not a valid DNS name"
  URL="https://${HOSTNAME_VALUE}/healthz"
  CURL_PROTOCOL=(--proto '=https' --tlsv1.2)
fi

response="$(curl --fail --silent --show-error \
  --connect-timeout 3 \
  --max-time 8 \
  "${CURL_PROTOCOL[@]}" \
  "$URL")"

printf '%s' "$response" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' \
  || fail "$URL returned 2xx without an ok=true health payload"

printf 'healthy: %s\n' "$URL"
