#!/usr/bin/env bash
# Atualiza a instalação, corrige o .env e confere se tudo subiu.
# Uso (na VPS, como root):
#   cd /opt/patrocinios && git pull && bash deploy/corrigir.sh
# Não pede nada e não mostra segredos na tela.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

ok()   { echo "  ✔ $*"; }
warn() { echo "  ⚠ $*"; }
fail() { echo "  ✖ $*"; exit 1; }

echo "==> 1/3 Conferindo o .env"
[ -f .env ] || fail ".env não encontrado em $(pwd)"
backup=".env.bak.$(date +%Y%m%d-%H%M%S)"
cp -p .env "$backup" && chmod 600 "$backup" && ok "cópia de segurança: $backup"

sed -i '/^sk-ant/d' .env                                  # chave colada solta numa linha
grep -q '^ANTHROPIC_API_KEY=' .env || echo 'ANTHROPIC_API_KEY=' >> .env
case "$(grep -m1 '^ANTHROPIC_API_KEY=' .env | cut -d= -f2-)" in
  sk-ant-api03-*) ok "chave da IA no formato correto" ;;
  "")             warn "leitura por IA desligada (sem chave). Importação por XLSX/CSV funciona normalmente." ;;
  *)              sed -i 's|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=|' .env
                  warn "o valor de ANTHROPIC_API_KEY não é uma chave de API (precisa começar com sk-ant-api03-); foi removido. IA desligada." ;;
esac
bad=$(grep -vcE '^[A-Z_]+=|^#|^$' .env)
[ "$bad" = "0" ] && ok ".env no formato correto" || fail "$bad linha(s) inválida(s) no .env. Restaure com: cp $backup .env"
chmod 600 .env

echo "==> 2/3 Recompilando e reiniciando (pode levar alguns minutos)"
if ! docker compose up -d --build >/tmp/patrocinios-deploy.log 2>&1; then
  tail -n 30 /tmp/patrocinios-deploy.log
  fail "falha no build/inicialização (log completo em /tmp/patrocinios-deploy.log)"
fi
ok "containers atualizados (código $(git log -1 --format=%h))"

echo "==> 3/3 Conferindo"
mig=$(docker inspect -f '{{.State.ExitCode}}' "$(docker compose ps -aq migrate)" 2>/dev/null || echo "?")
[ "$mig" = "0" ] && ok "migrations do banco aplicadas" || warn "migrations: código de saída $mig (veja: docker compose logs migrate)"

site="?"
for _ in $(seq 1 30); do
  site=$(docker compose exec -T web node -e "fetch('http://localhost:3000/login').then(r=>console.log(r.status)).catch(()=>console.log('erro'))" 2>/dev/null | tr -d '\r')
  [ "$site" = "200" ] && break
  sleep 2
done
[ "$site" = "200" ] && ok "site respondendo" || fail "site não respondeu (veja: docker compose logs --tail=50 web)"

ia=$(docker compose exec -T web sh -c 'case "$ANTHROPIC_API_KEY" in sk-ant-api03-*) echo on;; *) echo off;; esac' | tr -d '\r')
[ "$ia" = "on" ] && ok "leitura por IA ligada" || warn "leitura por IA desligada (opcional)"

domain=$(grep -m1 '^DOMAIN=' .env | cut -d= -f2-)
echo
echo "Pronto. Acesse https://${domain}"
