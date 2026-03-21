#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
NGINX_SITE_NAME="recycling-swap-shop"
NGINX_SITE_PATH="/etc/nginx/sites-available/${NGINX_SITE_NAME}"
SYSTEMD_SERVICE_NAME="recycling-api.service"
SYSTEMD_SERVICE_PATH="/etc/systemd/system/${SYSTEMD_SERVICE_NAME}"
SSH_HARDENING_PATH="/etc/ssh/sshd_config.d/99-hardening.conf"

DOMAIN=""
GIT_REPO_URL=""
GIT_BRANCH="main"
APP_DIR="/opt/recycling-swap-shop"
APP_USER="recycling"
DB_NAME="recycling_swap_shop"
DB_USER=""
DB_PASSWORD=""
AUTH_SECRET=""
LETSENCRYPT_EMAIL=""
SEED_STAFF="yes"

log() {
  printf '[%s] %s\n' "$SCRIPT_NAME" "$1"
}

fatal() {
  printf '[%s] ERROR: %s\n' "$SCRIPT_NAME" "$1" >&2
  exit 1
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fatal "Run this script as root (or with sudo)."
  fi
}

require_ubuntu() {
  if [[ ! -f /etc/os-release ]]; then
    fatal "Cannot detect OS. /etc/os-release is missing."
  fi
  # shellcheck disable=SC1091
  source /etc/os-release
  if [[ "${ID:-}" != "ubuntu" ]]; then
    fatal "This script supports Ubuntu only. Detected ID=${ID:-unknown}."
  fi
}

prompt_required() {
  local var_name="$1"
  local prompt_text="$2"
  local value=""
  while [[ -z "$value" ]]; do
    read -r -p "$prompt_text" value
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
  done
  printf -v "$var_name" '%s' "$value"
}

prompt_default() {
  local var_name="$1"
  local prompt_text="$2"
  local default_value="$3"
  local value=""
  read -r -p "$prompt_text [$default_value]: " value
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ -z "$value" ]]; then
    value="$default_value"
  fi
  printf -v "$var_name" '%s' "$value"
}

prompt_secret() {
  local var_name="$1"
  local prompt_text="$2"
  local value=""
  while [[ -z "$value" ]]; do
    read -r -s -p "$prompt_text" value
    printf '\n'
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
  done
  printf -v "$var_name" '%s' "$value"
}

validate_identifier() {
  local label="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    fatal "${label} must match ^[A-Za-z_][A-Za-z0-9_]*$ for safe PostgreSQL role/database creation."
  fi
}

collect_inputs() {
  log "Collecting runtime inputs..."
  prompt_required DOMAIN "Domain (e.g. shop.example.org.za): "
  prompt_required GIT_REPO_URL "Git repository URL: "
  prompt_default GIT_BRANCH "Git branch" "main"
  prompt_default APP_DIR "Application directory" "/opt/recycling-swap-shop"
  prompt_default APP_USER "Application system user" "recycling"
  prompt_required DB_NAME "PostgreSQL database name: "
  prompt_required DB_USER "PostgreSQL database user: "
  prompt_secret DB_PASSWORD "PostgreSQL database password: "
  prompt_secret AUTH_SECRET "API AUTH_SECRET: "
  read -r -p "Let's Encrypt email (optional, press Enter to skip): " LETSENCRYPT_EMAIL
  prompt_default SEED_STAFF "Seed default staff users? (yes/no)" "no"
  if [[ "$SEED_STAFF" != "yes" && "$SEED_STAFF" != "no" ]]; then
    fatal "SEED_STAFF must be 'yes' or 'no'."
  fi
  validate_identifier "DB_NAME" "$DB_NAME"
  validate_identifier "DB_USER" "$DB_USER"
}

apt_update_upgrade() {
  log "Updating package index and upgrading packages..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get upgrade -y
}

install_hardening_packages() {
  log "Installing OS hardening packages..."
  apt-get install -y ufw fail2ban unattended-upgrades apt-listchanges
}

configure_ssh_hardening() {
  log "Configuring SSH hardening..."
  mkdir -p /etc/ssh/sshd_config.d
  mkdir -p /run/sshd
  chmod 0755 /run/sshd
  cat >"$SSH_HARDENING_PATH" <<'EOF'
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
EOF

  sshd -t
  if systemctl restart ssh; then
    return
  fi

  if systemctl list-unit-files | grep -q '^sshd\.service'; then
    systemctl restart sshd
    return
  fi

  fatal "Unable to find an SSH service unit to restart."
}

configure_firewall() {
  log "Configuring UFW firewall..."
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
}

enable_fail2ban() {
  log "Enabling fail2ban..."
  systemctl enable fail2ban
  systemctl restart fail2ban
}

enable_unattended_upgrades() {
  log "Enabling unattended upgrades..."
  dpkg-reconfigure -f noninteractive unattended-upgrades
}

create_app_user() {
  log "Creating app user if needed..."
  if id -u "$APP_USER" >/dev/null 2>&1; then
    log "User $APP_USER already exists."
  else
    useradd --system --create-home --home-dir "/home/$APP_USER" --shell /usr/sbin/nologin "$APP_USER"
  fi
}

install_nginx() {
  log "Installing NGINX..."
  apt-get install -y nginx
}

configure_nginx_http_site() {
  log "Writing NGINX HTTP configuration..."
  cat >"$NGINX_SITE_PATH" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${APP_DIR}/apps/web/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

  ln -sfn "$NGINX_SITE_PATH" "/etc/nginx/sites-enabled/${NGINX_SITE_NAME}"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl enable nginx
  systemctl restart nginx
}

install_runtime_packages() {
  log "Installing runtime dependencies..."
  apt-get install -y git curl ca-certificates build-essential postgresql postgresql-contrib
}

install_nodejs_22() {
  log "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
}

verify_toolchain() {
  log "Verifying toolchain versions..."
  node -v
  npm -v
  psql --version
}

configure_postgresql() {
  log "Configuring PostgreSQL role and database..."
  systemctl enable postgresql
  systemctl restart postgresql

  local escaped_password
  escaped_password="${DB_PASSWORD//\'/\'\'}"

  if su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"" | grep -q 1; then
    su - postgres -c "psql -c \"ALTER ROLE \\\"${DB_USER}\\\" WITH PASSWORD '${escaped_password}';\""
  else
    su - postgres -c "psql -c \"CREATE ROLE \\\"${DB_USER}\\\" LOGIN PASSWORD '${escaped_password}';\""
  fi

  su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"" | grep -q 1 || \
    su - postgres -c "psql -c \"CREATE DATABASE \\\"${DB_NAME}\\\" OWNER \\\"${DB_USER}\\\";\""
}

clone_or_update_repo() {
  log "Fetching application source..."
  mkdir -p "$(dirname "$APP_DIR")"

  if [[ ! -d "$APP_DIR/.git" ]]; then
    rm -rf "$APP_DIR"
    install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
    sudo -u "$APP_USER" -H git clone --branch "$GIT_BRANCH" "$GIT_REPO_URL" "$APP_DIR"
  else
    local existing_remote
    existing_remote="$(sudo -u "$APP_USER" -H git -C "$APP_DIR" remote get-url origin)"
    if [[ "$existing_remote" != "$GIT_REPO_URL" ]]; then
      fatal "Existing repo remote mismatch at $APP_DIR. Expected $GIT_REPO_URL but found $existing_remote."
    fi
    if [[ -n "$(sudo -u "$APP_USER" -H git -C "$APP_DIR" status --porcelain)" ]]; then
      fatal "Existing repo at $APP_DIR has uncommitted changes. Refusing to update."
    fi
    sudo -u "$APP_USER" -H git -C "$APP_DIR" fetch origin
    sudo -u "$APP_USER" -H git -C "$APP_DIR" checkout "$GIT_BRANCH"
    sudo -u "$APP_USER" -H git -C "$APP_DIR" pull --ff-only origin "$GIT_BRANCH"
  fi

  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
}

run_app_build() {
  log "Installing npm dependencies and building apps..."
  rm -rf "$APP_DIR/apps/web/dist" "$APP_DIR/apps/api/dist"
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm ci"
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm run prisma:generate"
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm run build:web"
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm run build:api"
}

write_api_env() {
  log "Writing API environment file..."
  mkdir -p "$APP_DIR/apps/api"
  cat >"$APP_DIR/apps/api/.env" <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}?schema=public
AUTH_SECRET=${AUTH_SECRET}
AUTH_TOKEN_TTL_SECONDS=3600
API_PORT=3001
EOF
  chown "$APP_USER:$APP_USER" "$APP_DIR/apps/api/.env"
  chmod 640 "$APP_DIR/apps/api/.env"
}

run_prisma_steps() {
  log "Running Prisma generate..."
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm run prisma:generate"

  if sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && node -e \"const p=require('./package.json'); process.exit((p.scripts && p.scripts['prisma:migrate:deploy']) ? 0 : 1)\""; then
    log "Found prisma:migrate:deploy script. Running production-safe migrations..."
    sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm run prisma:migrate:deploy"
  else
    fatal "No production-safe migration script found (expected prisma:migrate:deploy). Refusing to run prisma:migrate (dev). Add prisma:migrate:deploy and rerun."
  fi
}

install_projections() {
  log "Installing projections..."
  sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm run projections:install"
}

seed_staff_if_requested() {
  if [[ "$SEED_STAFF" == "yes" ]]; then
    log "Seeding default staff users..."
    sudo -u "$APP_USER" -H bash -lc "cd '$APP_DIR' && npm run seed:staff"
  else
    log "Skipping default staff seed."
  fi
}

detect_api_entry() {
  if [[ -f "$APP_DIR/apps/api/dist/start.js" ]]; then
    printf '%s' "$APP_DIR/apps/api/dist/start.js"
    return 0
  fi
  if [[ -f "$APP_DIR/apps/api/dist/src/start.js" ]]; then
    printf '%s' "$APP_DIR/apps/api/dist/src/start.js"
    return 0
  fi
  if [[ -f "$APP_DIR/apps/api/dist/apps/api/src/start.js" ]]; then
    printf '%s' "$APP_DIR/apps/api/dist/apps/api/src/start.js"
    return 0
  fi
  return 1
}

configure_systemd_service() {
  log "Configuring systemd service for API..."
  local api_entry
  api_entry="$(detect_api_entry)" || fatal "Could not find compiled API entrypoint in apps/api/dist."

  cat >"$SYSTEMD_SERVICE_PATH" <<EOF
[Unit]
Description=Recycling Swap Shop API
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/apps/api/.env
ExecStart=/usr/bin/node ${api_entry}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  chmod 644 "$SYSTEMD_SERVICE_PATH"

  systemctl daemon-reload
  systemctl enable "$SYSTEMD_SERVICE_NAME"
  systemctl restart "$SYSTEMD_SERVICE_NAME"
  systemctl --no-pager --full status "$SYSTEMD_SERVICE_NAME"
}

install_certbot() {
  log "Installing certbot..."
  apt-get install -y certbot python3-certbot-nginx
}

get_public_ipv4() {
  curl -4 -fsS https://api.ipify.org
}

get_domain_ipv4() {
  local resolved_ips

  resolved_ips="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u)" || true
  if [[ -n "$resolved_ips" ]]; then
    printf '%s\n' "$resolved_ips"
    return 0
  fi

  resolved_ips="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | sort -u)" || true
  if [[ -n "$resolved_ips" ]]; then
    printf '%s\n' "$resolved_ips"
    return 0
  fi

  return 1
}

verify_domain_points_to_server() {
  log "Checking DNS before certificate issuance..."
  local server_ip
  local domain_ips
  server_ip="$(get_public_ipv4)" || fatal "Unable to determine server public IPv4."
  domain_ips="$(get_domain_ipv4)" || fatal "Unable to resolve domain IPv4."

  if ! grep -Fxq "$server_ip" <<<"$domain_ips"; then
    printf 'WARNING: Domain %s resolves to:\n%s\n' "$DOMAIN" "$domain_ips" >&2
    fatal "Domain ${DOMAIN} does not resolve to this server IP (${server_ip}). Fix DNS and rerun."
  fi
}

obtain_letsencrypt_certificate() {
  log "Requesting Let's Encrypt certificate..."
  if [[ -n "$LETSENCRYPT_EMAIL" ]]; then
    certbot --nginx --non-interactive --agree-tos --email "$LETSENCRYPT_EMAIL" -d "$DOMAIN" --redirect
  else
    certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email -d "$DOMAIN" --redirect
  fi
  systemctl enable certbot.timer >/dev/null 2>&1 || true
  systemctl restart certbot.timer >/dev/null 2>&1 || true
}

print_summary() {
  cat <<EOF

Bootstrap complete.

Active site URL:
  https://${DOMAIN}

Service checks:
  systemctl status ${SYSTEMD_SERVICE_NAME}
  systemctl status nginx

Config locations:
  NGINX site: ${NGINX_SITE_PATH}
  API env: ${APP_DIR}/apps/api/.env

Logs and validation:
  journalctl -u ${SYSTEMD_SERVICE_NAME} -f
  nginx -t
  certbot renew --dry-run

Rerun safety notes:
  - Safe for existing app user, PostgreSQL role/database, and systemd service.
  - Repo updates require a clean working tree in ${APP_DIR}.
  - Script will refuse unsafe Prisma dev migrations in production.
EOF
}

main() {
  require_root
  require_ubuntu
  collect_inputs

  apt_update_upgrade
  install_hardening_packages
  configure_ssh_hardening
  configure_firewall
  enable_fail2ban
  enable_unattended_upgrades
  create_app_user

  install_nginx
  configure_nginx_http_site

  install_runtime_packages
  install_nodejs_22
  verify_toolchain
  configure_postgresql

  clone_or_update_repo
  run_app_build
  write_api_env
  run_prisma_steps
  install_projections
  seed_staff_if_requested
  configure_systemd_service

  install_certbot
  verify_domain_points_to_server
  obtain_letsencrypt_certificate

  print_summary
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi

