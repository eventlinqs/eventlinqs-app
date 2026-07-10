-- =====================================================================
-- 20260608000001_grant_founder_super_admin.sql
-- =====================================================================
-- Grants the founder (lawaladams9@gmail.com) the super_admin role in
-- public.admin_users, resolved BY EMAIL so no auth UID is needed.
--
-- Idempotent (ON CONFLICT) and safe to re-apply. Depends on the admin
-- foundation (20260502000003_admin_foundation.sql) being applied.
--
-- PRECONDITION: the founder must have signed up first, so an auth.users
-- row for the email exists when this is applied. If not, this is a safe
-- no-op (0 rows) - sign up, then re-grant via the re-runnable script
-- supabase/scripts/admin/grant-founder-super-admin.sql (same statement).
--
-- Apply (PowerShell, from the repo root) - NEVER the Dashboard, NEVER MCP:
--   supabase db push --linked
-- (Check what is pending first: supabase migration list --linked)
-- =====================================================================

INSERT INTO public.admin_users (id, role, display_name)
SELECT u.id, 'super_admin'::public.admin_role, 'Lawal Adams'
FROM auth.users u
WHERE lower(u.email) = lower('lawaladams9@gmail.com')
ON CONFLICT (id) DO UPDATE
  SET role        = 'super_admin'::public.admin_role,
      disabled_at = NULL,
      updated_at  = now();
