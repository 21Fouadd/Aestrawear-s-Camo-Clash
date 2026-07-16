#!/usr/bin/env bash
set -Eeuo pipefail

readonly SERVICE_USER="camo-clash"
readonly SERVICE_GROUP="camo-clash"
readonly APP_ROOT="/opt/camo-clash"
readonly RELEASES_DIR="${APP_ROOT}/releases"
readonly CURRENT_LINK="${APP_ROOT}/current"
readonly CONFIG_DIR="/etc/camo-clash"
readonly ENV_TARGET="${CONFIG_DIR}/camo-clash.env"
readonly SERVICE_TARGET="/etc/systemd/system/camo-clash-server.service"
readonly NGINX_TARGET="/etc/nginx/conf.d/camo-clash.conf"
readonly NGINX_BOOTSTRAP="/etc/nginx/conf.d/camo-clash-bootstrap.conf"
readonly ACME_ROOT="/var/www/camo-clash-acme"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE=""
TRUSTED_HOSTNAME=""
ENV_SOURCE=""
CERT_EMAIL=""
EXPECTED_SHA256=""
declare -a ALLOWED_ORIGINS=()
STAGING_DIR=""
ORIGIN_MAP_FILE=""
BOOTSTRAP_CREATED=0

usage() {
  cat <<'EOF'
Usage:
  sudo ./deploy.sh \
    --archive /tmp/camo-clash-server.tar.gz \
    --sha256 <archive-sha256> \
    --hostname game-api.example.com \
    --origin https://camo-clash.example.com \
    --env-file /root/camo-clash.env \
    --cert-email ops@example.com

Options:
  --archive PATH       Required .tar.gz release. Its root must contain
                       package.json, package-lock.json, and dist/index.js.
  --hostname NAME      Required trusted DNS name used for WSS and TLS.
  --origin ORIGIN      Required HTTPS browser origin; repeat to allow more.
  --env-file PATH      Required on first deployment; optional later. Installed
                       outside releases as a root-only systemd environment file.
  --cert-email EMAIL   Required only when a certificate does not exist yet.
  --sha256 HEX         Optional but recommended archive integrity check.

The script never accepts credentials on the command line and never prints the
environment file. It expects Node.js >=22.13, npm, nginx, certbot, curl, and
systemd to be installed by the host bootstrap procedure in README.md.
EOF
}

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    rm -rf -- "$STAGING_DIR"
  fi
  if [[ -n "$ORIGIN_MAP_FILE" && -f "$ORIGIN_MAP_FILE" ]]; then
    rm -f -- "$ORIGIN_MAP_FILE"
  fi
  if ((BOOTSTRAP_CREATED == 1)) && [[ -f "$NGINX_BOOTSTRAP" ]]; then
    rm -f -- "$NGINX_BOOTSTRAP"
    if command -v nginx >/dev/null 2>&1 && nginx -t >/dev/null 2>&1; then
      systemctl reload nginx >/dev/null 2>&1 || true
    fi
  fi
}
trap cleanup EXIT

while (($#)); do
  case "$1" in
    --archive)
      (($# >= 2)) || fail "--archive requires a value"
      ARCHIVE="$2"
      shift 2
      ;;
    --hostname)
      (($# >= 2)) || fail "--hostname requires a value"
      TRUSTED_HOSTNAME="${2,,}"
      shift 2
      ;;
    --origin)
      (($# >= 2)) || fail "--origin requires a value"
      ALLOWED_ORIGINS+=("$2")
      shift 2
      ;;
    --env-file)
      (($# >= 2)) || fail "--env-file requires a value"
      ENV_SOURCE="$2"
      shift 2
      ;;
    --cert-email)
      (($# >= 2)) || fail "--cert-email requires a value"
      CERT_EMAIL="$2"
      shift 2
      ;;
    --sha256)
      (($# >= 2)) || fail "--sha256 requires a value"
      EXPECTED_SHA256="${2,,}"
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

((EUID == 0)) || fail "run as root with sudo"
[[ -n "$ARCHIVE" ]] || fail "--archive is required"
[[ -f "$ARCHIVE" ]] || fail "archive not found: $ARCHIVE"
[[ -n "$TRUSTED_HOSTNAME" ]] || fail "--hostname is required"
((${#ALLOWED_ORIGINS[@]} > 0)) || fail "at least one --origin is required"

[[ "$TRUSTED_HOSTNAME" =~ ^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$ ]] \
  || fail "--hostname must be a valid DNS name without a scheme or path"

for origin in "${ALLOWED_ORIGINS[@]}"; do
  [[ "$origin" =~ ^https://([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(:[0-9]{1,5})?$ ]] \
    || fail "origin must be an exact HTTPS origin without a path: $origin"
done

if [[ -n "$EXPECTED_SHA256" ]]; then
  [[ "$EXPECTED_SHA256" =~ ^[a-f0-9]{64}$ ]] || fail "--sha256 must be 64 hexadecimal characters"
fi

for tool in awk certbot chmod chown cp curl getent grep groupadd install mktemp mv nginx node npm readlink rm runuser sed sha256sum sleep systemctl tar useradd; do
  command -v "$tool" >/dev/null 2>&1 || fail "required command is missing: $tool"
done

node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 13) ? 0 : 1)' \
  || fail "Node.js 22.13 or newer is required"

if command -v getenforce >/dev/null 2>&1 && [[ "$(getenforce)" == "Enforcing" ]]; then
  command -v getsebool >/dev/null 2>&1 \
    || fail "SELinux is enforcing but getsebool is unavailable"
  getsebool httpd_can_network_connect 2>/dev/null | grep -q -- '--> on' \
    || fail "SELinux blocks the NGINX proxy; run: sudo setsebool -P httpd_can_network_connect 1"
fi

ARCHIVE="$(readlink -f -- "$ARCHIVE")"
if [[ -n "$ENV_SOURCE" ]]; then
  [[ -f "$ENV_SOURCE" ]] || fail "environment file not found: $ENV_SOURCE"
  ENV_SOURCE="$(readlink -f -- "$ENV_SOURCE")"
fi

ACTUAL_SHA256="$(sha256sum -- "$ARCHIVE" | awk '{print $1}')"
if [[ -n "$EXPECTED_SHA256" && "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]]; then
  fail "archive SHA-256 does not match --sha256"
fi
log "archive verified: ${ACTUAL_SHA256}"

# Reject path traversal and archive links before extracting as root.
while IFS= read -r entry; do
  case "$entry" in
    /*|../*|*/../*|*/..)
      fail "archive contains an unsafe path: $entry"
      ;;
  esac
done < <(tar -tzf "$ARCHIVE")

if tar -tvzf "$ARCHIVE" | awk 'substr($1,1,1) != "-" && substr($1,1,1) != "d" { found=1 } END { exit(found ? 0 : 1) }'; then
  fail "archive may contain only regular files and directories"
fi

if ! getent group "$SERVICE_GROUP" >/dev/null; then
  groupadd --system "$SERVICE_GROUP"
fi
if ! getent passwd "$SERVICE_USER" >/dev/null; then
  useradd --system --gid "$SERVICE_GROUP" --home-dir /var/lib/camo-clash \
    --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi

install -d -o root -g "$SERVICE_GROUP" -m 0750 "$APP_ROOT" "$RELEASES_DIR"
install -d -o root -g root -m 0750 "$CONFIG_DIR"
install -d -o root -g root -m 0755 "$ACME_ROOT"

if [[ -n "$ENV_SOURCE" ]]; then
  install -o root -g root -m 0600 "$ENV_SOURCE" "$ENV_TARGET"
elif [[ ! -f "$ENV_TARGET" ]]; then
  fail "first deployment requires --env-file; start from camo-clash.env.example"
fi
chown root:root "$ENV_TARGET"
chmod 0600 "$ENV_TARGET"

read_env_value() {
  local key="$1" line count value
  count="$(grep -cE "^[[:space:]]*${key}=" "$ENV_TARGET" || true)"
  [[ "$count" == "1" ]] || fail "$ENV_TARGET must define $key exactly once"
  line="$(grep -E "^[[:space:]]*${key}=" "$ENV_TARGET")"
  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if ((${#value} >= 2)) && [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

[[ "$(read_env_value NODE_ENV)" == "production" ]] || fail "NODE_ENV must be production"
[[ "$(read_env_value HOST)" == "127.0.0.1" ]] || fail "HOST must be 127.0.0.1"
[[ "$(read_env_value PORT)" == "3002" ]] || fail "PORT must be 3002"
[[ "$(read_env_value PUBLIC_BASE_URL)" == "https://${TRUSTED_HOSTNAME}" ]] \
  || fail "PUBLIC_BASE_URL must be https://${TRUSTED_HOSTNAME}"
[[ -n "$(read_env_value LOG_LEVEL)" ]] || fail "LOG_LEVEL must not be empty"

ticket_secret="$(read_env_value MATCH_TICKET_SECRET)"
if ((${#ticket_secret} < 32)) || [[ "$ticket_secret" == REPLACE_* || "$ticket_secret" == CHANGE_* ]]; then
  fail "MATCH_TICKET_SECRET must be a real secret of at least 32 characters"
fi
unset ticket_secret

configured_origins=",$(read_env_value ALLOWED_ORIGINS),"
for origin in "${ALLOWED_ORIGINS[@]}"; do
  [[ "$configured_origins" == *",${origin},"* ]] \
    || fail "ALLOWED_ORIGINS must contain the exact origin: $origin"
done
unset configured_origins

readonly RELEASE_ID="release-${ACTUAL_SHA256:0:16}"
readonly RELEASE_DIR="${RELEASES_DIR}/${RELEASE_ID}"

if [[ ! -d "$RELEASE_DIR" ]]; then
  STAGING_DIR="${RELEASES_DIR}/.staging-${ACTUAL_SHA256:0:16}-$$"
  install -d -o "$SERVICE_USER" -g "$SERVICE_GROUP" -m 0750 "$STAGING_DIR"
  tar --extract --gzip --file "$ARCHIVE" --directory "$STAGING_DIR" \
    --no-same-owner --no-same-permissions
  chown -R "$SERVICE_USER:$SERVICE_GROUP" "$STAGING_DIR"

  [[ -f "$STAGING_DIR/package.json" ]] || fail "archive root is missing package.json"
  [[ -f "$STAGING_DIR/package-lock.json" ]] || fail "archive root is missing package-lock.json"
  [[ -f "$STAGING_DIR/dist/index.js" ]] || fail "archive root is missing dist/index.js"

  log "installing locked production dependencies as $SERVICE_USER"
  runuser -u "$SERVICE_USER" -- env HOME=/var/lib/camo-clash \
    npm ci --omit=dev --no-audit --no-fund --prefix "$STAGING_DIR"
  node --check "$STAGING_DIR/dist/index.js"

  chown -R root:"$SERVICE_GROUP" "$STAGING_DIR"
  chmod -R u=rwX,g=rX,o= "$STAGING_DIR"
  mv -- "$STAGING_DIR" "$RELEASE_DIR"
  STAGING_DIR=""
else
  log "release already installed: $RELEASE_ID"
fi

NODE_BIN="$(readlink -f -- "$(command -v node)")"
sed "s|__NODE_BIN__|${NODE_BIN//&/\\&}|g" \
  "$SCRIPT_DIR/camo-clash-server.service.template" > "${SERVICE_TARGET}.tmp"
install -o root -g root -m 0644 "${SERVICE_TARGET}.tmp" "$SERVICE_TARGET"
rm -f -- "${SERVICE_TARGET}.tmp"

# Obtain the public certificate before switching the active release. The
# bootstrap server exposes only the ACME challenge directory.
CERT_DIR="/etc/letsencrypt/live/${TRUSTED_HOSTNAME}"
if [[ ! -s "$CERT_DIR/fullchain.pem" || ! -s "$CERT_DIR/privkey.pem" ]]; then
  [[ "$CERT_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] \
    || fail "--cert-email is required for first certificate issuance"

  cat > "$NGINX_BOOTSTRAP" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${TRUSTED_HOSTNAME};
    location ^~ /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type text/plain;
        try_files \$uri =404;
    }
    location / { return 404; }
}
EOF
  BOOTSTRAP_CREATED=1
  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
  certbot certonly --webroot --webroot-path "$ACME_ROOT" \
    --domain "$TRUSTED_HOSTNAME" --email "$CERT_EMAIL" \
    --agree-tos --non-interactive --keep-until-expiring
fi

ORIGIN_MAP_FILE="$(mktemp)"
for origin in "${ALLOWED_ORIGINS[@]}"; do
  printf '    "%s" 1;\n' "$origin" >> "$ORIGIN_MAP_FILE"
done
awk -v host="$TRUSTED_HOSTNAME" -v origins="$ORIGIN_MAP_FILE" '
  /__ALLOWED_ORIGIN_MAP__/ {
    while ((getline line < origins) > 0) print line
    close(origins)
    next
  }
  { gsub(/__HOSTNAME__/, host); print }
' "$SCRIPT_DIR/nginx-camo-clash.conf.template" > "${NGINX_TARGET}.tmp"
rm -f -- "$ORIGIN_MAP_FILE"
ORIGIN_MAP_FILE=""

previous_release=""
if [[ -L "$CURRENT_LINK" ]]; then
  previous_release="$(readlink -f -- "$CURRENT_LINK")"
fi
rm -f -- "${CURRENT_LINK}.next"
ln -s "$RELEASE_DIR" "${CURRENT_LINK}.next"
mv -Tf -- "${CURRENT_LINK}.next" "$CURRENT_LINK"

systemctl daemon-reload
systemctl enable camo-clash-server.service
systemctl restart camo-clash-server.service

healthy=0
for _ in {1..20}; do
  if bash "$SCRIPT_DIR/healthcheck.sh" --local >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done

if ((healthy == 0)); then
  log "new release failed its local health check"
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    rm -f -- "${CURRENT_LINK}.rollback"
    ln -s "$previous_release" "${CURRENT_LINK}.rollback"
    mv -Tf -- "${CURRENT_LINK}.rollback" "$CURRENT_LINK"
    systemctl restart camo-clash-server.service || true
    log "restored previous release: $previous_release"
  else
    systemctl stop camo-clash-server.service || true
    rm -f -- "$CURRENT_LINK"
  fi
  fail "deployment rolled back; inspect journalctl -u camo-clash-server.service"
fi

NGINX_BACKUP=""
if [[ -f "$NGINX_TARGET" ]]; then
  NGINX_BACKUP="$(mktemp)"
  cp -p -- "$NGINX_TARGET" "$NGINX_BACKUP"
fi
install -o root -g root -m 0644 "${NGINX_TARGET}.tmp" "$NGINX_TARGET"
rm -f -- "${NGINX_TARGET}.tmp"
if ! nginx -t; then
  if [[ -n "$NGINX_BACKUP" ]]; then
    cp -p -- "$NGINX_BACKUP" "$NGINX_TARGET"
  else
    rm -f -- "$NGINX_TARGET"
  fi
  rm -f -- "$NGINX_BACKUP"
  fail "rendered nginx configuration is invalid; previous config restored"
fi
rm -f -- "$NGINX_BACKUP" "$NGINX_BOOTSTRAP"
BOOTSTRAP_CREATED=0
systemctl enable --now nginx
systemctl reload nginx

if systemctl list-unit-files --type=timer | awk '$1 == "certbot.timer" { found=1 } END { exit(found ? 0 : 1) }'; then
  systemctl enable --now certbot.timer
fi

bash "$SCRIPT_DIR/healthcheck.sh" --hostname "$TRUSTED_HOSTNAME"
log "active release: $RELEASE_ID"
log "WSS endpoint: wss://${TRUSTED_HOSTNAME}/v2"
