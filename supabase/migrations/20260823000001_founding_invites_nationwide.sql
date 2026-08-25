-- Nationwide from day one (founder ruling 2026-08-23).
--
-- 20260710000002_founding_network.sql created founding_invites with
--
--   city_slug text not null check (city_slug in ('geelong', 'melbourne'))
--
-- which is a GEOGRAPHIC GATE ENFORCED BY THE DATABASE, not just copy. With it
-- in place an organiser in Perth cannot be issued a founding invite and cannot
-- issue one: the insert fails 23514 no matter what the application allows. The
-- platform is now open in every city and state from day one, so the gate goes.
--
-- WHAT IS KEPT. The scarcity that the founder ruled is real scarcity stays
-- exactly as it is: the 50-spot cap (FOUNDING_SPOT_CAP, counted for real off
-- organisations.is_founding), the six fee-free months, and the three extra
-- months per referred organiser. None of those are geographic and none are
-- touched here.
--
-- WHY NOT DROP THE CHECK ENTIRELY. city_slug is rendered on the public invite
-- landing and grouped in the admin network view, so it must stay a real city
-- slug rather than free text. The replacement constraint keeps the column
-- honest (non-empty, lowercase, slug-shaped) without naming any city. The
-- authoritative list of cities lives in src/lib/cities/data.ts and is enforced
-- in the application by isFoundingCity(); duplicating those 20 slugs here
-- would create a second source of truth that drifts the first time a city is
-- added.
--
-- ORDERING MATTERS. The application code no longer restricts by city, so until
-- this migration is applied a non-Geelong/Melbourne invite fails at the
-- database. createFoundingInvite() detects 23514 and returns a message naming
-- this file rather than a generic error, so the failure is self-describing if
-- the code lands first.
--
-- Additive and reversible: no data is read, written or deleted, and no payment
-- column is touched. Existing rows all hold 'geelong' or 'melbourne' and
-- satisfy the new constraint, so the ALTER validates without a rewrite.
--
-- Apply with `supabase db push --linked` from PowerShell, TEST project only.
-- NEVER the Dashboard SQL editor, NEVER the Supabase MCP.

begin;

alter table public.founding_invites
  drop constraint if exists founding_invites_city_slug_check;

alter table public.founding_invites
  add constraint founding_invites_city_slug_check
  check (city_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

comment on column public.founding_invites.city_slug is
  'Canonical city slug from src/lib/cities/data.ts. Any Australian city may carry a founding invite: the platform is open nationwide from day one (founder ruling 2026-08-23). The constraint enforces slug SHAPE only, never a launch order.';

comment on column public.organisations.founding_city is
  'The city the organisation was invited from. Recorded for attribution only. It has never gated anything and, since the nationwide ruling of 2026-08-23, no city is preferred over another.';

comment on column public.organisations.is_founding is
  'True when this organisation holds a Founding Organiser spot (the first 50 nationally).';

commit;
