#!/usr/bin/env bash
# Moonlight Neurocare: one-command setup on an Ubuntu 24.04 (recommended) or 22.04 VPS.
#
#   1. Point DNS at the server: A records for moonlightneurocare.com and www.moonlightneurocare.com.
#   2. Upload and unzip the project anywhere on the server, then run as root from the project folder:
#        sudo DOMAIN=moonlightneurocare.com EMAIL=you@example.com bash deploy/setup-vps.sh
#   3. Create the first admin with the command printed at the end.
#
# To update later: upload the new code and run the same command again. It reinstalls dependencies, rebuilds the
# website and restarts the API. Settings (backend/.env, frontend/.env), the database, uploaded files and the
# Nginx/SSL setup are never overwritten.
#
# Options (environment variables):
#   DOMAIN       required, e.g. moonlightneurocare.com
#   EMAIL        email for the free SSL certificate (Let's Encrypt). Without it, SSL is skipped.
#   WWW_DOMAIN   default www.$DOMAIN; set to "none" if there is no www record
#   LOCAL_MONGO  yes (default) = install MongoDB 8.0 on this server, reachable only from the server itself
#                no = use the MONGO_URL already set in backend/.env (e.g. MongoDB Atlas)
#   APP_DIR      default /opt/moonlight
# Server size: 2 vCPU, 4 GB RAM and 40 GB disk recommended (virus scanning and page rendering use memory).
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "Run as root: sudo DOMAIN=yourdomain.com EMAIL=you@example.com bash deploy/setup-vps.sh"; exit 1; }
DOMAIN=${DOMAIN:?Set DOMAIN, e.g. DOMAIN=moonlightneurocare.com}
EMAIL=${EMAIL:-}
WWW_DOMAIN=${WWW_DOMAIN:-www.$DOMAIN}
[[ $WWW_DOMAIN == none ]] && WWW_DOMAIN=
LOCAL_MONGO=${LOCAL_MONGO:-yes}
APP_DIR=${APP_DIR:-/opt/moonlight}
APP_USER=moonlight
DATA_DIR=/var/lib/moonlight
STORAGE_DIR=$DATA_DIR/storage
LOG_DIR=/var/log/moonlight
VENV=$APP_DIR/venv
BROWSERS=$APP_DIR/pw-browsers
SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PRERENDER="$VENV/bin/python $APP_DIR/deploy/prerender.py --site https://$DOMAIN --build $APP_DIR/frontend/build"

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
as_app() { sudo -u "$APP_USER" -H env HOME="$DATA_DIR" PLAYWRIGHT_BROWSERS_PATH="$BROWSERS" "$@"; }

. /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} =~ ^(22.04|24.04)$ ]] || warn "Tested on Ubuntu 22.04/24.04; this is ${PRETTY_NAME:-unknown}. Continuing."
FIRST_RUN=no
[[ -f /etc/systemd/system/moonlight-api.service ]] || FIRST_RUN=yes

step "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q python3 python3-venv python3-pip nginx clamav clamav-freshclam ffmpeg certbot \
  python3-certbot-nginx curl gnupg rsync ca-certificates fonts-dejavu-core
systemctl enable --now clamav-freshclam   # keeps virus definitions current (first download takes a few minutes)

if ! swapon --show | grep -q . && [[ $(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo) -lt 3500 ]]; then
  step "Adding 2 GB swap (server has under 4 GB RAM)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v node >/dev/null || [[ $(node -p 'process.versions.node.split(".")[0]') -lt 22 ]]; then
  step "Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
command -v yarn >/dev/null || npm install -g yarn@1.22.22

if [[ $LOCAL_MONGO == yes ]] && ! command -v mongod >/dev/null; then
  step "MongoDB 8.0 (listens on 127.0.0.1 only)"
  curl -fsSL https://pgp.mongodb.com/server-8.0.asc | gpg --yes -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${VERSION_CODENAME}/mongodb-org/8.0 multiverse" \
    > /etc/apt/sources.list.d/mongodb-org-8.0.list
  apt-get update -q && apt-get install -y -q mongodb-org
  systemctl daemon-reload
fi
[[ $LOCAL_MONGO == yes ]] && systemctl enable --now mongod

step "App user and code ($APP_DIR)"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$STORAGE_DIR" "$LOG_DIR"
if [[ $SRC != "$APP_DIR" ]]; then
  # Settings, build output and installed packages on the server are kept.
  rsync -a --delete --exclude node_modules --exclude build --exclude 'build-*' --exclude .git --exclude __pycache__ \
    --exclude backend/.env --exclude frontend/.env --exclude venv --exclude pw-browsers "$SRC"/ "$APP_DIR"/
fi

ENV_FILE=$APP_DIR/backend/.env
FRONT_ENV=$APP_DIR/frontend/.env
# A settings file uploaded with the code is used the first time only.
[[ -f $ENV_FILE || ! -f $SRC/backend/.env ]] || cp "$SRC/backend/.env" "$ENV_FILE"
[[ -f $FRONT_ENV || ! -f $SRC/frontend/.env ]] || cp "$SRC/frontend/.env" "$FRONT_ENV"
if [[ ! -f $ENV_FILE ]]; then
  if [[ $LOCAL_MONGO != yes ]]; then
    echo "LOCAL_MONGO=no: copy backend/.env.example to $ENV_FILE and set MONGO_URL first."; exit 1
  fi
  step "Creating backend/.env (new encryption key and cron secret)"
  KEY=$(python3 -c 'import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())')
  SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(40))')
  cat > "$ENV_FILE" <<EOF
APP_MODE=production
PRODUCTION_ORG_ID=moonlight-gurugram
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=moonlight
WEB_ORIGIN=https://$DOMAIN
EXTRA_ALLOWED_ORIGINS=${WWW_DOMAIN:+https://$WWW_DOMAIN}
DATA_ENCRYPTION_KEY=$KEY
WEBHOOK_CRON_SECRET=$SECRET
STORAGE_BACKEND=local
STORAGE_DIR=$STORAGE_DIR
MALWARE_SCAN=required
PRERENDER_COMMAND=$PRERENDER
EOF
  warn "Moving from Emergent? Put the old DATA_ENCRYPTION_KEY into $ENV_FILE, or saved Gmail/WhatsApp passwords can't be read."
fi
grep -q '^PRERENDER_COMMAND=' "$ENV_FILE" || echo "PRERENDER_COMMAND=$PRERENDER" >> "$ENV_FILE"
[[ -f $FRONT_ENV ]] || printf 'REACT_APP_BACKEND_URL=https://%s\nREACT_APP_SITE_URL=https://%s\n' "$DOMAIN" "$DOMAIN" > "$FRONT_ENV"
chmod 600 "$ENV_FILE"
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR" "$LOG_DIR"

step "Python packages and the page-rendering browser"
[[ -x $VENV/bin/python ]] || as_app python3 -m venv "$VENV"
as_app "$VENV/bin/pip" install -q --upgrade pip
as_app "$VENV/bin/pip" install -q -r "$APP_DIR/backend/requirements-server.txt" -r "$APP_DIR/deploy/requirements-prerender.txt"
PLAYWRIGHT_BROWSERS_PATH=$BROWSERS "$VENV/bin/python" -m playwright install-deps chromium
as_app "$VENV/bin/python" -m playwright install chromium

step "Building the website"
cd "$APP_DIR/frontend"
as_app NODE_OPTIONS=--max-old-space-size=2048 yarn install --frozen-lockfile --non-interactive --network-timeout 600000
rm -rf build-new
as_app NODE_OPTIONS=--max-old-space-size=2048 CI=false BUILD_PATH=build-new yarn build
cp build-new/index.html build-new/_app.html   # app shell for pages that have no saved HTML yet
chown "$APP_USER:$APP_USER" build-new/_app.html
# Swap in one step so visitors never see a half-written site.
[[ -d build ]] && mv build build-old
mv build-new build && rm -rf build-old

step "API service"
cat > /etc/systemd/system/moonlight-api.service <<EOF
[Unit]
Description=Moonlight Neurocare API
After=network-online.target mongod.service
Wants=network-online.target

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/backend
Environment=HOME=$DATA_DIR
Environment=PLAYWRIGHT_BROWSERS_PATH=$BROWSERS
# One worker only: scheduled work and the page refresh run inside the process.
ExecStart=$VENV/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable moonlight-api >/dev/null
systemctl restart moonlight-api
for _ in $(seq 1 40); do curl -fsS http://127.0.0.1:8001/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8001/api/health || { warn "API did not start. Check: journalctl -u moonlight-api -n 50"; exit 1; }
echo

NGINX_SITE=/etc/nginx/sites-available/moonlight
if [[ ! -f $NGINX_SITE ]]; then
  step "Nginx"
  {
    if [[ -n $WWW_DOMAIN ]]; then
      cat <<EOF
server {
  listen 80;
  server_name $WWW_DOMAIN;
  return 301 https://$DOMAIN\$request_uri;
}

EOF
    fi
    cat <<EOF
server {
  listen 80;
  server_name $DOMAIN;
  root $APP_DIR/frontend/build;
  client_max_body_size 130m;   # practice videos up to 120 MB
  gzip on;
  gzip_types text/plain text/css application/javascript application/json application/xml image/svg+xml;

  location /api/ {
    proxy_pass http://127.0.0.1:8001;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
  }

  location /static/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    add_header X-Content-Type-Options nosniff;
    try_files \$uri =404;
  }

  # Saved HTML for Google/AI first (page/index.html), then the app shell for everything else (portal, login).
  location / {
    add_header Cache-Control "no-cache";
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;
    try_files \$uri \$uri/index.html /_app.html;
  }
}
EOF
  } > "$NGINX_SITE"
  ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/moonlight
  rm -f /etc/nginx/sites-enabled/default
fi
nginx -t && { systemctl reload nginx || systemctl restart nginx; }
if ufw status 2>/dev/null | grep -q "Status: active"; then ufw allow 'Nginx Full' >/dev/null; fi

if [[ -n $EMAIL && ! -d /etc/letsencrypt/live/$DOMAIN ]]; then
  step "SSL certificate"
  certbot --nginx --non-interactive --agree-tos -m "$EMAIL" --redirect -d "$DOMAIN" ${WWW_DOMAIN:+-d "$WWW_DOMAIN"} \
    || certbot --nginx --non-interactive --agree-tos -m "$EMAIL" --redirect -d "$DOMAIN" \
    || warn "SSL not issued. Check the DNS A record points here, then run: certbot --nginx -d $DOMAIN ${WWW_DOMAIN:+-d $WWW_DOMAIN}"
fi

step "Scheduled jobs and backups"
chmod +x "$APP_DIR/deploy/backup.sh" "$APP_DIR/deploy/cron-job.sh"
cat > /etc/cron.d/moonlight <<EOF
# Moonlight Neurocare. Times are UTC: 21:45 = 03:15 IST, Sat 03:30 = Sat 09:00 IST, 12:30 = 18:00 IST (session reminders).
SHELL=/bin/bash
45 21 * * * $APP_USER $APP_DIR/deploy/cron-job.sh virus-definitions >> $LOG_DIR/cron.log 2>&1
30 3 * * 6  $APP_USER $APP_DIR/deploy/cron-job.sh school-digest >> $LOG_DIR/cron.log 2>&1
30 12 * * * $APP_USER $APP_DIR/deploy/cron-job.sh daily-care >> $LOG_DIR/cron.log 2>&1
15 22 * * * $APP_USER HOME=$DATA_DIR PLAYWRIGHT_BROWSERS_PATH=$BROWSERS $PRERENDER >> $LOG_DIR/prerender.log 2>&1
30 21 * * * root $APP_DIR/deploy/backup.sh >> $LOG_DIR/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/moonlight

step "Pages for Google and AI assistants"
if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
  as_app $PRERENDER || warn "Some pages were not saved; the site still works. Re-run later: sudo -u $APP_USER $PRERENDER"
else
  warn "https://$DOMAIN is not reachable yet (DNS/SSL). After it is, run:"
  echo "    sudo -u $APP_USER -H env PLAYWRIGHT_BROWSERS_PATH=$BROWSERS $PRERENDER"
fi

step "Done"
curl -fsS http://127.0.0.1:8001/api/health; echo
echo "Website: https://$DOMAIN    Admin: https://$DOMAIN/login"
if [[ $FIRST_RUN == yes ]]; then
  echo
  echo "Create the first admin (asks for a password; 2-step setup happens at first sign-in):"
  echo "    cd $APP_DIR/backend && sudo -u $APP_USER $VENV/bin/python create_admin.py --email head@$DOMAIN --name \"Center Head\""
  echo "Then: Admin -> Settings -> Gmail app password and WhatsApp -> Send test. See DEPLOY.md."
fi
