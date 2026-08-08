-- The public composer's draft store.
--
-- Founder ruling 9 August 2026 (0.2c): a stranger's kit persists for 30 days
-- behind a bookmarkable link, with no account. Supersedes the 72-hour figure
-- in PHASE-C 4.1.
--
-- APPLY WITH: supabase db push --linked
-- The founder applies this, per Verification and gates. The application code
-- degrades gracefully while it is unapplied: the composer still renders a full
-- kit, and only cross-device persistence is unavailable until this lands.
--
-- WHAT IS DELIBERATELY NOT HERE
--   * No user foreign key on the draft itself beyond claimed_by, because the
--     whole point is that an anonymous stranger owns a draft before any
--     account exists.
--   * The raw cookie token is NEVER stored. Only its SHA-256. A database
--     reader therefore cannot mint a cookie that opens somebody's draft.
--   * Service role only. There is no authenticated-user policy, because the
--     server actions are the only intended reader and they run with the admin
--     client.

create table if not exists public.kit_drafts (
  id           uuid primary key default gen_random_uuid(),

  -- The readable, unguessable bookmarkable code that appears in
  -- /launch/k/[code]. Distinct from the cookie token: this one is meant to be
  -- shared, the token is meant to prove ownership.
  code         text not null unique,

  -- SHA-256 of the el_kit_draft cookie token. Ownership proof for edits.
  token_hash   text not null unique,

  -- The draft fields the composer collected. Small: a few KB of text.
  payload      jsonb not null default '{}'::jsonb,

  -- Storage key of the organiser's uploaded cover, when there is one. Held so
  -- the nightly sweep can delete the OBJECT as well as the row. Without this
  -- an abandoned draft leaves its image behind forever, which at a thousand
  -- drafts a day is about sixty gigabytes a month of images belonging to
  -- events that will never exist.
  cover_path   text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- 30 days from last touch (founder ruling).
  expires_at   timestamptz not null default (now() + interval '30 days'),

  -- Set when a signup claims the draft. A claimed draft is exempt from the
  -- sweep, because by then it belongs to a real organiser.
  claimed_by   uuid references auth.users(id) on delete set null,
  claimed_at   timestamptz
);

comment on table public.kit_drafts is
  'Anonymous Launch Kit drafts from the public composer. 30-day expiry, swept nightly. Raw cookie tokens are never stored, only their SHA-256.';

-- The sweep and the lookup paths.
create index if not exists kit_drafts_expires_at_idx
  on public.kit_drafts (expires_at)
  where claimed_by is null;

create index if not exists kit_drafts_claimed_by_idx
  on public.kit_drafts (claimed_by)
  where claimed_by is not null;

-- Keep updated_at honest so the 30 days runs from last touch, not creation.
create or replace function public.kit_drafts_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- Only extend an UNCLAIMED draft. A claimed one belongs to an account and
  -- its lifetime is no longer the sweep's business.
  if new.claimed_by is null then
    new.expires_at := now() + interval '30 days';
  end if;
  return new;
end;
$$;

drop trigger if exists kit_drafts_touch_trigger on public.kit_drafts;
create trigger kit_drafts_touch_trigger
  before update on public.kit_drafts
  for each row
  execute function public.kit_drafts_touch();

-- Service role only. No anon policy, no authenticated policy: the server
-- actions are the sole reader and writer.
alter table public.kit_drafts enable row level security;

revoke all on public.kit_drafts from anon, authenticated;
