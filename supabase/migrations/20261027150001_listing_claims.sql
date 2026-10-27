-- ============================================================================
-- CLAIM THIS VENUE, CLAIM THIS EVENT, AND ASK FOR A REMOVAL (window 6, 27 October 2026; the locked foundation's item 7,
-- C:\dev\START-16OCT\EVENTLINQS-FOUNDATION-LOCKED-27OCT.md: "Claim this event and claim this venue, free, by a code to
-- the published email"; the design is docs/walk-in/WI2-PLAN.md section 9, Part 3b).
--
-- A curated listing names its host "Listed by EventLinqs from public information. Is this your venue? Claim it free."
-- The claim proves the claimant can read the venue's own published address: a 6-digit code goes there (or to an address
-- at the venue website's own domain), and only its hash is kept. 15 minutes and 5 tries, the plan's own choice ("The
-- code's 15 minutes is our choice, not a market figure"). With neither address, a manual claim waits for Lawal.
--
--   listing_claims        one claim of a venue or of one event: who asked (the signed in user, their name and role), the
--                         address the code went to and how it was chosen, the code's hash, its expiry and tries, and how
--                         it ended. Exactly one target.
--   removal_requests      anyone's "Request removal" of a venue or a series, for Lawal to action the same day.
--   listing_claim_check   the one way a code is tried: counts the try, refuses past 5 tries or 15 minutes, and on the
--                         right code moves the venue, its series and their dates to come (or the one event) to the
--                         claimant's organisation, as the organiser's own (listing_source 'organiser'), with claimed_at.
--
-- PRIVATE. Both tables hold personal information (a name, a role, an address), so row security is on with no policy, and
-- each is granted to service_role alone, revoked from anon and authenticated first (the 21 October 2026 grant rule:
-- "every migration that creates a table in public, in that same migration, revokes all from anon, authenticated and
-- service_role and then grants it to exactly the roles its row security policies serve"). They ride a new dated privacy
-- version, approved by Lawal before this reaches production (operating rule 6; WI2-PLAN.md Part 3).
--
-- Reversal: drop the function, the two tables and their types; no other table is changed until a claim is verified, and
-- a verified claim's move is written down in its row (target_organisation_id, verified_at) so it can be undone by hand.
-- ============================================================================

begin;

create table if not exists public.listing_claims (
  id                      uuid primary key default gen_random_uuid(),
  venue_id                uuid references public.venues (id) on delete cascade,
  event_id                uuid references public.events (id) on delete cascade,
  claimant_user_id        uuid not null references auth.users (id) on delete cascade,
  claimant_name           text not null,
  claimant_role           text not null,
  email_used              text,
  method                  text not null,
  code_hash               text,
  expires_at              timestamptz,
  attempts                integer not null default 0,
  status                  text not null default 'sent',
  target_organisation_id  uuid references public.organisations (id) on delete set null,
  verified_at             timestamptz,
  created_at              timestamptz not null default now(),

  constraint listing_claims_one_target check ((venue_id is null) <> (event_id is null)),
  constraint listing_claims_name check (char_length(btrim(claimant_name)) between 1 and 120),
  constraint listing_claims_role check (char_length(btrim(claimant_role)) between 1 and 80),
  constraint listing_claims_method check (method in ('published_email', 'domain_email', 'manual')),
  constraint listing_claims_status check (status in ('sent', 'verified', 'expired', 'locked', 'manual_open', 'manual_approved', 'manual_declined')),
  constraint listing_claims_code_by_email check (
    (method = 'manual' and code_hash is null and expires_at is null and email_used is null)
    or (method <> 'manual' and code_hash ~ '^[0-9a-f]{64}$' and expires_at is not null
        and email_used ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  constraint listing_claims_attempts check (attempts between 0 and 5),
  constraint listing_claims_verified check ((status in ('verified', 'manual_approved')) = (verified_at is not null))
);

create index if not exists listing_claims_by_venue on public.listing_claims (venue_id) where venue_id is not null;
create index if not exists listing_claims_by_event on public.listing_claims (event_id) where event_id is not null;
create index if not exists listing_claims_by_claimant on public.listing_claims (claimant_user_id, created_at desc);

alter table public.listing_claims enable row level security;
revoke all on public.listing_claims from anon, authenticated, service_role;
grant select, insert, update on public.listing_claims to service_role;

comment on table public.listing_claims is
  'WI2 Part 3b, item 7: one claim of a venue or an event by a code to its published address. Private: no policy, service_role only.';

create table if not exists public.removal_requests (
  id               uuid primary key default gen_random_uuid(),
  venue_id         uuid references public.venues (id) on delete cascade,
  series_id        uuid references public.event_series (id) on delete cascade,
  requester_name   text not null,
  requester_email  text not null,
  reason           text not null,
  status           text not null default 'open',
  note             text,
  created_at       timestamptz not null default now(),
  actioned_at      timestamptz,

  constraint removal_requests_one_target check ((venue_id is null) <> (series_id is null)),
  constraint removal_requests_name check (char_length(btrim(requester_name)) between 1 and 120),
  constraint removal_requests_email check (requester_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint removal_requests_reason check (char_length(btrim(reason)) between 1 and 2000),
  constraint removal_requests_status check (status in ('open', 'actioned', 'declined')),
  constraint removal_requests_actioned check ((status = 'open') = (actioned_at is null))
);

alter table public.removal_requests enable row level security;
revoke all on public.removal_requests from anon, authenticated, service_role;
grant select, insert, update on public.removal_requests to service_role;

comment on table public.removal_requests is
  'WI2 Part 3b: anyone''s request to take a listed venue or series down, actioned by Lawal. Private: no policy, service_role only.';

-- ---------------------------------------------------------------------------
-- THE ONE WAY A CODE IS TRIED
-- ---------------------------------------------------------------------------
create or replace function public.listing_claim_check(p_claim uuid, p_code_hash text, p_organisation uuid, p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $check$
declare
  c public.listing_claims%rowtype;
begin
  select * into c from public.listing_claims where id = p_claim for update;
  if not found then
    return 'no_claim';
  end if;
  if c.status <> 'sent' then
    return c.status;
  end if;
  if p_at >= c.expires_at then
    update public.listing_claims set status = 'expired' where id = p_claim;
    return 'expired';
  end if;
  update public.listing_claims set attempts = attempts + 1 where id = p_claim returning * into c;
  if c.code_hash is distinct from p_code_hash then
    if c.attempts >= 5 then
      update public.listing_claims set status = 'locked' where id = p_claim;
      return 'locked';
    end if;
    return 'wrong';
  end if;
  if p_organisation is null then
    raise exception 'refused: a verified claim moves the listing to an organisation, and none was named' using errcode = '23514';
  end if;

  if c.venue_id is not null then
    update public.venues
       set organisation_id = p_organisation, listing_source = 'organiser', claimed_at = p_at
     where id = c.venue_id;
    update public.event_series
       set organisation_id = p_organisation, listing_source = 'organiser'
     where venue_id = c.venue_id;
    update public.events e
       set organisation_id = p_organisation
      from public.event_series s
     where s.venue_id = c.venue_id and e.listing_series_id = s.id and e.start_date >= p_at;
  else
    update public.events set organisation_id = p_organisation, listing_source = 'organiser' where id = c.event_id;
  end if;

  update public.listing_claims
     set status = 'verified', verified_at = p_at, target_organisation_id = p_organisation
   where id = p_claim;
  return 'verified';
end;
$check$;

revoke all on function public.listing_claim_check(uuid, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.listing_claim_check(uuid, text, uuid, timestamptz) to service_role;

comment on function public.listing_claim_check(uuid, text, uuid, timestamptz) is
  'WI2 Part 3b: try a claim code once; at 5 tries the claim locks, past its 15 minutes it expires; the right code moves the listing to the claimant''s organisation.';

commit;
