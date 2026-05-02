-- =====================================================================
-- 20260502000002_admin_foundation.sql
-- =====================================================================
-- M7 Admin Panel - Phase A1 - Admin Foundation.
--
-- Introduces the load-bearing schema for the EventLinqs admin surface:
--   admin_users   role-aware mirror of auth.users for admin access
--   admin_invites pre-account invitation tokens for new admins
--   audit_log     append-only ledger of every admin action
--
-- See docs/admin-marketing/phase-a1/scope.md for the full design.
-- Forward-only. Idempotent at the DDL level. No data seeded.
--
-- The super_admin row for the founder is NOT seeded by this migration; it is
-- created via supabase/scripts/admin/bootstrap-super-admin.sql after this
-- migration is applied. That keeps the migration data-free and reusable.
-- =====================================================================

-- ============= 0. Required extensions =============
-- citext powers case-insensitive email matching on admin_invites. Sydney
-- production does not have it enabled by default, so we install it
-- explicitly. Must run before any column reference of type CITEXT below.

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

-- ============= 1. Enums =============

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'admin_role') THEN
    CREATE TYPE public.admin_role AS ENUM (
      'super_admin',
      'admin',
      'support',
      'moderator'
    );
  END IF;
END$$;

COMMENT ON TYPE public.admin_role IS
  'EventLinqs admin role hierarchy. super_admin > admin > support, moderator. RBAC capabilities live in src/lib/admin/rbac.ts.';

-- ============= 2. admin_users =============

CREATE TABLE IF NOT EXISTS public.admin_users (
  id                       UUID PRIMARY KEY
    REFERENCES auth.users(id) ON DELETE CASCADE,
  role                     public.admin_role NOT NULL,
  display_name             TEXT NOT NULL,
  totp_secret_encrypted    TEXT,
  totp_enrolled_at         TIMESTAMPTZ,
  totp_recovery_codes_hashed JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_login_at            TIMESTAMPTZ,
  last_login_ip            INET,
  disabled_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES public.admin_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_users_role_active
  ON public.admin_users(role)
  WHERE disabled_at IS NULL;

COMMENT ON TABLE public.admin_users IS
  'Source of truth for EventLinqs admin access. Joined to auth.users by id. RLS: SELECT for active admins, all writes via service role only.';
COMMENT ON COLUMN public.admin_users.totp_secret_encrypted IS
  'AES-256-GCM ciphertext of the TOTP shared secret. Encrypted with ADMIN_TOTP_ENC_KEY.';
COMMENT ON COLUMN public.admin_users.totp_recovery_codes_hashed IS
  'JSON array of bcrypt-hashed one-time recovery codes. Each code is consumed on use.';
COMMENT ON COLUMN public.admin_users.disabled_at IS
  'Soft disable. When set, the row remains for audit but the admin cannot authenticate.';

-- ============= 3. admin_invites =============

CREATE TABLE IF NOT EXISTS public.admin_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT NOT NULL,
  role            public.admin_role NOT NULL,
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  accepted_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at      TIMESTAMPTZ,
  created_by      UUID NOT NULL REFERENCES public.admin_users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_invites_email_active
  ON public.admin_invites(email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_admin_invites_token_hash
  ON public.admin_invites(token_hash)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

COMMENT ON TABLE public.admin_invites IS
  'Pre-account invitation tokens. token_hash is sha256 of the raw token; the raw token is sent to the invitee once and not stored.';

-- ============= 4. audit_log =============

CREATE TABLE IF NOT EXISTS public.audit_log (
  id                     BIGSERIAL PRIMARY KEY,
  actor_id               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email_snapshot   TEXT,
  actor_role_snapshot    TEXT,
  action                 TEXT NOT NULL,
  target_type            TEXT,
  target_id              TEXT,
  metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip                     INET,
  user_agent             TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created
  ON public.audit_log(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_target
  ON public.audit_log(target_type, target_id, created_at DESC)
  WHERE target_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_action_created
  ON public.audit_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log(created_at DESC);

COMMENT ON TABLE public.audit_log IS
  'Append-only ledger of every admin action and security-relevant event. RLS denies UPDATE and DELETE to all roles.';
COMMENT ON COLUMN public.audit_log.action IS
  'Dotted namespace, e.g. admin.session.login.success, admin.org.tier.update. Reserved namespaces: admin.* (admin actions), system.* (automated).';
COMMENT ON COLUMN public.audit_log.actor_email_snapshot IS
  'Email frozen at write time so the audit row is meaningful even if the auth.users row is later deleted.';

-- ============= 5. updated_at trigger for admin_users =============

CREATE OR REPLACE FUNCTION public.tg_admin_users_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_users_set_updated_at ON public.admin_users;

CREATE TRIGGER admin_users_set_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.tg_admin_users_set_updated_at();

-- ============= 6. RLS policies =============

ALTER TABLE public.admin_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log     ENABLE ROW LEVEL SECURITY;

-- 6.1 admin_users: SELECT for any active admin; writes via service role only.
DROP POLICY IF EXISTS admin_users_select_for_active_admins ON public.admin_users;
CREATE POLICY admin_users_select_for_active_admins
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.id = auth.uid()
        AND a.disabled_at IS NULL
    )
  );

-- INSERT/UPDATE/DELETE: no policy = denied for non-service-role.
-- Service role bypasses RLS; that is the only path for writes.

-- 6.2 admin_invites: service-role only. No SELECT policy for authenticated.
-- (Empty policy set = deny all for authenticated. Service role bypasses RLS.)

-- 6.3 audit_log: SELECT for admin/super_admin/support; INSERT via service role;
-- UPDATE and DELETE denied to all (append-only ledger).
DROP POLICY IF EXISTS audit_log_select_for_admins ON public.audit_log;
CREATE POLICY audit_log_select_for_admins
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users a
      WHERE a.id = auth.uid()
        AND a.disabled_at IS NULL
        AND a.role IN ('super_admin', 'admin', 'support')
    )
  );

-- No UPDATE or DELETE policy. Combined with RLS enabled, this denies UPDATE
-- and DELETE to every role except service_role (which bypasses RLS by
-- design; we never use service_role to mutate audit rows in product code).

-- ============= 7. Grants =============

GRANT SELECT ON public.admin_users TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

-- admin_invites is service-role only; no authenticated grants.

-- =====================================================================
-- End of migration. Apply with: npx supabase db push --linked --yes
-- After applying, run scripts/admin/bootstrap-super-admin.sql once with
-- the founder's auth.users.id to create the first super_admin row.
-- =====================================================================
