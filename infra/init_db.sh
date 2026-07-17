#!/bin/bash
# Executado automaticamente pelo Postgres na primeira inicialização.
# Cria os 3 bancos usados pela stack, cada um isolado do outro:
#   - evolution_db     -> Evolution API
#   - n8n_db           -> n8n
#   - atendimento_db   -> Backend NestJS (o domínio do seu MVP)

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE evolution_db;
    CREATE DATABASE n8n_db;
    CREATE DATABASE atendimento_db;
EOSQL