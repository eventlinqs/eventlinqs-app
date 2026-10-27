-- ============================================================================
-- COLLABORATORS: A VENUE JOINS AN EVENT AND SHARES ITS KIT.
--
-- The locked plan of 27 October 2026, Sprint 3, item 15: "Collaborators: a venue
-- or performer joins a listing and shares its kit", done when "A collaborator
-- shows on the page and gets tracked links". Decided three ways in
-- docs/walk-in/COLLABORATORS-DECISION.md: a performer already collaborates
-- (event_artists, share_links.artist_id); this adds the venue.
--
-- WHAT THIS FILE ADDS.
--   1. public.event_collaborators: one row per venue asked to join an event that
--      another organisation runs. The event's organiser asks; a person who owns
--      the venue's organisation joins or declines. Written by the service role
--      only, after the server has checked who is asking.
--   2. Three rules the database holds, whatever a caller sends: the organisation
--      named owns the venue named; the venue is its own people's (an organiser's
--      venue, or a listed venue once claimed); and it is not the organisation
--      that runs the event (nobody collaborates on their own event).
--   3. share_links.collaborator_id: a joined venue's own tracked links, counted
--      through the same spine as an artist's, never as the organiser's.
--
-- WHO READS WHAT (row security, then grants to exactly those roles, the
-- policies naming ownership through public.el_owned_organisation_ids(), never by
-- reading public.organisations, which the caller may not (20260819000001),
-- founder's ruling of 21 October 2026):
--   anon and authenticated: a JOINED row, so the event page can name its venue
--     partner to anybody; nothing about an invitation or a refusal.
--   authenticated: every row of an event the reader's organisation runs, and
--     every row naming the reader's own organisation.
--   service_role: reads and writes, for the server actions that ask and answer.
--
-- REVERSIBLE? Drop the column, then the table; nothing else reads them.
--
-- Lawal applies it with `supabase db push --linked` in PowerShell.
-- ============================================================================

begin;

create table if not exists public.event_collaborators (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  organisation_id  uuid not null references public.organisations (id) on delete cascade,
  venue_id         uuid not null references public.venues (id) on delete cascade,
  role             text not null default 'venue',
  status           text not null default 'invited',
  asked_by         uuid references auth.users (id) on delete set null,
  asked_at         timestamptz not null default now(),
  answered_by      uuid references auth.users (id) on delete set null,
  answered_at      timestamptz,
  constraint event_collaborators_role check (role in ('venue')),
  constraint event_collaborators_status check (status in ('invited', 'joined', 'declined')),
  constraint event_collaborators_answer_has_its_moment check ((status = 'invited') = (answered_at is null)),
  constraint event_collaborators_once unique (event_id, organisation_id)
);

comment on table public.event_collaborators is
  'A venue asked to join an event another organisation runs, and its answer. Written by the service role only. Collaborators, item 15 of the locked plan of 27 October 2026.';

create index if not exists event_collaborators_event_idx on public.event_collaborators (event_id);
create index if not exists event_collaborators_organisation_idx on public.event_collaborators (organisation_id);

-- The two rules, held here so no caller can argue past them.
create or replace function public.event_collaborators_hold_their_rules()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.venues v where v.id = new.venue_id and v.organisation_id = new.organisation_id) then
    raise exception 'a venue joins only for the organisation that owns it (venue %, organisation %)', new.venue_id, new.organisation_id;
  end if;
  -- A venue EventLinqs listed and nobody has claimed is held by the listings
  -- organisation (WI2 ruling A), so nobody of the venue's own could answer.
  if exists (select 1 from public.venues v where v.id = new.venue_id and v.listing_source = 'eventlinqs' and v.claimed_at is null) then
    raise exception 'a venue joins only once its own people hold it: venue % is listed and not yet claimed', new.venue_id;
  end if;
  if exists (select 1 from public.events e where e.id = new.event_id and e.organisation_id = new.organisation_id) then
    raise exception 'an organisation does not collaborate on its own event (event %)', new.event_id;
  end if;
  return new;
end;
$$;

drop trigger if exists event_collaborators_hold_their_rules on public.event_collaborators;
create trigger event_collaborators_hold_their_rules
  before insert or update of event_id, organisation_id, venue_id on public.event_collaborators
  for each row execute function public.event_collaborators_hold_their_rules();

alter table public.event_collaborators enable row level security;

drop policy if exists "Joined collaborators are public" on public.event_collaborators;
create policy "Joined collaborators are public"
  on public.event_collaborators for select
  to anon, authenticated
  using (status = 'joined');

drop policy if exists "The event's organiser reads its collaborators" on public.event_collaborators;
create policy "The event's organiser reads its collaborators"
  on public.event_collaborators for select
  to authenticated
  using (
    event_id in (
      select e.id from public.events e
      where e.organisation_id in (select public.el_owned_organisation_ids())
    )
  );

drop policy if exists "A venue reads what it was asked" on public.event_collaborators;
create policy "A venue reads what it was asked"
  on public.event_collaborators for select
  to authenticated
  using (organisation_id in (select public.el_owned_organisation_ids()));

revoke all on public.event_collaborators from public, anon, authenticated, service_role;
grant select on public.event_collaborators to anon, authenticated;
grant select, insert, update on public.event_collaborators to service_role;

-- A joined venue's own tracked links.
alter table public.share_links
  add column if not exists collaborator_id uuid references public.event_collaborators (id) on delete set null;

create index if not exists share_links_collaborator_idx on public.share_links (collaborator_id)
  where collaborator_id is not null;

-- The venue's owner reads the links tagged to its own collaboration, as an artist reads theirs.
drop policy if exists "share_links_collaborator_owner_select" on public.share_links;
create policy "share_links_collaborator_owner_select" on public.share_links
  for select using (
    collaborator_id is not null and collaborator_id in (
      select c.id from public.event_collaborators c
      where c.organisation_id in (select public.el_owned_organisation_ids())
    )
  );

commit;
