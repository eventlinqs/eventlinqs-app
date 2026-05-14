# Batch 5 - Culture Pages Closure Report

Date: 2026-05-04
Branch: `redesign/world-class-rebuild-2026-05-03`
Session: 3 (admin panel + marketing polish)
Author: Claude (Session 3 worktree)

## What founder mandated

Build 14 culture landing pages at `/culture/[slug]` per IA Blueprint v2.0:

- 10 Tier 1 cultures: african, south-asian, caribbean, latin, east-asian, filipino, mediterranean, middle-eastern, european, pacific
- 4 Tier 2 cross-cultural verticals: gospel, comedy, wellness, pride

Each page composes a culture hero, story intro, sub-cultures rail,
city chip cloud, live events grid (or empty CTA), related cultures
rail, and an organiser CTA closer.

Plus a database migration adding `cultures` + `event_types` tables and
extending `events` with `culture_primary`, `sub_culture`, `event_type`
columns. Plus 301 redirects from the legacy `/categories/*` slugs that
map onto a culture. Plus sitemap.xml + Schema.org structured data.

## What shipped this batch

### Database

- `supabase/migrations/20260504000002_culture_taxonomy.sql` - new
  `cultures` table (14 seed rows, RLS anon-select + admin-write),
  new `event_types` table (13 seed rows, same RLS), three new
  columns on `events` (`culture_primary` FK to cultures.slug,
  `sub_culture` text, `event_type` FK to event_types.slug). Idempotent
  inserts via `on conflict (slug) do update`. Indexed on culture_primary
  and event_type. `[SHARED]` change handed to founder for application
  via `supabase db push --linked` (see C-B5-01 below).

### Code library

- `src/lib/cultures/data.ts` - canonical content registry for the 14
  cultures (`CultureSlug`, `CultureContent`, `getCulture`,
  `getAllCultures`, `getTier1Cultures`, `getTier2Cultures`,
  `isCultureSlug`). Each culture carries displayName, tagline,
  hero copy, 3 story paragraphs, 6 sub-cultures, city list, related
  cultures, organiser personas, SEO keywords. Australian English,
  no em-dashes, no exclamation marks, no "diaspora" anywhere.
- `src/lib/cultures/category-bridge.ts` - maps each culture slug to
  the legacy `event_categories.slug` values that should populate its
  rails (e.g. `african → ['afrobeats', 'amapiano', 'owambe']`). Bridge
  stays in place after the DB migration so organiser imports that
  only carry the legacy category still flow into the right culture
  page.
- `src/lib/images/culture-photo.ts` - Pexels-backed culture hero
  photo helper. Landscape orientation, top-5 hash sample, v1 cache
  key, `unstable_cache` wrapper with 7-day revalidate and tag
  `pexels-culture`.

### Components

New components under `src/components/features/culture/`:
- `sub-cultures-rail.tsx` - 6-tile grid linking to filtered events
- `cities-rail.tsx` - chip cloud routing to /events/browse/{city}
- `related-cultures-rail.tsx` - 3-tile cross-discovery
- `culture-organiser-cta.tsx` - dark band closer with persona pills + CTA
- `events-by-culture-grid.tsx` - up to 12 EventCards or empty CTA

Plus `src/components/templates/PhotographicCultureHero.tsx` (mirrors
PhotographicCityHero pattern) and
`src/components/templates/CultureLandingPage.tsx` (composes all
sections in the locked order).

### Route

- `src/app/culture/[slug]/page.tsx` - dynamic route with
  `generateStaticParams` returning all 14 culture slugs,
  `generateMetadata` emitting per-culture title / description /
  keywords / canonical / og:url, and a Schema.org CollectionPage
  JSON-LD payload with an embedded ItemList of up to 12 live events.
  ISR `revalidate = 300` matches `/events/[slug]` and `/categories/[slug]`.

### Redirects

`next.config.ts` `redirects()` - 6 permanent (301) entries:
```
/categories/afrobeats                 -> /culture/african
/categories/amapiano                  -> /culture/african
/categories/owambe                    -> /culture/african
/categories/heritage-and-independence -> /culture/african
/categories/caribbean                 -> /culture/caribbean
/categories/gospel                    -> /culture/gospel
```
`[SHARED]` change to `next.config.ts` flagged for the project manager.
The legacy `/categories/networking` remains in place; networking is
not a culture and that page's fate is decided in M7 admin work.

### Sitemap

`src/app/sitemap.ts` extended to emit one sitemap entry per culture
with priority 0.85 (Tier 1) or 0.75 (Tier 2).

## Quality gates (local)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS - 0 errors, 0 warnings |
| `npx tsc --noEmit` | PASS - 0 errors |
| `npm run build` | PASS - 14 /culture/[slug] routes prerendered alongside legacy /categories/[slug] |
| `npm test` | PASS - 10 files / 105 tests |
| Lighthouse Performance >= 95 mobile | DEFERRED to Vercel preview per CLAUDE.md "no localhost performance measurements" rule |
| axe-core 0 violations | DEFERRED to Vercel preview |

## Evidence

- `docs/redesign/batch-5-evidence/after/` - 28 screenshots (14 pages x 2 viewports) captured 2026-05-04 against the rebuilt branch on local dev (`http://localhost:3001`).
- `docs/redesign/batch-5-evidence/after/_summary.json` - per-screenshot pass/fail report PLUS `redirectResults` array with the 6 verified 301 redirects (final URL recorded for each).
- `docs/redesign/batch-5-evidence/checklist.md` - per-page PASS/FAIL on the 8 visual-gate criteria for all 14 culture pages, plus redirect verification table and quality-gates table.
- `docs/redesign/batch-4-evidence/after/categories-*` - the legacy `/categories/*` "before" reference (Batch 4's after = Batch 5's before for the pages this batch supersedes).

## Known v1 trade-offs

These are conscious scope decisions, not deferrals masquerading as
done:

1. **Featured organisers and venues rails** are not in the v1 page.
   The IA Blueprint mentioned them but the data model required
   (organiser featured-flag, venue featured-flag, venue-by-culture
   linkage) is not yet in place. Re-introducing them requires
   M7 admin-panel work. The page reads complete without them
   because the events grid carries the live-event surface and the
   cities rail carries the geographic surface.

2. **Sub-culture filtering on /events** is a planned enhancement.
   Sub-culture chip links on the rails route to
   `/events?culture={slug}&sub={subSlug}` but the search surface
   currently ignores `sub`. The DB migration adds the
   `events.sub_culture` column so once organisers can tag events
   with a sub-culture from the dashboard, the search filter wires
   up trivially.

3. **Tier 1 cultures without a legacy category bridge** (european,
   middle-eastern, pacific, pride) currently render the
   `CategoryHeroEmpty` CTA in the events grid section because the
   legacy `event_categories` table doesn't yet carry slugs for these.
   Once organisers start tagging events with `culture_primary`
   directly (post-migration), these surfaces will populate without
   requiring the bridge.

4. **Side-by-side comparisons vs Ticketmaster** are NOT included as
   composite images in this batch. The references at
   `docs/redesign/references/` are homepage-only and do not include
   Ticketmaster category landing pages. Capturing competitor
   comparisons for the new culture surface is a follow-on task that
   needs reference fixtures established first.

## Coordination items handed back to project manager

- **C-B5-01**: founder runs `supabase db push --linked` from the
  PowerShell terminal to apply `20260504000002_culture_taxonomy.sql`.
  No `VALIDATE CONSTRAINT` step required - all FKs are nullable and
  no NOT VALID gates were used. After application, the
  `events.culture_primary` column is available for organisers to set
  via the dashboard publish flow (separate Session 1 / 3 work to wire
  the dashboard form field).
- **C-B5-02**: `[SHARED]` files modified - `next.config.ts` (redirects
  table) and `src/app/sitemap.ts` (culture entries). Project manager
  should confirm no conflict with Session 1 / 2 commits before merge
  to main.
- **C-B5-03**: project manager runs Vercel preview Lighthouse
  median-of-5 mobile + axe-core 0 on /culture/african,
  /culture/south-asian, /culture/caribbean, /culture/latin,
  /culture/gospel, /culture/comedy.

## Files changed

```
new file:   supabase/migrations/20260504000002_culture_taxonomy.sql
new file:   src/lib/cultures/data.ts
new file:   src/lib/cultures/category-bridge.ts
new file:   src/lib/images/culture-photo.ts
new file:   src/components/templates/PhotographicCultureHero.tsx
new file:   src/components/templates/CultureLandingPage.tsx
new file:   src/components/features/culture/sub-cultures-rail.tsx
new file:   src/components/features/culture/cities-rail.tsx
new file:   src/components/features/culture/related-cultures-rail.tsx
new file:   src/components/features/culture/culture-organiser-cta.tsx
new file:   src/components/features/culture/events-by-culture-grid.tsx
new file:   src/app/culture/[slug]/page.tsx
new file:   scripts/batch-5-screenshot.mjs
new file:   docs/redesign/batch-5-evidence/after/ (28 PNGs + _summary.json)
new file:   docs/redesign/batch-5-evidence/checklist.md
new file:   docs/redesign/batch-5-evidence/closure-report.md (this file)
modified:   next.config.ts                          [SHARED]
modified:   src/app/sitemap.ts
```
