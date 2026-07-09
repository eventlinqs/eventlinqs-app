-- Event Launch Kit: the launch_kit feature flag + the national city waitlist.
--
-- The Launch Kit packages the existing arsenal (live event page, seat map,
-- QR poster, tracked share links, reach panel) into one post-publish surface,
-- gated by a DB-backed flag (default ON for testing, admin-switchable with no
-- deploy, same primitive as the broadcast flags).
--
-- city_waitlist_signups is the national waitlist (growth plan: nationally
-- available, locally dense). One row per (city, email). Spam Act 2003 posture
-- mirrors organiser_marketing_consents: the exact consent wording shown is
-- stored verbatim, the OPTIONAL marketing opt-in is a separate unticked box
-- recorded as its own boolean, and a per-row unsubscribe_token backs a
-- no-login unsubscribe. Geelong and Melbourne rows are flagged founding-invite
-- candidates for the Founding Organiser programme.
--
-- Additive only: no payment columns touched. Apply with `supabase db push
-- --linked` from PowerShell, TEST project only. NEVER the Dashboard or MCP.

begin;

insert into public.feature_flags (flag, enabled, description) values
  ('launch_kit', true,
   'Event Launch Kit: the post-publish kit screen (live link, seat map, QR poster, share cards, tracked sharing, live reach), the city waitlist, and the tool-first organiser positioning.')
on conflict (flag) do nothing;

create table if not exists public.city_waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  -- Canonical city slug from src/lib/cities/data.ts (sydney, geelong, ...).
  city_slug text not null,
  full_name text not null,
  -- Stored lowercased by the app.
  email text not null,
  role text not null check (role in ('organiser', 'attendee')),
  -- The OPTIONAL, unticked-by-default marketing opt-in (Spam Act: express
  -- consent, never pre-ticked). Joining the waitlist itself only consents to
  -- the city-opening notification, which is recorded in consent_text.
  marketing_opt_in boolean not null default false,
  -- The exact wording shown at the moment of joining, plus its version, so the
  -- consent evidence stays provable after the copy changes.
  consent_text text not null,
  consent_version text not null default 'v1',
  source text not null default 'waitlist-page',
  -- Geelong and Melbourne signups are candidates for the invite-only Founding
  -- Organiser programme (first 50, fee holiday).
  founding_candidate boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  -- One signup per person per city; re-joining upserts the same row.
  unique (city_slug, email),
  unique (unsubscribe_token)
);

comment on table public.city_waitlist_signups is
  'National city waitlist (Event Launch Kit). Per-city demand signal; Geelong/Melbourne rows are Founding Organiser invite candidates. Spam Act compliant: consent wording stored verbatim, optional marketing opt-in separate and default false, token-based no-login unsubscribe.';

create index if not exists city_waitlist_signups_city_idx
  on public.city_waitlist_signups (city_slug);
create index if not exists city_waitlist_signups_email_idx
  on public.city_waitlist_signups (lower(email));

alter table public.city_waitlist_signups enable row level security;
-- Writes and reads go through the service role (the join server action and the
-- founder's demand-signal queries); no anon/authenticated policy is exposed.

commit;
