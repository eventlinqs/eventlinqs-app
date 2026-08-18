-- ============================================================================
-- Column lockdown, STAGE 3: organisations. THE ONE THAT CAUSED THE OUTAGE.
-- Run by founder: supabase db push --linked
-- Proven on TEST first: scripts/verify/rls-stage2-proof.mjs
-- Audit: docs/security/AUDIT-2026-08-08.md CRITICAL-1
-- ASVS v5.0.0: 8.2.3 (field-level authorisation, BOPLA), 8.2.2
-- ============================================================================
--
-- READ THIS BEFORE APPLYING. These four statements are, character for character,
-- the ones that took every event page on production to 404 on 2026-08-08. They are
-- safe now for exactly one reason: 20260819000001 removed the thing that made them
-- dangerous. Applying this file WITHOUT that one repeats the outage.
--
-- THE FILENAME ORDER IS THE SAFETY MECHANISM. `supabase db push` applies migrations
-- in filename order, so 20260819000001 (the policy refactor) necessarily runs before
-- 20260819000002 (this file). That is why the two can go in a single push. Do not
-- renumber this file below the refactor, and do not apply it to a database whose
-- policies have not been refactored.
--
-- WHAT WENT WRONG THE FIRST TIME, proven rather than reasoned
-- (scripts/verify/rls-policy-dependency-probe.mjs). A row security policy is an
-- expression evaluated with the CALLER's privileges. Forty-four policies across
-- thirty-two tables subqueried organisations or organisation_members for an
-- ownership check. While anon held table-level SELECT on organisations those
-- subqueries were legal; the moment it was revoked, SELECT on 29 tables failed with
--
--     42501  permission denied for table organisations
--
-- and that set includes events, ticket_tiers and tickets. Every public surface on
-- the platform, from one revoke. The review that shipped it checked the queries the
-- APPLICATION issues, all of which were correct. The queries the DATABASE issues on
-- the application's behalf were never in scope.
--
-- 20260819000001 moved every one of those lookups into SECURITY DEFINER helpers, so
-- evaluating a policy no longer requires the caller to hold SELECT on organisations.
-- With that in place, this revoke was measured on TEST as: 15 of 15 sensitive
-- columns denied to anon, 0 of 63 anon-readable tables lost, all 8 public
-- application select lists still working, and all 32 policy-affected tables
-- returning the identical row count to a real organiser with 276 events.
--
-- WHAT THIS CLOSES. Ten columns that are readable right now with the NEXT_PUBLIC
-- anon key, which sits in every page's source:
--
--   email, phone                 organiser contact details, in bulk
--   owner_id                     maps an organisation to a real auth.users id
--   metadata                     free-form
--   stripe_account_id            the Connect account id
--   stripe_account_country
--   stripe_charges_enabled       the entire Connect posture, which also tells a
--   stripe_payouts_enabled       competitor which organisers cannot currently sell
--   stripe_onboarding_complete
--   stripe_capabilities
--   stripe_requirements          including what Stripe is still asking them for
--   payout_tier, payout_status, payout_destination, risk_tier
--   hold_amount_cents, total_volume_cents   lifetime money moved, per organiser
--
-- Founder ruling 2026-08-08: the public organisation fields are id, name, slug,
-- description, logo_url, website. Nothing else.
--
-- WHY BOTH anon AND authenticated. `authenticated` is one Postgres role serving the
-- public browser that happens to be logged in AND the organisation's own staff.
-- Column privileges are per role and cannot separate them, and signing up is free
-- and unverified, so leaving `authenticated` with full access is the same bulk
-- harvest with one extra step. The separation is made in the application: the
-- owner-only dashboard reads that genuinely need these columns use the service-role
-- client gated on owner_id = auth.uid(), which is the pattern src/lib/payouts/auth.ts
-- already uses and which scripts/security/revoked-column-reads.mjs enforces.
--
-- THE ROW POLICY IS RETAINED AND ALREADY NAMES ITS ROLES. It must keep admitting
-- both roles or every public PostgREST embed (organisation:organisations(name) on
-- the events surfaces, including the session-client /feed queries) returns null. Row
-- visibility was never the defect; column visibility was.
--
-- VERIFY AFTER APPLYING, with the anon key:
--   GET /rest/v1/organisations?select=email,phone
--     -> must be 4xx "permission denied for column email", never rows
--   GET /rest/v1/organisations?select=id,name,slug,logo_url
--     -> must still return the active organisations
--   Then in the app: an event page renders WITH its organiser name, the organiser
--   public profile renders, /dashboard/payouts still shows the Stripe status, and a
--   paid event still shows a working buy button (that last one is the sale gate,
--   which reads the Stripe posture with a privileged client; see
--   scripts/guards/migration-needs-sale-gate-fix.mjs).
-- ============================================================================

BEGIN;

REVOKE SELECT ON public.organisations FROM anon;
REVOKE SELECT ON public.organisations FROM authenticated;

GRANT SELECT (id, name, slug, description, logo_url, website)
  ON public.organisations TO anon;
GRANT SELECT (id, name, slug, description, logo_url, website)
  ON public.organisations TO authenticated;

COMMENT ON TABLE public.organisations IS
  'Organiser accounts. anon and authenticated hold SELECT on ONLY '
  '(id, name, slug, description, logo_url, website) by column privilege. '
  'email, phone, owner_id, metadata and every stripe_* column are readable '
  'solely by the service role. Do not GRANT further columns to anon or '
  'authenticated: RLS cannot restrain columns and a policy cannot re-add a '
  'privilege. Row policies must never subquery this table either, or evaluating '
  'them will require a privilege the caller does not hold: use '
  'public.el_owned_organisation_ids() and its siblings (20260819000001). '
  'See docs/security/AUDIT-2026-08-08.md CRITICAL-1.';

COMMIT;
