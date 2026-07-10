-- =====================================================================
-- grant-founder-super-admin.sql  (re-runnable, NOT a migration)
-- =====================================================================
-- Grants the founder (lawaladams9@gmail.com) super_admin BY EMAIL - no
-- auth UID needed. Run this AFTER the founder has signed up, any number
-- of times. Use this if `supabase db push` was already run before the
-- founder signed up (the migration would have no-opped).
--
-- Apply (PowerShell, from repo root). NEVER the Dashboard SQL editor,
-- NEVER the Supabase MCP (read-only). Pipe to the linked DB, e.g.:
--   Get-Content supabase/scripts/admin/grant-founder-super-admin.sql | supabase db query --linked
-- or paste into a psql session bound to the linked database.
--
-- Verify after (direct query, not the cached client):
--   select id, role, disabled_at from public.admin_users;
-- =====================================================================

INSERT INTO public.admin_users (id, role, display_name)
SELECT u.id, 'super_admin'::public.admin_role, 'Lawal Adams'
FROM auth.users u
WHERE lower(u.email) = lower('lawaladams9@gmail.com')
ON CONFLICT (id) DO UPDATE
  SET role        = 'super_admin'::public.admin_role,
      disabled_at = NULL,
      updated_at  = now();
