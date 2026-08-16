#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Bitte als root starten: sudo ./install.sh"
  exit 1
fi

SOURCE_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
INSTALL_DIR=/var/www/home-dashboard
STATE_DIR=/var/lib/home-dashboard
DB_FILE=$STATE_DIR/dashboard.db
SERVICE_FILE=/etc/systemd/system/home-dashboard.service
NGINX_AVAILABLE=/etc/nginx/sites-available/home-dashboard
NGINX_ENABLED=/etc/nginx/sites-enabled/home-dashboard

for required_file in index.html style.css app.js auth.js server.py; do
  if [[ ! -f "$SOURCE_DIR/$required_file" ]]; then
    echo "Fehler: $required_file fehlt neben install.sh."
    exit 1
  fi
done

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Fehler: Diese Installation unterstützt Debian, Ubuntu und Raspberry Pi OS mit apt."
  exit 1
fi

echo "Installiere benötigte Pakete …"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx python3 iputils-ping

install -d -m 0755 "$INSTALL_DIR"
install -m 0644 "$SOURCE_DIR/index.html" "$SOURCE_DIR/style.css" "$SOURCE_DIR/app.js" "$SOURCE_DIR/auth.js" "$SOURCE_DIR/server.py" "$INSTALL_DIR/"
install -d -o www-data -g www-data -m 0750 "$STATE_DIR"

NEW_INSTALL=0
ADMIN_USERNAME=
ADMIN_PASSWORD=
if [[ ! -s "$DB_FILE" ]]; then
  NEW_INSTALL=1
  ADMIN_USERNAME="admin-$(python3 -c 'import secrets; print(secrets.token_hex(3))')"
  ADMIN_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')
  DASHBOARD_DB="$DB_FILE" DASHBOARD_ADMIN_USERNAME="$ADMIN_USERNAME" DASHBOARD_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    python3 -c "import sys; sys.path.insert(0, '$INSTALL_DIR'); import server; server.init_db()"
fi
chown www-data:www-data "$DB_FILE"
chmod 0640 "$DB_FILE"

cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=Home Dashboard Backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=$INSTALL_DIR
Environment=DASHBOARD_DB=$DB_FILE
Environment=DASHBOARD_PORT=8080
Environment=DASHBOARD_HOST=127.0.0.1
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart=/usr/bin/python3 $INSTALL_DIR/server.py
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$STATE_DIR

[Install]
WantedBy=multi-user.target
EOF

cat >"$NGINX_AVAILABLE" <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root $INSTALL_DIR;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        try_files \$uri \$uri/ =404;
    }

    location ~ /\\. { deny all; }
}
EOF

if [[ -e /etc/nginx/sites-enabled/default && ! -L /etc/nginx/sites-enabled/default ]]; then
  cp -n /etc/nginx/sites-enabled/default /etc/nginx/sites-available/default.before-home-dashboard || true
fi
rm -f /etc/nginx/sites-enabled/default
ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"

nginx -t
systemctl daemon-reload
systemctl enable --now home-dashboard.service
systemctl restart home-dashboard.service
systemctl enable --now nginx
systemctl reload nginx

SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
SERVER_IP=${SERVER_IP:-localhost}

echo
echo "============================================================"
echo " Home Dashboard wurde erfolgreich installiert"
echo " Adresse: http://$SERVER_IP"
if [[ $NEW_INSTALL -eq 1 ]]; then
  echo
  echo " Admin-Benutzer: $ADMIN_USERNAME"
  echo " Admin-Passwort: $ADMIN_PASSWORD"
  echo
  echo " Bitte diese Zugangsdaten jetzt sicher speichern."
else
  echo
  echo " Bestehende Datenbank erkannt – Zugangsdaten unverändert."
fi
echo "============================================================"
