-- =====================================================================
-- bootstrap-super-admin.sql  (one-shot, NOT a migration)
-- =====================================================================
-- Seeds the first super_admin row after migration 20260502000002 is
-- applied. Run this once from PowerShell against Sydney.
--
-- Usage (psql via supabase CLI):
--
--   $founderId = 'PASTE-AUTH-USERS-ID-HERE'
--   npx supabase db execute --linked --file supabase/scripts/admin/bootstrap-super-admin.sql --variable founder_id=$founderId
--
-- Or paste directly into psql session with :founder_id bound.
--
-- Idempotent. Safe to re-run.
-- =====================================================================

INSERT INTO public.admin_users (id, role, display_name)
VALUES (:'founder_id', 'super_admin', 'Lawal Adams')
ON CONFLICT (id) DO UPDATE
  SET role         = EXCLUDED.role,
      display_name = EXCLUDED.display_name,
      updated_at   = now();
