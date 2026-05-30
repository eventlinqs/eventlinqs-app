-- event_artists: the lineup join between events and artists.
-- See docs/GENRE-DISCOVERY-FOUNDATION-SPEC.md section 4.
--
-- billing_order: headliner = 0, support acts ascending.
--
-- RLS: public read; write restricted to the owning organiser of the event,
-- mirroring the existing events ownership pattern exactly
-- (organisation_id in (select id from public.organisations where owner_id = auth.uid())).

begin;

create table if not exists public.event_artists (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  billing_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (event_id, artist_id)
);

comment on table public.event_artists is
  'Event lineup: which artists play an event, in billing order (headliner = 0).';

create index if not exists event_artists_event_id_idx on public.event_artists (event_id);
create index if not exists event_artists_artist_id_idx on public.event_artists (artist_id);

alter table public.event_artists enable row level security;

drop policy if exists "event_artists_public_read" on public.event_artists;
create policy "event_artists_public_read" on public.event_artists
  for select using (true);

-- Only the organiser who owns the event may manage its lineup. Mirrors the
-- events_insert_own_org / events_update_own_org pattern.
drop policy if exists "event_artists_owner_all" on public.event_artists;
create policy "event_artists_owner_all" on public.event_artists
  for all
  using (
    event_id in (
      select e.id from public.events e
      where e.organisation_id in (
        select id from public.organisations where owner_id = auth.uid()
      )
    )
  )
  with check (
    event_id in (
      select e.id from public.events e
      where e.organisation_id in (
        select id from public.organisations where owner_id = auth.uid()
      )
    )
  );

commit;
