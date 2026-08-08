-- ============================================================================
-- Close the world-readable column exposure (CRITICAL-1, HIGH-1)
-- Run by founder: supabase db push --linked
-- Audit: docs/security/AUDIT-2026-08-08.md
-- Live re-verification query: scripts/security/rls-live-audit.sql
-- Build gate: scripts/security/rls-exposure-scan.mjs
-- ASVS v5.0.0: 8.2.3 (field-level authorisation, BOPLA), 8.2.2, 8.3.1
-- ============================================================================
--
-- PROVENANCE OF EVERY CLAIM BELOW, stated first because the first version of
-- this migration got two tables wrong.
--
-- The first pass reasoned from 77 migration FILES. Checked against production
-- pg_policies by the founder on 2026-08-08, it was right on two tables and wrong
-- on two:
--
--   organisations  CONFIRMED EXPOSED against live pg_policies
--                  "Organisations are viewable by everyone" {public}
--                  USING (status = 'active'::org_status)
--   seats          CONFIRMED EXPOSED against live pg_policies
--                  "Seats are viewable by everyone" {public} USING (true)
--   profiles       SAFE. The 20260625000002 lockdown DID reach production; the
--                  only SELECT policy is USING (auth.uid() = id). There is no
--                  CRITICAL-0. This migration does not touch profiles.
--   squads         SAFE. The live policy is scoped to the leader or a member,
--                  not USING (true). share_token is NOT world-readable. The
--                  earlier claim that it was is withdrawn.
--
--   event_artists  NOT YET LIVE-VERIFIED. Derived from migration files only.
--   venues         NOT YET LIVE-VERIFIED. Derived from migration files only.
--
-- The two unverified tables are still narrowed here, and that is deliberate: a
-- column privilege is the correct end state whether or not a permissive policy
-- happens to exist today. Withdrawing a privilege that was never exercised costs
-- nothing; leaving it granted because the policy looked fine is how this class
-- survives. Their POLICY state is unproven and this file does not assert it.
--
-- A migration is what somebody INTENDED. pg_policies is what the database DOES.
-- Run scripts/security/rls-live-audit.sql before and after applying this.
--
-- THE DEFECT. Row Level Security filters ROWS. It has never filtered COLUMNS.
-- A policy with no TO clause applies to PUBLIC, which includes `anon`, and the
-- anon key is NEXT_PUBLIC and sits in every page's source. So one permissive
-- SELECT policy publishes EVERY column of every matching row to anyone with a
-- browser, including columns the application never renders.
--
-- This is the SECOND time this class has been found in this schema. The first
-- was 20260625000002_profiles_rls_lockdown.sql (email, full_name, phone on
-- public.profiles). That migration dropped the offending policy, which fixed
-- the instance and left the CLASS alive: nothing prevented the next table from
-- shipping the same shape, and three did.
--
-- WHY COLUMN PRIVILEGES AND NOT ANOTHER POLICY EDIT.
--
-- A policy edit is the wrong tool twice over. First, a policy cannot express
-- "these columns but not those", so protecting a column by policy means hiding
-- the whole ROW, which breaks legitimate public reads. Second, and this is the
-- reason the founder asked for privileges specifically, a policy is the very
-- thing that failed here: the fix and the defect would live in the same
-- mechanism, so the next hand-written policy re-opens it.
--
-- A column GRANT is enforced by the privilege system, one layer BELOW RLS. No
-- future policy, however permissive, can hand `anon` a column it has not been
-- granted. The failure mode is also the right way round: a query for a
-- forbidden column ERRORS loudly ("permission denied for column email")
-- instead of silently returning data. That is fail-closed and visible.
--
-- A view was considered and rejected. A view protects only callers who use the
-- view; anyone querying the table directly is unaffected, so it is a
-- convention rather than a control. It would also have forced every public
-- PostgREST embed (organisation:organisations(...) on the events surfaces) to
-- resolve through the view, and view embedding depends on PostgREST inferring
-- the relationship. That is untestable from here and a wrong guess blanks the
-- organiser name across every public event surface. Column privileges keep the
-- existing embeds working unchanged, provided they name permitted columns,
-- which is the accompanying application change.
--
-- WHY BOTH anon AND authenticated ARE REVOKED.
--
-- `authenticated` is one Postgres role serving two different consumers: the
-- public browser who happens to be logged in, and the organisation's owner.
-- Column privileges are per role, so they cannot separate the two. Leaving
-- `authenticated` with full column access would mean any logged-in visitor
-- could still read every organiser's email and phone, and signing up is free.
-- That is the same mass-PII harvest with one extra step, so it is not a fix.
--
-- The separation is therefore made in the application instead: the three
-- owner-only dashboard reads that genuinely need the sensitive columns move to
-- the service-role client, gated on owner_id = auth.uid() exactly as they
-- already were. That is the pattern src/lib/payouts/auth.ts
-- (resolveOrganiserScope) already uses and which was reviewed and accepted:
-- verify identity with the session client, then read with the service role
-- scoped to the verified owner. All public reads already run through
-- createPublicClient(), which carries no session and therefore acts as `anon`,
-- so they are unaffected.
--
-- BLAST RADIUS. Verified before writing this file:
--   - every public organisation read uses createPublicClient() -> role anon
--   - the only session-client reads of sensitive organisation columns are three
--     dashboard pages, all `select('*')`, all already filtered to
--     owner_id = auth.uid(); they move to the service-role client in the same
--     commit
--   - event_artists.invite_token is only ever read by the service-role client
--     (src/app/artists/claim/[token]/page.tsx, src/app/actions/lineup.ts,
--     src/lib/broadcast/artists.ts), so revoking it needs no code change
--   - no anon or authenticated read of `venues` selects a stripe_* or
--     revenue_share_* column, so those revokes need no code change
--
-- VERIFY AFTER APPLYING (TEST first). With the anon key:
--   GET /rest/v1/organisations?select=email,phone
--     -> must be 4xx "permission denied for column email", never rows
--   GET /rest/v1/organisations?select=id,name,slug,logo_url
--     -> must still return the active organisations
--   GET /rest/v1/event_artists?select=invite_token
--     -> must be 4xx "permission denied for column invite_token"
--   Then in the app: an event detail page still shows its organiser name, the
--   organiser public profile still renders, and /dashboard/payouts still shows
--   the Stripe status.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. public.organisations  (CRITICAL-1)
--
-- Exposed to anon: email, phone, owner_id, metadata, and the entire Stripe
-- Connect posture (stripe_account_id, stripe_account_country,
-- stripe_charges_enabled, stripe_payouts_enabled, stripe_onboarding_complete,
-- stripe_capabilities, stripe_requirements).
--
-- Founder ruling 2026-08-08: the public organisation fields are
-- id, name, slug, description, logo_url, website. Nothing else.
-- ----------------------------------------------------------------------------

REVOKE SELECT ON public.organisations FROM anon;
REVOKE SELECT ON public.organisations FROM authenticated;

GRANT SELECT (id, name, slug, description, logo_url, website)
  ON public.organisations TO anon;
GRANT SELECT (id, name, slug, description, logo_url, website)
  ON public.organisations TO authenticated;

-- The row policy is retained and rewritten to name its roles explicitly. It
-- must keep admitting both roles or every public PostgREST embed
-- (organisation:organisations(name) on the events surfaces, including the
-- session-client /feed queries) returns null. Row visibility is not the defect;
-- column visibility was, and that is now handled above.
DROP POLICY IF EXISTS "Organisations are viewable by everyone" ON public.organisations;
CREATE POLICY "Active organisations are publicly browsable"
  ON public.organisations FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

COMMENT ON TABLE public.organisations IS
  'Organiser accounts. anon and authenticated hold SELECT on ONLY '
  '(id, name, slug, description, logo_url, website) by column privilege. '
  'email, phone, owner_id, metadata and every stripe_* column are readable '
  'solely by the service role. Do not GRANT further columns to anon or '
  'authenticated: RLS cannot restrain columns and a policy cannot re-add a '
  'privilege. See docs/security/AUDIT-2026-08-08.md CRITICAL-1.';

-- ----------------------------------------------------------------------------
-- 2. public.event_artists  (HIGH-1)
--
-- invite_token is a single-use bearer credential which, when presented,
-- confirms a lineup tag AND transfers ownership of the artist profile to the
-- claimer (src/app/actions/lineup.ts:247-262). The policy
-- "event_artists_public_read" is USING (true), so every unredeemed token was
-- listable with the public anon key: read the tokens for nothing, sign up for
-- free, claim every unowned artist profile on the platform.
--
-- The token design is sound (UUID, single-use, nulled on redemption, refuses an
-- already-owned profile). None of that helps while the credential is published,
-- which is the ASVS 8.3.1 failure exactly: the check is fine and the attacker
-- never has to face it.
--
-- The lineup rows themselves are public data (who is playing), so the row
-- policy stays. Only the credential column is withdrawn.
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
-- 3. public.venues  (MEDIUM)
--
-- "Venues are viewable by everyone" USING (is_active = true) exposed
-- stripe_account_id, stripe_account_country, stripe_payouts_enabled and the
-- historical revenue_share_* columns.
--
-- `address` is deliberately LEFT public: a venue's street address is where the
-- event is and is printed on the ticket. It is business data, not personal
-- data, so the scanner's PII match on it is a false positive and is suppressed
-- rather than "fixed" by hiding something users need.
--
-- Note the revenue_share_* columns are historical: the Venue Revenue Sharing
-- Program was removed by founder decision 2026-07-05 (CLAUDE.md). They are
-- retained as history and simply should not be public.
-- ----------------------------------------------------------------------------

REVOKE SELECT ON public.venues FROM anon;
REVOKE SELECT ON public.venues FROM authenticated;

-- Column list verified against the reconstructed schema with
--   node scripts/security/rls-exposure-scan.mjs --columns venues
-- public.venues has NO `slug` column (the /venues/[handle] route resolves by id
-- and name), so it is deliberately absent here. Granting a column that does not
-- exist aborts the whole migration at apply time.
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

-- ----------------------------------------------------------------------------
-- 4. public.seats  (CONFIRMED EXPOSED against live pg_policies)
--
--   "Seats are viewable by everyone" | {public} | USING (true)
--
-- The whole table, every column, to anyone with the anon key. What that exposes
-- is `held_by_user_id`, which maps a seat to a real auth.users id, so an
-- anonymous caller can work out WHO is sitting WHERE at an event. Plus `metadata`
-- (free-form), `note`, and the order/reservation foreign keys, which link a seat
-- to an order.
--
-- Lower severity than organisations: it is de-anonymising rather than a bulk
-- contact-detail harvest, and it carries no credential. It was originally
-- deferred as LOW on that reasoning, and the founder was right to push back:
-- "who is sitting where, for any event" is a privacy leak on its own and the fix
-- costs one grant.
--
-- Seat AVAILABILITY must stay public: the seat map on every event page is an
-- anonymous read (src/app/events/[slug]/page.tsx and
-- src/app/actions/best-available.ts both go through createPublicClient). So the
-- row policy stays and only the columns narrow. Verified anon-role reads need
-- exactly geometry, status, pricing and the tier/section keys.
-- ----------------------------------------------------------------------------

REVOKE SELECT ON public.seats FROM anon;
REVOKE SELECT ON public.seats FROM authenticated;

-- Column list verified with: node scripts/security/rls-exposure-scan.mjs --columns seats
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

COMMIT;
