-- ============================================================================
-- LIVE RLS exposure audit. Read-only. Writes nothing.
--
-- Run against PRODUCTION (and TEST) and paste the output back.
--   psql "<connection string>" -f scripts/security/rls-live-audit.sql
-- or paste each block into any SQL client.
--
-- WHY THIS EXISTS, and it is the most important comment in this file.
--
-- The first pass of this audit reasoned from 77 migration files. It was right on
-- two tables and WRONG on two: it reported `profiles` as an open question when
-- the lockdown had in fact reached production, and it reported `squads.share_token`
-- as world-readable when the live policy is scoped to the leader and members.
--
-- A migration is what somebody INTENDED. pg_policies is what the database DOES.
-- The two diverge whenever a migration was never applied, was applied out of
-- order, was hand-edited in a console, or was superseded by a later DROP that a
-- grep did not see. Only the catalogue is evidence.
--
-- So: no claim about live policy state belongs in a security report unless it
-- came from this file or an equivalent query.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- BLOCK 1. Every permissive SELECT policy reachable by an untrusted role.
--
-- "Reachable" means the policy applies to PUBLIC (no TO clause) or names anon or
-- authenticated, AND its USING expression does not pivot on the caller's
-- identity. That second condition is load-bearing: `USING (auth.role() =
-- 'service_role')` has no TO clause, so the role reaches it, but it can never
-- evaluate true for anon. Counting those turned a 2-table finding into a
-- 33-table one on the first pass.
--
-- `authenticated` counts as untrusted because signing up is free and unverified,
-- so it is not a security boundary.
-- ----------------------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual AS using_expression,
  CASE
    WHEN qual IS NULL OR btrim(qual) IN ('true', '(true)') THEN 'ENTIRE TABLE'
    ELSE 'filtered rows'
  END AS row_scope
FROM pg_policies
WHERE schemaname = 'public'
  AND permissive = 'PERMISSIVE'
  AND cmd IN ('SELECT', 'ALL')
  AND ('public' = ANY (roles) OR 'anon' = ANY (roles) OR 'authenticated' = ANY (roles))
  AND (
    qual IS NULL
    OR (
      qual NOT LIKE '%auth.uid()%'
      AND qual NOT LIKE '%auth.jwt()%'
      AND qual NOT LIKE '%auth.role()%'
      AND qual NOT LIKE '%request.jwt%'
    )
    -- a policy that deliberately names anon IS public, keep it
    OR qual LIKE '%''anon''%'
  )
ORDER BY row_scope DESC, tablename, policyname;


-- ----------------------------------------------------------------------------
-- BLOCK 2. THE ANSWER. Which SENSITIVE COLUMNS an untrusted role can actually
-- read, crossing the policies above with the real column privileges.
--
-- has_column_privilege is used rather than information_schema, because it
-- resolves inherited and role-membership grants the same way the planner does.
-- This is what makes the result authoritative: it accounts for both halves of
-- the control, the policy (rows) and the grant (columns).
--
-- An empty result set is the goal.
-- ----------------------------------------------------------------------------
WITH public_read AS (
  SELECT DISTINCT tablename, policyname, qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND permissive = 'PERMISSIVE'
    AND cmd IN ('SELECT', 'ALL')
    AND ('public' = ANY (roles) OR 'anon' = ANY (roles) OR 'authenticated' = ANY (roles))
    AND (
      qual IS NULL
      OR (
        qual NOT LIKE '%auth.uid()%'
        AND qual NOT LIKE '%auth.jwt()%'
        AND qual NOT LIKE '%auth.role()%'
        AND qual NOT LIKE '%request.jwt%'
      )
      OR qual LIKE '%''anon''%'
    )
),
classified AS (
  SELECT
    c.table_name,
    c.column_name,
    r.role,
    CASE
      WHEN c.column_name = 'email'                          THEN 'contact email (PII, mass-harvestable)'
      WHEN c.column_name = 'phone'                           THEN 'contact phone (PII, mass-harvestable)'
      WHEN c.column_name ~ '(^|_)email($|_)'                 THEN 'email address (PII)'
      WHEN c.column_name IN ('full_name','holder_name')      THEN 'person name (PII)'
      WHEN c.column_name IN ('dob','date_of_birth')          THEN 'personal detail (PII)'
      WHEN c.column_name ~ 'token$'                          THEN 'bearer token (CREDENTIAL)'
      WHEN c.column_name = 'secret' OR c.column_name ~ '_secret$' THEN 'bearer secret (CREDENTIAL)'
      WHEN c.column_name ~ '^(password|password_hash)$'      THEN 'password material (CREDENTIAL)'
      WHEN c.column_name ~ '^recovery'                       THEN 'recovery credential (CREDENTIAL)'
      WHEN c.column_name ~ '^access[-_]?code$'               THEN 'access code (CREDENTIAL)'
      WHEN c.column_name ~ '^stripe_'                        THEN 'payment/payout identifier'
      WHEN c.column_name IN ('user_id','owner_id','created_by','updated_by')
           OR c.column_name ~ '_user_id$'                    THEN 'foreign key to a person'
      WHEN c.column_name = 'metadata'                        THEN 'free-form JSONB'
      ELSE NULL
    END AS why
  FROM information_schema.columns c
  JOIN public_read p ON p.tablename = c.table_name
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
  WHERE c.table_schema = 'public'
    AND has_column_privilege(r.role, format('public.%I', c.table_name), c.column_name, 'SELECT')
)
SELECT table_name, column_name, why, string_agg(role, ', ' ORDER BY role) AS readable_by
FROM classified
WHERE why IS NOT NULL
GROUP BY table_name, column_name, why
ORDER BY
  CASE WHEN why LIKE '%CREDENTIAL%' THEN 0
       WHEN why LIKE '%PII%' THEN 1
       ELSE 2 END,
  table_name, column_name;


-- ----------------------------------------------------------------------------
-- BLOCK 3. Column privileges as they actually stand on the tables this pass
-- narrows. Run AFTER applying the migration to confirm it took effect.
--
-- Expect for organisations/anon exactly:
--   description, id, logo_url, name, slug, website
-- and NOTHING else. In particular no email, no phone, no stripe_*.
-- ----------------------------------------------------------------------------
SELECT
  c.table_name,
  r.role,
  string_agg(c.column_name, ', ' ORDER BY c.column_name) AS selectable_columns
FROM information_schema.columns c
CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
WHERE c.table_schema = 'public'
  AND c.table_name IN ('organisations', 'seats', 'event_artists', 'venues', 'profiles', 'squads')
  AND has_column_privilege(r.role, format('public.%I', c.table_name), c.column_name, 'SELECT')
GROUP BY c.table_name, r.role
ORDER BY c.table_name, r.role;


-- ----------------------------------------------------------------------------
-- BLOCK 4. Tables with RLS switched OFF entirely. A table with no RLS and a
-- default grant is readable by anon regardless of any policy, so an empty
-- pg_policies row for a table is not automatically good news.
-- ----------------------------------------------------------------------------
SELECT c.relname AS table_without_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
ORDER BY c.relname;
