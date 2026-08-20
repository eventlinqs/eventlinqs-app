-- ============================================================================
-- Column lockdown, STAGE 1: the three tables no RLS policy depends on.
-- Run by founder: supabase db push --linked
-- Proven on TEST first: scripts/verify/rls-lockdown-test-proof.mjs --stage stage1
-- Audit: docs/security/AUDIT-2026-08-08.md, docs/roast/refund-stripe-audit-permissions-2026-08-18.md
-- ASVS v5.0.0: 8.2.3 (field-level authorisation, BOPLA), 8.3.1
-- ============================================================================
--
-- WHY THIS EXISTS RATHER THAN RE-RUNNING 20260808000010.
--
-- 20260808000010 is recorded as APPLIED on production (verified against
-- supabase_migrations.schema_migrations on 18 August 2026), so `db push` will
-- never run it again. Its effect, however, is gone: an emergency grant run during
-- the incident restored table-level SELECT to `anon` and `authenticated` on every
-- table in `public`, which re-opened all 25 of the columns that migration set out
-- to close. Production's privilege state is now byte-identical to TEST, a database
-- where the lockdown was never applied at all. So the work has to be re-done, and
-- it has to be re-done differently, because applying it unchanged is what caused
-- the outage.
--
-- WHY EVERY EVENT PAGE 404d, which is the thing that must not happen twice.
--
-- Proven, not inferred, by scripts/verify/rls-policy-dependency-probe.mjs against
-- the real database: a row security policy is an expression evaluated with the
-- CALLER's privileges. TWENTY-NINE tables in `public` carry policies whose USING
-- clause subqueries `public.organisations` for an ownership or membership check.
-- While `anon` held table-level SELECT on organisations those subqueries were
-- legal. The moment it was revoked, SELECT on all twenty-nine began failing with
--
--     42501  permission denied for table organisations
--
-- and that set includes `events`, `ticket_tiers` and `tickets`. Every public
-- surface on the platform, from one revoke. The original review checked the
-- queries the APPLICATION issues, and they were all correct. The queries the
-- DATABASE issues on the application's behalf were not in scope.
--
-- A WIDER COLUMN GRANT IS NOT THE FIX, and the shortcut was tested rather than
-- dismissed: granting `owner_id` alongside the six public columns does restore all
-- twenty-nine reads. It also re-publishes owner_id, which is one of the columns the
-- lockdown exists to hide. That trades the exposure for the outage instead of
-- fixing either, so it is refused here.
--
-- WHAT THIS MIGRATION THEREFORE DOES, AND DELIBERATELY DOES NOT DO.
--
-- It narrows `venues`, `seats` and `event_artists` only. No policy anywhere in
-- `public` subqueries those three for an ownership check, so their column
-- privileges can be withdrawn with no second-order breakage. Verified on TEST by
-- sweeping ONE ROW FROM EVERY ONE OF THE 75 BASE TABLES as role `anon`, before and
-- after: 0 of 63 readable tables regressed, and all seven select lists the
-- application issues on public paths still worked.
--
-- It does NOT touch `organisations`. That is stage 2, and it is blocked on
-- replacing the ownership subqueries in those twenty-nine policies with a
-- SECURITY DEFINER helper (the standard Supabase pattern), so the policy stops
-- needing a privilege the caller does not hold. That is a separate migration with
-- its own proof, and shipping it inside this one would put the outage back on the
-- table. Running `scripts/verify/rls-lockdown-test-proof.mjs --stage full`
-- reproduces the 29-table failure on demand, so stage 2 has a red test waiting.
--
-- WHAT STAGE 1 CLOSES. Eight columns, and the first is the one that matters most:
--
--   event_artists.invite_token   A SINGLE-USE BEARER CREDENTIAL. Presenting it
--                                confirms a lineup tag AND transfers ownership of
--                                the artist profile to the claimer
--                                (src/app/actions/lineup.ts). The policy
--                                `event_artists_public_read` is USING (true), so
--                                every unredeemed token was listable with the
--                                NEXT_PUBLIC anon key: read the tokens for nothing,
--                                sign up free, claim every unowned artist profile.
--                                The token design is sound and none of it helps
--                                while the credential is published.
--   seats.held_by_user_id        Maps a seat to a real auth.users id, so an
--   seats.reservation_id         anonymous caller can work out WHO is sitting WHERE
--   seats.metadata               at any event, and link a seat to an order.
--   seats.order_item_id
--   venues.stripe_account_id     The venue's Connect posture.
--   venues.stripe_payouts_enabled
--   venues.revenue_share_status  Historical (the Venue Revenue Sharing Program was
--                                removed by founder decision 2026-07-05) and simply
--                                should not be public.
--
-- `venues.address`, `city`, `state` and `postal_code` are deliberately LEFT public:
-- a venue address is where the event is and is printed on the ticket. It is
-- business data, not personal data.
--
-- WHY BOTH anon AND authenticated. `authenticated` is one Postgres role serving two
-- different consumers: the public browser that happens to be logged in, and the
-- organisation's own staff. Column privileges are per role and cannot separate
-- them, and signing up is free and unverified, so leaving `authenticated` with full
-- access is the same harvest with one extra step. The separation is made in the
-- application, which reads sensitive columns with the service-role client scoped to
-- a verified owner (the pattern src/lib/payouts/auth.ts already uses).
--
-- ROW POLICIES ARE NOT TOUCHED. Row visibility was never the defect; column
-- visibility was. Leaving the policies alone also means this migration cannot
-- change WHICH rows anybody sees.
--
-- NOT ADDRESSED HERE, recorded so it is not mistaken for an oversight: Supabase
-- ships 24 DEFAULT PRIVILEGE entries granting anon/authenticated `arwdDxtm` on
-- future tables in `public`. Confirmed as STOCK CONFIGURATION, not incident
-- residue, by running scripts/probe/grant-shape-probe.mjs against TEST and
-- production and finding the same 24 entries with the same ACLs. The consequence
-- worth knowing is that a new table shipped WITHOUT row level security enabled is
-- not merely readable by anon, it is writable. That is a migration review item.
--
-- VERIFY AFTER APPLYING, with the anon key:
--   GET /rest/v1/event_artists?select=invite_token
--     -> must be 4xx "permission denied for column invite_token", never rows
--   GET /rest/v1/event_artists?select=id,event_id,artist_id,billing_order,status
--     -> must still return the lineup
--   GET /rest/v1/seats?select=held_by_user_id
--     -> must be 4xx
--   GET /rest/v1/venues?select=stripe_account_id
--     -> must be 4xx
--   Then in the app: an event page still renders, its seat map still loads, the
--   lineup still shows, and a venue page still shows its address.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. public.event_artists  (the credential; highest priority in this migration)
-- ----------------------------------------------------------------------------

REVOKE SELECT ON public.event_artists FROM anon;
REVOKE SELECT ON public.event_artists FROM authenticated;

GRANT SELECT (id, event_id, artist_id, billing_order, status, created_at)
  ON public.event_artists TO anon;
GRANT SELECT (id, event_id, artist_id, billing_order, status, created_at)
  ON public.event_artists TO authenticated;

COMMENT ON COLUMN public.event_artists.invite_token IS
  'Single-use artist claim credential. Service role only: presenting it '
  'transfers ownership of the artist profile. Never GRANT this column to anon '
  'or authenticated. See docs/security/AUDIT-2026-08-08.md HIGH-1.';

-- ----------------------------------------------------------------------------
-- 2. public.seats
--
-- Seat AVAILABILITY must stay public: the seat map on every event page is an
-- anonymous read (src/app/events/[slug]/page.tsx and
-- src/app/actions/best-available.ts both go through createPublicClient). So only
-- the columns narrow. The granted list is exactly what those anon reads select,
-- verified as role anon on TEST.
-- ----------------------------------------------------------------------------

REVOKE SELECT ON public.seats FROM anon;
REVOKE SELECT ON public.seats FROM authenticated;

GRANT SELECT (
  id, event_id, seat_map_section_id, ticket_tier_id,
  row_label, seat_number, seat_type, status,
  x, y, price_cents, held_reason, note, created_at, updated_at
) ON public.seats TO anon;
GRANT SELECT (
  id, event_id, seat_map_section_id, ticket_tier_id,
  row_label, seat_number, seat_type, status,
  x, y, price_cents, held_reason, note, created_at, updated_at
) ON public.seats TO authenticated;

COMMENT ON COLUMN public.seats.held_by_user_id IS
  'Service role only by column privilege. Publishing this to anon let anyone '
  'work out who is sitting where at any event. Never GRANT it to anon or '
  'authenticated. See docs/security/AUDIT-2026-08-08.md.';

-- ----------------------------------------------------------------------------
-- 3. public.venues
--
-- public.venues has NO `slug` column (the /venues/[handle] route resolves by id
-- and name), so it is deliberately absent below. Granting a column that does not
-- exist aborts the whole migration at apply time.
-- ----------------------------------------------------------------------------

REVOKE SELECT ON public.venues FROM anon;
REVOKE SELECT ON public.venues FROM authenticated;

GRANT SELECT (
  id, name, description, image_url, capacity,
  address, city, state, country, postal_code,
  latitude, longitude, organisation_id, is_active, created_at, updated_at
) ON public.venues TO anon;
GRANT SELECT (
  id, name, description, image_url, capacity,
  address, city, state, country, postal_code,
  latitude, longitude, organisation_id, is_active, created_at, updated_at
) ON public.venues TO authenticated;

COMMENT ON TABLE public.venues IS
  'Venue records. stripe_* and revenue_share_* columns are service-role only '
  'by column privilege. address/city/state/postcode are intentionally public: '
  'a venue address is where the event is. '
  'See docs/security/AUDIT-2026-08-08.md.';

COMMIT;
