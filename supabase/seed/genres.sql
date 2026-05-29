-- Reproducible genre taxonomy seed. Idempotent: safe to re-run in any
-- environment. The schema (tables, RLS, the on-apply seed) lives in
-- supabase/migrations/20260530000001_genre_taxonomy.sql. This file is the
-- standalone re-seed, kept in sync with that migration and with the canonical
-- TS source src/lib/genres/data.ts. See
-- docs/GENRE-DISCOVERY-FOUNDATION-SPEC.md section 7.

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
