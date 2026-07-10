-- MIG-01 verification (run AFTER `supabase db push --linked`).
--
-- Direct database query, NOT the cached PostgREST/supabase-js client (its
-- schema cache lags after a migration and would report a false positive).
-- Run with the linked DB connection string, e.g.:
--
--   psql "$SUPABASE_DB_URL" -f scripts/verify-mig-20260608000004.sql
--
-- or from the Supabase CLI shell. PASS = the migration row exists AND both
-- override columns are present on public.admin_users.

\echo '--- 1. migration recorded in schema_migrations (expect one row: 20260608000004) ---'
SELECT version
FROM supabase_migrations.schema_migrations
WHERE version = '20260608000004';

\echo '--- 2. override columns present on public.admin_users (expect 2 rows) ---'
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'admin_users'
  AND column_name IN ('capabilities_granted', 'capabilities_revoked')
ORDER BY column_name;
