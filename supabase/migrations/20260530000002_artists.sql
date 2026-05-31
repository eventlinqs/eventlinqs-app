-- Artists: first-class entities so the platform can do artist-level discovery
-- (the dominant discovery engine industry-wide) once scale arrives.
-- See docs/GENRE-DISCOVERY-FOUNDATION-SPEC.md section 4.
--
-- RLS: public read; insert and update restricted to organisers (authenticated
-- users who own an organisation) and the service role. Artists are shared
-- global entities attached to events during event creation, so write access is
-- gated on organisation ownership rather than per-row ownership. Deletes have
-- no policy, so RLS denies them to anon and authenticated (service role only).

begin;

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  bio text,
  image_url text,
  spotify_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.artists is
  'Artist entities for artist-level discovery and future Spotify / Bandsintown sync.';

create index if not exists artists_name_idx on public.artists (name);

alter table public.artists enable row level security;

drop policy if exists "artists_public_read" on public.artists;
create policy "artists_public_read" on public.artists
  for select using (true);

drop policy if exists "artists_organiser_insert" on public.artists;
create policy "artists_organiser_insert" on public.artists
  for insert to authenticated
  with check (
    exists (select 1 from public.organisations where owner_id = auth.uid())
  );

drop policy if exists "artists_organiser_update" on public.artists;
create policy "artists_organiser_update" on public.artists
  for update to authenticated
  using (
    exists (select 1 from public.organisations where owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.organisations where owner_id = auth.uid())
  );

commit;
