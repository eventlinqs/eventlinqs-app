-- =============================================================================
-- 20260608000004_admin_user_capability_overrides.sql
--
-- Per-admin capability overrides so the founder can tune one admin's
-- capabilities on top of their role, from the admin panel. Effective
-- capabilities = (role capability set UNION capabilities_granted) MINUS
-- capabilities_revoked. super_admin always has every capability (founder
-- override) and ignores revokes - enforced in src/lib/admin/rbac.ts.
--
-- Idempotent. Safe to re-run. Existing rows default to empty overrides, so
-- behaviour is unchanged until the founder grants/revokes a capability.
-- =============================================================================

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS capabilities_granted text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS capabilities_revoked text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.admin_users.capabilities_granted IS
  'Extra admin capabilities granted to this user on top of their role set. Effective = (role set UNION granted) MINUS revoked. Ignored for super_admin (always full).';
COMMENT ON COLUMN public.admin_users.capabilities_revoked IS
  'Admin capabilities revoked from this user despite their role set. Ignored for super_admin (founder retains override of everything).';
