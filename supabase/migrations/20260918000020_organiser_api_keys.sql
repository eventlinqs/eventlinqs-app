-- ===========================================================================
-- API1. THE ORGANISER SCOPED READ ONLY API: ITS KEYS, AND THE THREE OBJECTS
-- IT IS ALLOWED TO READ.
--
-- Scope v5 section 11.1 asks for a RESTful JSON API authenticated by organiser
-- scoped API keys, read only over events, orders and attendees. This migration
-- is the half of that which belongs in the database, and it is shaped by one
-- decision worth stating before the DDL rather than after it.
--
-- WHY THREE VIEWS AND NOT THREE TABLE READS.
--
--   1. EVERY READABLE OBJECT CARRIES organisation_id. `events` and `orders`
--      already do; `tickets` does not, it carries `event_id` and nothing else,
--      so an attendee read scoped "properly" would be a two step: read the
--      organiser's event ids, then read tickets in that set. Two steps is two
--      places for the scope to be forgotten, and the second step's predicate is
--      an `in (...)` over a list somebody else computed. The view does the join
--      once, in the database, and hands back a row that names its owner. Every
--      read in the API is then the same single predicate,
--      `.eq('organisation_id', scope.organisationId)`, on all three objects,
--      which is a rule a guard can prove rather than a convention a reviewer
--      has to notice.
--
--   2. THE COLUMN LIST IS THE API CONTRACT, AND IT IS HELD IN THE DATABASE.
--      `tickets.secret` is the value a QR code is signed against. A `select *`
--      on tickets, anywhere on the API path, hands every attendee's ticket
--      secret to whoever holds the key. The view cannot do that, because the
--      column is not in it. The same reasoning removes `orders.metadata` and
--      `events.metadata`, which are internal blobs nobody promised to keep
--      stable, and `orders.processing_fee_cents`, which is the second fee this
--      platform deleted on 15 August 2026: it is inert history, and publishing
--      it through an API would resurrect it as a number integrators build on.
--      A column added to `events` tomorrow does not silently join the public
--      contract; it takes a migration, which is the correct cost.
--
-- THE KEYS ARE HASHED AT REST AND THE PLAIN TOKEN IS NEVER STORED. What is
-- stored is a sha256 of the token and a short non secret prefix for display.
-- A sha256 rather than a password hash is the right tool here, and the reason
-- is the entropy: this token is 32 random bytes minted by the platform, not a
-- human chosen password, so there is no dictionary for a work factor to slow
-- down and nothing for it to buy. What a work factor WOULD buy is a per request
-- cost on the hot path of every API call, which is the opposite of what a
-- 1000 a minute tier needs.
--
-- REVOCATION IS A COLUMN, NOT A DELETE. A revoked key's row stays, so
-- "who called us, and when did that stop" is still answerable, and so the
-- unique index on the hash keeps a revoked token permanently unusable rather
-- than merely absent.
--
-- Additive and reversible. Applied to TEST vkapkibzokmfaxqogypq from the lane B
-- worktree. Production is the founder's `npm run migrate:production`.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- THE KEYS
-- ---------------------------------------------------------------------------
create table if not exists public.organiser_api_keys (
  id uuid primary key default gen_random_uuid(),

  -- WHOSE KEY. Every API read the key performs is filtered to this id and
  -- nothing else. On delete cascade, because a key that names no organisation
  -- can read nothing and is only a liability.
  organisation_id uuid not null references public.organisations(id) on delete cascade,

  -- What the organiser calls it, so a list of four keys is a list of four
  -- known integrations rather than four identical rows.
  name text not null,

  -- THE ONLY TWO THINGS KEPT ABOUT THE TOKEN ITSELF.
  -- `token_prefix` is the opening of the token and is not a secret: it is what
  -- the screen shows so the organiser can tell which key is which, and it is
  -- short enough to be useless to anyone who reads it.
  -- `token_hash` is a sha256 hex digest of the whole token. The token itself is
  -- shown once, at mint, and is never written anywhere.
  token_prefix text not null,
  token_hash text not null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  -- WHEN IT WAS LAST ANY USE. Written after a successful authenticated call,
  -- best effort and never in the request's critical path: an integration that
  -- has gone quiet is a thing the organiser should be able to see.
  last_used_at timestamptz,

  -- REVOCATION. Not null means refused, from the next request onwards.
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,

  constraint organiser_api_keys_name_present check (length(btrim(name)) between 1 and 80),
  constraint organiser_api_keys_prefix_shape check (token_prefix ~ '^elq_[a-z0-9]{8}$'),
  constraint organiser_api_keys_hash_shape check (token_hash ~ '^[0-9a-f]{64}$'),
  -- A revoked key names who revoked it, or it names nobody because that account
  -- is gone. What it may not be is half revoked, a revoker with no revocation.
  constraint organiser_api_keys_revocation_is_whole
    check (revoked_by is null or revoked_at is not null)
);

comment on table public.organiser_api_keys is
  'API1. One row per organiser scoped API key. The token is never stored: only its sha256 and a short display prefix. Revocation is a timestamp, so a revoked token stays permanently unusable rather than merely absent.';

comment on column public.organiser_api_keys.token_hash is
  'API1. sha256 hex of the full token. Unique, so two keys can never collide and a revoked token can never be minted a second time.';

-- The lookup the API does on every single request, and the reason a key can be
-- refused within one request of being revoked: one indexed equality, no cache.
create unique index if not exists organiser_api_keys_token_hash_key
  on public.organiser_api_keys (token_hash);

create index if not exists organiser_api_keys_organisation_idx
  on public.organiser_api_keys (organisation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- NOBODY READS THE KEY TABLE FROM A BROWSER.
--
-- RLS on with no policy: anon and authenticated can neither read nor write it.
-- The dashboard screen reads and writes it with the service role from a server
-- action, after resolveOrganisationScope has verified ownership. A table whose
-- rows are the shape of a credential must not be reachable with a credential a
-- page hands to the browser.
-- ---------------------------------------------------------------------------
alter table public.organiser_api_keys enable row level security;

commit;

-- ===========================================================================
-- THE THREE READABLE OBJECTS.
--
-- Deliberately outside the transaction above, in their own statements, so a
-- partial apply is repaired by running the file again: every one is
-- `create or replace view`, which is idempotent by construction.
--
-- security_invoker = true on all three. Without it a view runs with its OWNER's
-- privileges, which would make any of these a way around the row level security
-- on the tables underneath it for any role that could reach the view. The API
-- reads them with the service role, which bypasses RLS anyway, so invoker
-- rights cost the API nothing and close that door for every other role. The
-- explicit revoke below closes it a second way, because a view reachable by
-- `authenticated` is a view reachable by every logged in visitor on the
-- platform, not merely by an organiser.
-- ===========================================================================

create or replace view public.api_v1_events
with (security_invoker = true) as
select
  e.id,
  e.organisation_id,
  e.slug,
  e.title,
  e.summary,
  e.status,
  e.visibility,
  e.event_type,
  e.start_date,
  e.end_date,
  e.timezone,
  e.is_free,
  e.max_capacity,
  e.category_id,
  e.community_primary,
  e.city_primary,
  e.venue_name,
  e.venue_city,
  e.venue_state,
  e.venue_country,
  e.cover_image_url,
  e.published_at,
  e.created_at,
  e.updated_at
from public.events e;

comment on view public.api_v1_events is
  'API1. The organiser facing read only contract for an event. Carries organisation_id so every API read is one predicate. Adding a column to events does not add it here.';

create or replace view public.api_v1_orders
with (security_invoker = true) as
select
  o.id,
  o.organisation_id,
  o.event_id,
  o.order_number,
  o.status,
  o.currency,
  o.subtotal_cents,
  o.discount_cents,
  o.addon_total_cents,
  o.tax_cents,
  o.platform_fee_cents,
  o.founding_fee_waived_cents,
  o.total_cents,
  o.fee_pass_type,
  o.user_id,
  o.guest_name,
  o.guest_email,
  o.confirmed_at,
  o.cancelled_at,
  o.created_at,
  o.updated_at
from public.orders o;

comment on view public.api_v1_orders is
  'API1. The organiser facing read only contract for an order. One fee, platform_fee_cents: orders.processing_fee_cents is the second fee deleted on 15 August 2026 and is deliberately absent so no integrator can build on it.';

create or replace view public.api_v1_attendees
with (security_invoker = true) as
select
  t.id,
  e.organisation_id,
  t.event_id,
  e.title as event_title,
  t.order_id,
  o.order_number,
  t.ticket_code,
  t.status,
  t.holder_name,
  t.holder_email,
  t.ticket_tier_id,
  tt.name as ticket_tier_name,
  (t.first_scanned_at is not null) as checked_in,
  t.first_scanned_at,
  t.last_scanned_at,
  t.scan_count,
  t.created_at,
  t.updated_at
from public.tickets t
join public.events e on e.id = t.event_id
left join public.orders o on o.id = t.order_id
left join public.ticket_tiers tt on tt.id = t.ticket_tier_id;

comment on view public.api_v1_attendees is
  'API1. The organiser facing read only contract for an attendee, one row per ticket, carrying the organisation_id its event belongs to. tickets.secret is absent: it is the value a QR code is signed against and it never leaves the platform.';

revoke all on public.api_v1_events from anon, authenticated;
revoke all on public.api_v1_orders from anon, authenticated;
revoke all on public.api_v1_attendees from anon, authenticated;

-- ---------------------------------------------------------------------------
-- READ ONLY MEANS READ ONLY, AND THE DATABASE IS WHERE THAT IS SAID.
--
-- Found by reading the generated types rather than by assuming: `api_v1_events`
-- and `api_v1_orders` are SIMPLE views over one table each, so PostgreSQL makes
-- them AUTO-UPDATABLE, and `supabase gen types` duly emitted `Insert` and
-- `Update` shapes for both. Nothing in the API writes, and nothing is meant to;
-- but a writable object on a surface whose whole promise is "no write endpoint"
-- is a hole waiting for the first person who does not know that. The service
-- role bypasses row level security, so the table underneath would not have
-- stopped it either.
--
-- So the privilege is removed rather than the intention documented. SELECT is
-- untouched, which is all the API ever asks for.
-- (`api_v1_attendees` joins three tables and is not auto-updatable, so this is
-- belt and braces there. It is applied uniformly anyway: a rule that holds on
-- two of three objects is a rule somebody has to remember.)
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.api_v1_events from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.api_v1_orders from public, anon, authenticated, service_role;
revoke insert, update, delete, truncate on public.api_v1_attendees from public, anon, authenticated, service_role;
