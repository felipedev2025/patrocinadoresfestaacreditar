#!/usr/bin/env bash
# Instalação em VPS Ubuntu 22.04/24.04 (ou Debian 12) — executar como root:
#   curl -fsSL https://raw.githubusercontent.com/felipedev2025/patrocinadoresfestaacreditar/main/deploy/install.sh -o install.sh && sudo bash install.sh
# ou, com o repositório já clonado:  sudo bash deploy/install.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/felipedev2025/patrocinadoresfestaacreditar.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/patrocinios}"

[ "$(id -u)" -eq 0 ] || { echo "Execute como root (sudo)."; exit 1; }

echo "==> Instalando Docker e utilitários"
if ! command -v docker >/dev/null; then
  apt-get update -y && apt-get install -y ca-certificates curl git openssl ufw
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null || apt-get install -y git
command -v openssl >/dev/null || apt-get install -y openssl

echo "==> Firewall: SSH, HTTP e HTTPS"
if command -v ufw >/dev/null; then
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
fi

echo "==> Código em $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH" && git -C "$APP_DIR" checkout "$BRANCH" && git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

if [ ! -f .env ]; then
  read -rp "Domínio (ex.: patrocinios.acreditar.org.br): " DOMAIN
  read -rp "E-mail do administrador (login e avisos do certificado): " ADMIN_EMAIL
  read -rp "Nome do administrador [Administrador]: " ADMIN_NAME; ADMIN_NAME="${ADMIN_NAME:-Administrador}"
  while true; do
    read -rsp "Senha do administrador (mín. 10, letras e números): " ADMIN_PASSWORD; echo
    [[ ${#ADMIN_PASSWORD} -ge 10 && "$ADMIN_PASSWORD" =~ [A-Za-z] && "$ADMIN_PASSWORD" =~ [0-9] ]] && break
    echo "Senha fraca, tente novamente."
  done
  CPUS=$(nproc); WORKER_CPUS=$(( CPUS > 2 ? CPUS - 1 : 1 ))
  cat > .env <<ENV
DOMAIN=${DOMAIN}
ACME_EMAIL=${ADMIN_EMAIL}
APP_URL=https://${DOMAIN}
APP_SECRET=$(openssl rand -base64 48 | tr -d '\n=/+')
POSTGRES_PASSWORD=$(openssl rand -hex 24)
NODE_ENV=production
STORAGE_DRIVER=local
UPLOAD_MAX_MB=10
RENDER_CONCURRENCY=1
RENDER_FRAME_CONCURRENCY=${WORKER_CPUS}
WORKER_CPUS=${WORKER_CPUS}
WORKER_MEMORY=4g
FFMPEG_PATH=ffmpeg
ADMIN_NAME="${ADMIN_NAME}"
ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD="${ADMIN_PASSWORD}"
ORG_NAME="Grupo Acreditar"
ENV
  chmod 600 .env
  echo "==> .env criado (segredos gerados automaticamente)"
fi

echo "==> Build e inicialização (a primeira vez leva alguns minutos)"
docker compose build
docker compose up -d

echo "==> Backup diário às 03:15"
install -m 750 deploy/backup.sh /usr/local/bin/patrocinios-backup
echo "15 3 * * * root APP_DIR=$APP_DIR /usr/local/bin/patrocinios-backup >> /var/log/patrocinios-backup.log 2>&1" > /etc/cron.d/patrocinios-backup

DOMAIN=$(grep ^DOMAIN= .env | cut -d= -f2)
echo
echo "Pronto! Aponte o DNS (registro A) de ${DOMAIN} para o IP desta VPS: $(curl -fsS https://api.ipify.org || echo '<IP>')"
echo "Depois acesse https://${DOMAIN} — o certificado HTTPS é emitido automaticamente."
echo "Logs: cd $APP_DIR && docker compose logs -f web worker"
