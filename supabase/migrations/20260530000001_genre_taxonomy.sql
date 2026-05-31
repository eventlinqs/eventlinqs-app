-- Genre taxonomy: parent genres and sub-genres for music discovery.
--
-- Mirrors the canonical TS source src/lib/genres/data.ts and is re-seeded
-- reproducibly from supabase/seed/genres.sql. See
-- docs/GENRE-DISCOVERY-FOUNDATION-SPEC.md sections 3 and 7. Keep all three in
-- sync (data.ts, this migration's seed, seed/genres.sql).
--
-- URL model: parent-genre and sub-genre pages share the /music/{slug}
-- namespace, so every slug is unique across BOTH levels. Parent slugs are
-- compound (electronic-and-dance) to stay collision-free against their lead
-- sub-genre (see the note flagged to the architect in the plan).
--
-- RLS: public read (these are search-engine landing taxonomy). Writes happen
-- through migrations and the service role only, so no write policy is defined
-- (RLS denies writes to anon and authenticated by default).
--
-- Idempotent: guarded CREATE / ALTER, upsert seed.

begin;

-- Parent genres (the top-level community group fans browse under).
create table if not exists public.genres (
  slug text primary key,
  name text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.genres is
  'Music parent-genre taxonomy. Mirrors src/lib/genres/data.ts (GENRES).';

-- Sub-genres (what fans actually browse and follow).
create table if not exists public.subgenres (
  slug text primary key,
  name text not null,
  genre_slug text not null references public.genres(slug) on delete cascade,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subgenres is
  'Music sub-genre taxonomy. Mirrors src/lib/genres/data.ts (SUBGENRES).';

create index if not exists subgenres_genre_slug_idx on public.subgenres (genre_slug);
create index if not exists genres_display_order_idx on public.genres (display_order);

-- Tag events with a parent genre and a sub-genre. Nullable: not every event is
-- a music event. on delete set null keeps events if the taxonomy ever changes.
alter table public.events
  add column if not exists genre_slug text references public.genres(slug) on delete set null,
  add column if not exists subgenre_slug text references public.subgenres(slug) on delete set null;

create index if not exists events_genre_slug_idx
  on public.events (genre_slug) where genre_slug is not null;
create index if not exists events_subgenre_slug_idx
  on public.events (subgenre_slug) where subgenre_slug is not null;

-- Seed / refresh parent genres from the canonical TS source.
insert into public.genres (slug, name, display_order) values
  ('electronic-and-dance', 'Electronic and dance', 1),
  ('hip-hop-and-rap', 'Hip hop and rap', 2),
  ('african', 'African', 3),
  ('rnb-and-soul', 'R and B and soul', 4),
  ('pop-and-top-40', 'Pop', 5),
  ('rock-and-alternative', 'Rock and alternative', 6),
  ('metal-and-metalcore', 'Metal', 7),
  ('jazz-and-blues', 'Jazz and blues', 8),
  ('reggae-and-caribbean', 'Reggae and Caribbean', 9),
  ('latin-and-reggaeton', 'Latin', 10),
  ('country-and-folk', 'Country and folk', 11),
  ('classical-and-orchestral', 'Classical', 12),
  ('world-and-other', 'World and other', 13)
on conflict (slug) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  updated_at = now();

-- Seed / refresh sub-genres from the canonical TS source.
insert into public.subgenres (slug, name, genre_slug, display_order) values
  ('house', 'House', 'electronic-and-dance', 1),
  ('techno', 'Techno', 'electronic-and-dance', 2),
  ('drum-and-bass', 'Drum and bass', 'electronic-and-dance', 3),
  ('dubstep', 'Dubstep', 'electronic-and-dance', 4),
  ('trance', 'Trance', 'electronic-and-dance', 5),
  ('garage', 'Garage', 'electronic-and-dance', 6),
  ('hardstyle', 'Hardstyle', 'electronic-and-dance', 7),
  ('disco', 'Disco', 'electronic-and-dance', 8),
  ('edm', 'EDM', 'electronic-and-dance', 9),
  ('hip-hop', 'Hip hop', 'hip-hop-and-rap', 1),
  ('trap', 'Trap', 'hip-hop-and-rap', 2),
  ('drill', 'Drill', 'hip-hop-and-rap', 3),
  ('boom-bap', 'Boom bap', 'hip-hop-and-rap', 4),
  ('grime', 'Grime', 'hip-hop-and-rap', 5),
  ('afrobeats', 'Afrobeats', 'african', 1),
  ('amapiano', 'Amapiano', 'african', 2),
  ('afro-house', 'Afro house', 'african', 3),
  ('rnb', 'R and B', 'rnb-and-soul', 1),
  ('soul', 'Soul', 'rnb-and-soul', 2),
  ('funk', 'Funk', 'rnb-and-soul', 3),
  ('neo-soul', 'Neo soul', 'rnb-and-soul', 4),
  ('pop', 'Pop', 'pop-and-top-40', 1),
  ('top-40', 'Top 40', 'pop-and-top-40', 2),
  ('synth-pop', 'Synth pop', 'pop-and-top-40', 3),
  ('rock', 'Rock', 'rock-and-alternative', 1),
  ('indie', 'Indie', 'rock-and-alternative', 2),
  ('alternative', 'Alternative', 'rock-and-alternative', 3),
  ('punk', 'Punk', 'rock-and-alternative', 4),
  ('hardcore', 'Hardcore', 'rock-and-alternative', 5),
  ('metal', 'Metal', 'metal-and-metalcore', 1),
  ('heavy-metal', 'Heavy metal', 'metal-and-metalcore', 2),
  ('metalcore', 'Metalcore', 'metal-and-metalcore', 3),
  ('jazz', 'Jazz', 'jazz-and-blues', 1),
  ('blues', 'Blues', 'jazz-and-blues', 2),
  ('swing', 'Swing', 'jazz-and-blues', 3),
  ('reggae', 'Reggae', 'reggae-and-caribbean', 1),
  ('dancehall', 'Dancehall', 'reggae-and-caribbean', 2),
  ('ska', 'Ska', 'reggae-and-caribbean', 3),
  ('latin', 'Latin', 'latin-and-reggaeton', 1),
  ('reggaeton', 'Reggaeton', 'latin-and-reggaeton', 2),
  ('salsa', 'Salsa', 'latin-and-reggaeton', 3),
  ('country', 'Country', 'country-and-folk', 1),
  ('folk', 'Folk', 'country-and-folk', 2),
  ('americana', 'Americana', 'country-and-folk', 3),
  ('bluegrass', 'Bluegrass', 'country-and-folk', 4),
  ('classical', 'Classical', 'classical-and-orchestral', 1),
  ('opera', 'Opera', 'classical-and-orchestral', 2),
  ('orchestral', 'Orchestral', 'classical-and-orchestral', 3),
  ('world', 'World', 'world-and-other', 1),
  ('acoustic', 'Acoustic', 'world-and-other', 2),
  ('singer-songwriter', 'Singer-songwriter', 'world-and-other', 3),
  ('experimental', 'Experimental', 'world-and-other', 4)
on conflict (slug) do update set
  name = excluded.name,
  genre_slug = excluded.genre_slug,
  display_order = excluded.display_order,
  updated_at = now();

-- RLS: public read only.
alter table public.genres enable row level security;
alter table public.subgenres enable row level security;

drop policy if exists "genres_public_read" on public.genres;
create policy "genres_public_read" on public.genres
  for select using (true);

drop policy if exists "subgenres_public_read" on public.subgenres;
create policy "subgenres_public_read" on public.subgenres
  for select using (true);

commit;
