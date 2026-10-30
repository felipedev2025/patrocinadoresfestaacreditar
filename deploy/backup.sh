#!/usr/bin/env bash
# Backup do banco e dos arquivos (logotipos originais e vídeos). Mantém 14 dias.
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/patrocinios}"
DEST="${BACKUP_DIR:-/var/backups/patrocinios}"
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$DEST"
cd "$APP_DIR"
docker compose exec -T postgres pg_dump -U patro -Fc patrocinios > "$DEST/db-$STAMP.dump"
docker run --rm -v "$(basename "$APP_DIR")_storage:/s:ro" -v "$DEST:/b" alpine tar czf "/b/storage-$STAMP.tgz" -C /s .
find "$DEST" -type f -mtime +14 -delete
echo "$(date -Is) backup ok: $DEST/*-$STAMP.*"
