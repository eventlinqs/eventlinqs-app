-- The Network Engine: founding-organiser invites, founding status, and the
-- poster-download signal for the founder's demand-signal admin view.
--
-- Additive only. No payment columns touched, no existing table dropped.
-- Apply with `supabase db push --linked` from PowerShell, TEST project only.
-- NEVER the Dashboard or MCP.

begin;

-- ------------------------------------------------------------
-- 1. Founding status on the organisation. A founding organiser holds one of
--    the 50 spots across the opening cities; the referral bonus accrues 3
--    months per organiser they successfully bring on (the growth doctrine's
--    extendable fee holiday).
-- ------------------------------------------------------------
alter table public.organisations
  add column if not exists is_founding boolean not null default false,
  add column if not exists founding_city text,
  add column if not exists founding_since timestamptz,
  add column if not exists founding_bonus_months integer not null default 0;

comment on column public.organisations.is_founding is
  'True when this organisation holds a Founding Organiser spot (first 50 across the opening cities).';
comment on column public.organisations.founding_bonus_months is
  'Extra fee-free months earned by referring organisers (3 per successful conversion).';

-- ------------------------------------------------------------
-- 2. Founding invites. Two sources: an approved founding organiser generating
--    a personal link, or the founder issuing one from a waitlist entry. Each
--    invite is a single-use code; conversion marks who accepted it.
-- ------------------------------------------------------------
create table if not exists public.founding_invites (
  id uuid primary key default gen_random_uuid(),
  -- Short, URL-safe, unguessable code for /join/[code].
  code text not null unique,
  -- 'organiser' (a founding organiser's personal invite) or 'founder' (issued
  -- from the admin waitlist bridge).
  inviter_kind text not null check (inviter_kind in ('organiser', 'founder')),
  -- The inviting organisation (null for founder-issued invites).
  inviter_org_id uuid references public.organisations(id) on delete set null,
  -- Display name shown on the warm landing ("[name] invited you").
  inviter_name text not null,
  -- Only Geelong and Melbourne are open for founding invites.
  city_slug text not null check (city_slug in ('geelong', 'melbourne')),
  -- Set when the invite was issued to a specific person (the waitlist bridge).
  invitee_email text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_org_id uuid references public.organisations(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.founding_invites is
  'Founding-organiser invite links (personal or founder-issued from the waitlist). Single-use codes; conversion is attributed for the referral bonus.';

create index if not exists founding_invites_inviter_idx on public.founding_invites (inviter_org_id);
create index if not exists founding_invites_status_idx on public.founding_invites (status);
create index if not exists founding_invites_email_idx on public.founding_invites (lower(invitee_email));

alter table public.founding_invites enable row level security;
-- Reads and writes go through the service role (the invite server actions and
-- the founder admin view); no anon/authenticated policy is exposed.

-- ------------------------------------------------------------
-- 3. Poster downloads: a real usage signal for the founder's Kit-usage panel.
--    One append-only row per download; no PII.
-- ------------------------------------------------------------
create table if not exists public.kit_poster_downloads (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete set null,
  downloaded_at timestamptz not null default now()
);

comment on table public.kit_poster_downloads is
  'Append-only Launch Kit poster download signal for the founder demand-signal view. No PII.';

create index if not exists kit_poster_downloads_at_idx on public.kit_poster_downloads (downloaded_at desc);

alter table public.kit_poster_downloads enable row level security;

-- ------------------------------------------------------------
-- 4. claim_founding_spot: atomically grant a founding spot if any of the 50
--    remain. Locks the count so two concurrent signups can never over-allocate
--    the programme. Returns the spot number granted, or NULL when full.
-- ------------------------------------------------------------
create or replace function public.claim_founding_spot(
  p_org_id uuid,
  p_city_slug text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_taken integer;
  v_cap constant integer := 50;
begin
  -- Serialise against concurrent claims by locking the founding rows.
  perform 1 from public.organisations where is_founding = true for update;

  select count(*) into v_taken from public.organisations where is_founding = true;
  if v_taken >= v_cap then
    return null;
  end if;

  update public.organisations
  set is_founding = true,
      founding_city = p_city_slug,
      founding_since = now()
  where id = p_org_id and is_founding = false;

  if not found then
    -- Already founding, or the org does not exist: not a new claim.
    return null;
  end if;

  return v_taken + 1;
end;
$$;

comment on function public.claim_founding_spot(uuid, text) is
  'Atomically grant one of the 50 founding spots to an organisation. Returns the 1-based spot number, or NULL when the programme is full or the org already holds a spot.';

commit;
