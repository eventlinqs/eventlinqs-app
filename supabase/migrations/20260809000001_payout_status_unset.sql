-- ============================================================================
-- payout_status: add an 'unset' state for an organisation with no Stripe account
-- Run by founder: supabase db push --linked
-- ============================================================================
--
-- THE INCIDENT. Organisation 8baf2eaa-c592-41b7-a303-3df92b2eaa77 could not
-- publish a paid event. Stripe reported the connected account fully enabled,
-- capabilities transfers=active and card_payments=active, zero errors, zero
-- past_due, bank account attached. The platform held payout_status 'restricted',
-- and the publish gate refused with "Resolve the Stripe issue" when there was no
-- Stripe issue. It took an UPDATE against production to release it.
--
-- Part of the cause is this column's domain:
--
--   payout_status TEXT NOT NULL DEFAULT 'active'
--     CHECK (payout_status IN ('active', 'on_hold', 'restricted'))
--       -- 20260428000001_m6_connect_schema.sql:38
--
-- There is no value meaning "this organisation has no Stripe account, so no payout
-- status applies". So the deauthorize handler had to pick one of three, and it
-- picked 'restricted'. That is a lie about a disconnected organisation, and it is
-- the lie the publish gate then read back and refused on. It is also why the
-- founder's own reset SQL failed: there was nothing safe to set the column to.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THE CHOICE: a fourth value, NOT nullable. Justified, because both work and the
-- reasons are not obvious.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- NULLABLE was considered and rejected on one specific hazard: SQL three-valued
-- logic would make the existing guards silently wrong in the dangerous direction.
-- The platform filters on this column with expressions of the form
--
--     payout_status <> 'restricted'
--
-- and `NULL <> 'restricted'` evaluates to NULL, not TRUE, so a nullable column
-- would quietly DROP disconnected organisations out of any such result set rather
-- than including them. Every read site would need an `IS NULL` branch added, and
-- the failure mode for forgetting one is an invisible omission rather than an
-- error. That is the same shape of defect as the one being fixed here.
--
-- A FOURTH VALUE keeps the column NOT NULL, keeps every comparison two-valued, is
-- self-describing when a human reads the row, and needs no change at any read site
-- that only cares whether the value equals 'restricted'.
--
-- 'unset' is deliberately not called 'disconnected' or 'none': the column is about
-- payout status, and the honest statement is that there is not one, rather than an
-- assertion about the connection.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES NOT TOUCH
-- ─────────────────────────────────────────────────────────────────────────────
--
-- No charge, payout, fee or refund logic. No amounts. No rows in orders, payments,
-- payouts, pricing_rules or organiser_balance_ledger. This migration widens one
-- CHECK constraint and repairs rows that are provably in the impossible state.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HOW TO RUN IT
-- ─────────────────────────────────────────────────────────────────────────────
--
--   supabase db push --linked
--
-- SUCCESS CRITERIA, in order:
--
--   1. The constraint accepts the new value:
--        SELECT 'unset'::text IN ('active','on_hold','restricted','unset');
--      and this now succeeds instead of raising a check violation:
--        UPDATE public.organisations SET payout_status = 'unset'
--         WHERE stripe_account_id IS NULL;
--
--   2. Every organisation with no Stripe account reads 'unset':
--        SELECT count(*) FROM public.organisations
--         WHERE stripe_account_id IS NULL AND payout_status <> 'unset';
--      EXPECT 0.
--
--   3. No organisation WITH an account was touched:
--        SELECT count(*) FROM public.organisations
--         WHERE stripe_account_id IS NOT NULL AND payout_status = 'unset';
--      EXPECT 0.
--
--   4. The founder's own organisation is releasable from the browser rather than
--      by SQL. After applying, press Refresh Stripe status on /dashboard/payouts
--      for 8baf2eaa-c592-41b7-a303-3df92b2eaa77 and confirm payout_status becomes
--      'active' with no further intervention.
--
-- ROLLBACK, if needed. The widening is additive, so rolling back only matters if
-- rows already hold 'unset':
--   UPDATE public.organisations SET payout_status = 'restricted'
--    WHERE payout_status = 'unset';
--   ALTER TABLE public.organisations DROP CONSTRAINT organisations_payout_status_check;
--   ALTER TABLE public.organisations ADD CONSTRAINT organisations_payout_status_check
--     CHECK (payout_status IN ('active','on_hold','restricted'));
-- ============================================================================

BEGIN;

-- 1. Widen the domain. The constraint name is the one Postgres generated for the
--    inline CHECK in 20260428000001; dropping IF EXISTS keeps this safe to re-run.
ALTER TABLE public.organisations
  DROP CONSTRAINT IF EXISTS organisations_payout_status_check;

ALTER TABLE public.organisations
  ADD CONSTRAINT organisations_payout_status_check
  CHECK (payout_status IN ('active', 'on_hold', 'restricted', 'unset'));

-- 2. Repair the impossible state: no Stripe account, yet carrying a payout status.
--    This is the half-cleared row the founder found. Everything else in
--    DISCONNECTED_STATE (src/lib/stripe/reconcile-connect.ts) is reset with it, so
--    the row is internally consistent afterwards rather than partly repaired.
UPDATE public.organisations
   SET payout_status               = 'unset',
       stripe_onboarding_complete  = FALSE,
       stripe_charges_enabled      = FALSE,
       stripe_payouts_enabled      = FALSE,
       stripe_account_country      = NULL,
       stripe_capabilities         = '{}'::jsonb,
       stripe_requirements         = '{}'::jsonb,
       payout_destination          = NULL,
       updated_at                  = NOW()
 WHERE stripe_account_id IS NULL
   AND (
     payout_status <> 'unset'
     OR stripe_onboarding_complete IS TRUE
     OR stripe_charges_enabled IS TRUE
     OR stripe_payouts_enabled IS TRUE
     OR stripe_account_country IS NOT NULL
     OR payout_destination IS NOT NULL
     OR stripe_capabilities <> '{}'::jsonb
     OR stripe_requirements <> '{}'::jsonb
   );

COMMENT ON COLUMN public.organisations.payout_status IS
  'active | on_hold | restricted | unset. '
  '''unset'' means the organisation has no connected Stripe account, so no payout '
  'status applies; it is NOT a restriction and must never be treated as one. '
  '''on_hold'' is an EventLinqs admin decision and Stripe knows nothing about it, '
  'so the reconciler preserves it rather than overwriting it with Stripe''s view. '
  '''active'' and ''restricted'' mirror Stripe payouts_enabled and are written only '
  'by src/lib/stripe/reconcile-connect.ts. See docs/security/ for the incident that '
  'produced this column''s fourth value.';

COMMIT;
