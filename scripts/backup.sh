#!/usr/bin/env bash
# Backup da produção (docker-compose.prod.yml): os 3 bancos do Postgres, os
# arquivos de mídia do backend (backend/uploads) e a sessão da Evolution API
# (volume evolution_instances — sem ela, restaurar exige escanear o QR de novo).
#
# Uso (a partir de qualquer pasta):   ./scripts/backup.sh
# Agendado (cron, todo dia às 3h):    0 3 * * * /caminho/do/repo/scripts/backup.sh >> /var/log/mare-backup.log 2>&1
#
# Lê BACKUP_REMOTO e BACKUP_DIAS_RETENCAO do .env da raiz. Com BACKUP_REMOTO
# preenchido, envia a pasta do dia pro destino via rclone (precisa de
# "rclone config" feito antes). Restauração: ver DEPLOY-VPS.md.

set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

# shellcheck disable=SC1091
set -a; source .env; set +a

COMPOSE=(docker compose -f docker-compose.prod.yml)
DATA="$(date +%Y-%m-%d_%H%M)"
DESTINO="$RAIZ/backups/$DATA"
RETENCAO="${BACKUP_DIAS_RETENCAO:-7}"

mkdir -p "$DESTINO"
echo "[$(date)] Backup em $DESTINO"

for banco in atendimento_db evolution_db n8n_db; do
  "${COMPOSE[@]}" exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc "$banco" > "$DESTINO/$banco.dump"
done

tar -czf "$DESTINO/uploads.tar.gz" -C "$RAIZ/backend" uploads

docker run --rm -v mare_evolution_instances:/dados:ro -v "$DESTINO":/saida alpine \
  tar -czf /saida/evolution_instances.tar.gz -C /dados .

if [[ -n "${BACKUP_REMOTO:-}" ]]; then
  rclone copy "$DESTINO" "$BACKUP_REMOTO/$DATA"
  echo "[$(date)] Enviado para $BACKUP_REMOTO/$DATA"
else
  echo "[$(date)] AVISO: BACKUP_REMOTO vazio — backup ficou só nesta VPS."
fi

find "$RAIZ/backups" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENCAO" -exec rm -rf {} +
echo "[$(date)] OK"
