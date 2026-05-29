# Genre data layer: parking note

Date parked: 2026-05-29. Branch: feat/genre-data-layer (based on origin/main).
Spec: docs/GENRE-DISCOVERY-FOUNDATION-SPEC.md.

Paused at the founder's request to focus on the payment test. Resume the locked
way: Claude writes migration SQL only, founder runs `supabase db push --linked`
and `npm run db:types` from authenticated PowerShell, then Claude writes and
verifies the routes, forms, follow layer and RLS tests.

## On disk now (the only genre work that persisted)

- `src/lib/genres/data.ts` - canonical taxonomy module. 13 parent genres, 52
  sub-genres, type unions (GenreSlug, SubgenreSlug), SETs, and helpers
  (getGenre, getSubgenre, getParentGenre, getSubgenresForGenre, isGenreSlug,
  isSubgenreSlug, isMusicSlug). Australian English, no em-dashes. Mirrors the
  src/lib/cultures/data.ts pattern.
- `tests/unit/genres/data.test.ts` - unit test for the module (counts, unique
  slugs, no parent/sub slug collisions, valid parent refs, copy rules). Placed
  under tests/unit/ so it runs with the suite (vitest.config include is
  `tests/unit/**` only). NOT yet confirmed green in a session run: disk was
  critically low at the time. Run `npm test` to confirm now that disk is freed.

Both are untracked. Nothing committed. cultures and cities taxonomy untouched.

## Drafted but NOT written to disk yet (write these on resume, before db push)

Four migrations plus a standalone seed, designed against the verified schema
(events has organisation_id + created_by; ownership via organisations.owner_id;
admin via public.admin_users; reference-table style from
20260504000002_culture_taxonomy.sql). All RLS from the start. Naming continues
the repo convention:

1. `supabase/migrations/20260529000001_genre_taxonomy.sql`
   - tables `genres` (slug pk, name, display_order, timestamps) and `subgenres`
     (slug pk, name, genre_slug fk -> genres, display_order, timestamps)
   - seed both from the same list as src/lib/genres/data.ts (on conflict upsert)
   - add `events.genre_slug` and `events.subgenre_slug` (fk, on delete set null)
     plus indexes
   - RLS: public read only (writes via migration / service role)
2. `supabase/migrations/20260529000002_artists.sql`
   - `artists` (id uuid, slug unique, name, bio, image_url, spotify_url,
     timestamps); RLS public read, insert/update to authenticated
3. `supabase/migrations/20260529000003_event_artists.sql`
   - `event_artists` (id, event_id fk cascade, artist_id fk cascade,
     billing_order, unique(event_id, artist_id)); RLS public read, write only by
     the owning organiser (exists events join organisations on owner_id =
     auth.uid())
4. `supabase/migrations/20260529000004_follows.sql`
   - `follows` (id, user_id fk auth.users cascade, followable_type check
     ('artist','subgenre'), followable_id text, unique(user_id, type, id));
     RLS own-rows select/insert/delete. Admin read-all via service role.
5. `supabase/seed/genres.sql` - reproducible idempotent re-seed, kept in sync
   with the migration and data.ts.

## Decisions

- follows table name: confirmed `follows` per spec section 5. Verified absent in
  database.ts (along with artists, event_artists, genres, subgenres), so no
  conflict. The "organiser follows" table I worried about earlier does not exist
  (that was a misread).
- Parent-genre slugs (OPEN, confirm before applying): /music/{slug} is one
  namespace shared by parents and sub-genres, so slugs must be globally unique.
  Four categories share a name with one of their own sub-genres (Pop, Metal,
  Latin, Classical). Current design uses collision-free compound parent slugs
  (electronic-and-dance, pop-and-top-40, metal-and-metalcore,
  latin-and-reggaeton, classical-and-orchestral, ...) with plain sub-genre slugs
  (techno, pop, ...). Alternative is short parent slugs with sub-genre URL
  precedence on collision. The spec's /music/electronic example leans short.

## What is left (after migrations applied and types regenerated)

- Routes (server-rendered) under src/app/music and src/app/artists:
  - /music/[slug] (parent or sub, all cities)
  - /music/[slug]/[city] (sub or parent in a city; reuse src/lib/cities/data.ts
    slugs, do not invent cities)
  - /artists/[slug]
  - temporary minimal layout reusing EventCard
    (src/components/features/events/event-card.tsx, EventCardData shape), plain
    grid plus a basic genre/city selector. Mark TODO: replace with Rizwan Figma.
- SEO per route: generateMetadata (title, description, canonical via alternates,
  Open Graph), JSON-LD MusicEvent for listings and MusicGroup for artists.
  Reuse the repo JSON-LD pattern (src/components/features/events/
  event-schema-jsonld.tsx already maps a music category to MusicEvent).
- Event create/edit forms (src/app/(dashboard)/dashboard/events: create/page.tsx,
  [id]/edit/page.tsx, actions.ts, EventForm component): add parent-genre +
  sub-genre select and artist attachment with billing order. Persist genre_slug,
  subgenre_slug, and event_artists in createEvent/updateEvent (these use the
  admin client to insert into events).
- Follow layer: follow/unfollow server actions (own-row), follow-feed query
  (upcoming events where the user follows the artist or the sub-genre, city
  filter, dedup, plain SQL), and a minimal follow button to verify end to end.
- RLS verification: no RLS test harness exists in the repo. Add one (two
  ephemeral users via admin client) proving a user cannot read/write another
  user's follows and a non-owner cannot edit a lineup; plus anon read works
  where the spec says public.
- Gates: npm run lint, typecheck, npm test, npm run build all green. Playwright
  at 1440, 768, 375. Type regen via npm run db:types (db:types:check in CI).

## Environment facts learned (so we do not relearn them)

- Disk was critically low during the session (down to ~0.18 GB), now freed to
  ~3.6 GB per the founder. Keep an eye on it during build.
- Supabase CLI is not usable from this agent environment: no binary fetched via
  npx (failed, partly ENOSPC) and no SUPABASE_ACCESS_TOKEN. db push and
  gen types must be run by the founder from authenticated PowerShell. Scripts:
  `npm run db:types` (scripts/gen-db-types.mjs, runs supabase gen types
  --linked) and `npm run db:types:check`.
- src/types/database.ts is UTF-16 LE encoded, so ripgrep/Grep skips it as
  binary. Use Read or PowerShell Select-String for that file.
- Project ref: gndnldyfudbytbboxesk.
