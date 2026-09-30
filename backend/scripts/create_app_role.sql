-- Least-privilege application role for Textile ERP.
--
-- Why: PostgreSQL superusers and roles with BYPASSRLS ignore row-level
-- security entirely, even with FORCE ROW LEVEL SECURITY. The API must connect
-- as a role that is neither, or tenant isolation silently disappears.
-- Migrations run as the schema owner; the app runs as this role.
--
-- Usage (idempotent):
--   psql "$OWNER_URL" -v app_user=textile_app -v app_password=secret -f scripts/create_app_role.sql

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE',
              :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user')
\gexec

GRANT CONNECT ON DATABASE :"DBNAME" TO :"app_user";
GRANT USAGE ON SCHEMA public TO :"app_user";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"app_user";
-- Tables created by future migrations (run as the current owner) are granted too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app_user";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"app_user";
