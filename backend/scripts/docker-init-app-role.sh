#!/bin/sh
# Runs once on first `docker compose up` (postgres /docker-entrypoint-initdb.d).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_user="${APP_DB_USER:-textile_app}" -v app_password="${APP_DB_PASSWORD:-app_password}" \
  -f /scripts/create_app_role.sql
