# Genre Phase 2: data layer + discovery (design)

Date: 2026-05-31
Branch: `feat/genre-data-layer`
Status: Approved by founder 2026-05-31

## Context

Genre Phase 1 (schema + generated types) is committed. The taxonomy tables
(`genres`, `subgenres`, `artists`, `event_artists`, `follows`) and the
`events.genre_slug` / `events.subgenre_slug` columns already exist, with the
canonical TypeScript taxonomy at `src/lib/genres/data.ts`. This phase wires that
data layer into the event create/edit flow, builds a reusable picker, and ships
the public music/artist discovery surface plus follow/unfollow.

Confirmed schema facts that shape this design:

- `subgenres.genre_slug` FK to `genres.slug` (flat one-level parent -> child).
- Parent and sub slugs never collide (unit-tested), so one `/music/[slug]`
  namespace can resolve either.
- `follows.followable_type` has a CHECK constraint of `('artist','subgenre')`.
  Parent genres are NOT followable by design.
- `event_artists` has `billing_order` (0 = headliner) and `UNIQUE(event_id, artist_id)`.
- `artists` is global, `slug` UNIQUE, organiser-writable via RLS.
- `events.genre_slug` / `subgenre_slug` are nullable, FK `ON DELETE SET NULL`.

## Approved decisions

1. **Artist input:** search existing + create new (typeahead with a create fallback).
2. **Follow feed location:** `/account/following` (beside `/account/saved`).
3. **Benchmark data:** realistic AU seed used ONLY for the side-by-side, never an
   empty/coming-soon state. **HARD CONSTRAINT: local seed only. Do NOT publish
   events to the live Sydney database to populate discovery pages** — those pages
   render only published+public events, so prod seeding would expose fabricated
   events to real users. If local Supabase seeding is not feasible on this
   machine, STOP and report rather than seeding prod.

## A. Contradiction rule (the tested core)

A pure function `resolveGenreSelection(genre, subgenre)` in
`src/lib/genres/resolve.ts`:

- A valid subgenre always forces `genre_slug` to its parent, overriding any
  conflicting `genre` argument.
- An invalid/unknown subgenre is dropped.
- A lone genre is kept only if valid; otherwise both are null.
- Output invariant: never a subgenre without its correct parent; never a
  subgenre whose parent disagrees with the returned genre.

Signature:
```ts
function resolveGenreSelection(
  genre: string | null | undefined,
  subgenre: string | null | undefined,
): { genre_slug: GenreSlug | null; subgenre_slug: SubgenreSlug | null }
```

Used by BOTH the picker (live UX) and the server actions (authority), so the two
can never disagree. This is the heart of the unit tests.

## B. Server actions

File: `src/app/(dashboard)/dashboard/events/actions.ts`

- Extend `CreateEventInput` / `UpdateEventInput` with:
  ```ts
  genre_slug?: string | null
  subgenre_slug?: string | null
  artists?: Array<{ artist_id?: string | null; name: string; billing_order: number }>
  ```
- In the events `insert` (createEvent) and `update` (updateEvent), spread the
  result of `resolveGenreSelection(input.genre_slug, input.subgenre_slug)`.
- Shared helper `syncEventArtists(admin, eventId, artists)`:
  - For each artist without `artist_id`: find-or-create in `artists` by
    `slug = slugify(name)` (select-on-conflict to dedupe concurrent creates).
  - Delete existing `event_artists` for the event, then insert the new set with
    `billing_order` from list order.
  - No-op (and clears lineup) when `artists` is undefined vs empty: `undefined`
    means "not provided, leave as-is" on update; `[]` means "clear".
- Follow actions in `src/app/actions/follows.ts` (authed server client, RLS
  enforces ownership): `followEntity({type,id})`, `unfollowEntity({type,id})`.
  Validate `type ∈ {artist, subgenre}` and that the target exists (artist id in
  `artists`, subgenre slug in `SUBGENRE_SLUG_SET`). Revalidate `/account/following`.

## C. GenreArtistPicker

File: `src/components/features/events/genre-artist-picker.tsx` (`'use client'`).
Self-contained controlled component, one-line importable. **Does not edit
`event-form.tsx`.**

```ts
export type GenreArtistValue = {
  genre_slug: string | null
  subgenre_slug: string | null
  artists: Array<{ artist_id: string | null; name: string; billing_order: number }>
}
type Props = {
  value: GenreArtistValue
  onChange: (v: GenreArtistValue) => void
  artistOptions?: Array<{ id: string; name: string }>
}
```

- Genre `<select>` (13 from `GENRES`); changing it clears a subgenre that no
  longer belongs.
- Subgenre `<select>` filtered via `getSubgenresForGenre(genre)`; selecting a
  subgenre runs `resolveGenreSelection` so the parent is forced.
- Artist typeahead over `artistOptions` (search existing) plus an
  "Add '<name>'" create row; selected artists render as a reorderable list
  (up/down = billing order) with remove.
- Token-only styling, 44px touch targets, no bespoke art. Works with empty
  `artistOptions` (create-only).

## D. Discovery routes

Token-only chrome (no photographic hero), reuse `EventCard`, `m5-events-grid`,
`Section`; data via `createPublicClient()` mirroring `/city`'s query pattern
(filter `status='published'`, `visibility='public'`, future `start_date`).

- `src/app/music/page.tsx` — genre index with live per-genre event counts.
- `src/app/music/[slug]/page.tsx` — single namespace: `isGenreSlug` -> genre
  page (its events + subgenre chips), `isSubgenreSlug` -> subgenre page (its
  events + FollowButton), else `notFound()`. `generateStaticParams` from
  `GENRES` + `SUBGENRES`. `revalidate = 300`.
- `src/app/music/[slug]/[city]/page.tsx` — genre/subgenre scoped by
  `venue_city` (mirrors `/city/[slug]/[suburb]`).
- `src/app/artists/[slug]/page.tsx` — artist + upcoming events via
  `event_artists` join, FollowButton.
- `FollowButton` client component calling the follow actions; rendered only on
  subgenre and artist pages (parent genres not followable per schema).

## E. Follow feed

File: `src/app/account/following/page.tsx`, auth-gated (`createClient`,
`getUser`, redirect to login if absent).

- Load the user's `follows`, dropping orphans: subgenre follows whose slug is no
  longer in `SUBGENRE_SLUG_SET`, artist follows whose `artists` row is missing.
- List upcoming published/public events matching followed subgenres
  (`subgenre_slug in [...]`) OR followed artists (events joined through
  `event_artists`). De-duplicate and order by `start_date`.
- Token-styled empty state when the user follows nothing (never "coming soon").

## F. Benchmark seed (local only)

- `supabase/seed/genre-discovery-demo.sql` — clearly-labelled, idempotent,
  realistic AU music events + artists + lineups, genre/subgenre tagged, with a
  matching teardown. Applied to a LOCAL Supabase only.
- Benchmark runs the app against the local instance, captures screenshots, tears
  down. Never applied to live Sydney. If local Supabase cannot run here: STOP.

## G. Verification

- Gates: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` all green.
- Unit tests: `resolveGenreSelection` (all branches), `syncEventArtists`
  reconcile logic, follow validation, orphan filtering.
- Playwright at 1440 / 768 / 375 for the new routes.
- Competitive side-by-side vs DICE.fm and Ticketmaster.com.au at 1440 and 375 on
  info density, typography, image quality, filter UX, mobile polish, explicit
  pass/fail, written to a closure report under `docs/`.
- Open a PR. No admin merge.

## Out of scope

- Editing `event-form.tsx` (picker is built to drop in later, one line).
- Artist admin UI, artist images beyond what the schema already allows.
- Following parent genres (schema-forbidden).
