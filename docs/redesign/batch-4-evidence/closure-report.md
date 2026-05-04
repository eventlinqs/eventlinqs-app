# Batch 4 - Visual Quality Gate Closure Report

Date: 2026-05-04
Branch: `feat/m7-admin-panel`
Session: 3 (admin panel + marketing polish)
Author: Claude (Session 3 worktree)

## What founder rejected from Batch 3

Live production review on 2026-05-04 surfaced these concrete failures:

1. /categories/owambe shipped with PageHero variant="premium" - a navy
   band with a radial gold ellipse top-right. Read on the live URL as
   "yellow blob over black hero with text dumped on top".
2. /events/browse/sydney showed three of four event cards painted with
   the same Pexels stock photo (women hugging on a dance floor).
3. /pricing and /organisers carried the same dark + gold-blob hero
   pattern.

## Root-cause diagnoses

1. **Image collision** was not a Pexels relevance issue, it was a
   projection bug. `src/lib/events/event-card-projection.ts` detected
   `picsum.photos` URLs (dev seed placeholders) as "no real cover" and
   replaced them with `getCategoryPhoto(category.slug)`, which always
   returns the SAME photo for a given slug. Three Sydney events with
   `category.slug='afrobeats'` collapsed onto one Pexels photo.
2. **Black hero + gold blob** was the active design of the shared
   `PageHero` component (variant="premium") rendered by 15 marketing
   pages plus the category landing template. Replacing it once
   propagates to every caller.
3. **Photo-required gate gap**: the only enforcement was at fetch
   time (filter at the public surface). Organisers could still publish
   without a cover, leaving the public surface to silently drop the
   event from listings.

## What shipped this batch

### Structural

- `src/lib/events/event-card-projection.ts` - rewritten as a pure
  passthrough; the projection no longer paints a category fallback
  photo when the event cover is missing.
- `src/lib/events/fetchers.ts` - exported `hasRealCover()` helper
  applied to every public-surface query (`fetchPublicEvents`,
  `runFetchPublicEventsAdmin`, `fetchPopularThisWeek`,
  `fetchPopularThisWeekPublic`, `fetchRecommendedEvents`).
- `supabase/migrations/20260504000001_event_photo_required.sql` -
  CHECK constraint `events_published_real_cover` blocks publishing
  without a real cover; idempotent; NOT VALID until manual
  `ALTER TABLE ... VALIDATE CONSTRAINT` post-backfill.
- `src/lib/events/publish-gate.ts` - new `cover_image_required` reason;
  `hasRealCover()` mirrored locally; callsite updated in
  `src/app/(dashboard)/dashboard/events/actions.ts` for
  createEvent / updateEvent / publishEvent.
- `scripts/batch-4-seed-real-covers.mjs` - 27/27 dev seed events
  backfilled with unique Pexels covers (FNV-1a hash distribution per
  category pool).

### Visual rebuilds

- `src/components/templates/PhotographicCategoryHero.tsx` (NEW) +
  `CategoryLandingPage.tsx` rewired - 10 local AVIF/JPG hero rasters
  feed a photographic band with darkened bottom-up gradient (per
  DESIGN-SYSTEM 6.2.1 allowed pattern). Kills black hero + gold blob
  on /categories/[slug].
- `src/components/templates/PhotographicCityHero.tsx` (NEW) +
  `src/lib/images/city-photo.ts` `getCityHeroPhoto()` (NEW) +
  `src/components/features/events/m5-events-search-strip.tsx` (NEW) +
  `src/app/events/browse/[city]/page.tsx` rewired - photographic
  landscape city hero with darkened gradient on /events/browse/[city];
  search input moved to a slim band immediately below.
- `src/components/layout/PageHero.tsx` rebuilt as a light-surface
  hero with optional gold accent rule. Lands on /pricing, /about,
  /blog, /press, /careers, /help, /help/[slug], /contact, /legal/*,
  /partners.
- `src/components/templates/OrganisersLandingPage.tsx` - custom
  duplicate of the old dark hero rewritten to match the new
  light treatment.
- `src/app/page.tsx` rail density tune: rails now require >= 3 events
  to render so sparse 1-2 card rails are hidden against limited dev
  seed data.

## Quality gates (local)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS - 0 errors, 0 warnings |
| `npx tsc --noEmit` | PASS - 0 errors |
| `npm run build` | PASS - 122 static pages generated |
| `npm test` | PASS - 10 files / 105 tests |
| Lighthouse Performance >= 95 mobile | DEFERRED to Vercel preview per CLAUDE.md "no localhost performance measurements" rule |
| axe-core 0 violations | DEFERRED to Vercel preview |

## Evidence

- `docs/redesign/batch-4-evidence/before/` - 44 screenshots (22 pages x 2 viewports) captured 2026-05-04 against the pre-Batch-4 live state.
- `docs/redesign/batch-4-evidence/after/` - 44 screenshots captured 2026-05-04 against the rebuilt branch on local dev.
- `docs/redesign/batch-4-evidence/checklist.md` - per-page PASS/FAIL on the 6 visual-gate criteria for all 22 pages.
- `docs/redesign/batch-4-evidence/diagnosis/cover-backfill.json` - 27/27 backfill report.

## Coordination items handed back to project manager

- C-B4-01: founder runs `supabase db push --linked` to apply
  `20260504000001_event_photo_required.sql`, then
  `ALTER TABLE public.events VALIDATE CONSTRAINT events_published_real_cover`
  after the dev backfill is verified clean of picsum URLs.
- C-B4-02: project manager runs Vercel preview Lighthouse
  median-of-5 mobile + axe-core 0 on /, /events,
  /events/browse/sydney, /events/browse/melbourne,
  /categories/owambe, /pricing, /organisers, /about, /contact.

## Files changed

```
modified:   src/app/page.tsx
modified:   src/app/events/browse/[city]/page.tsx
modified:   src/app/(dashboard)/dashboard/events/actions.ts
modified:   src/components/layout/PageHero.tsx
modified:   src/components/templates/CategoryLandingPage.tsx
modified:   src/components/templates/OrganisersLandingPage.tsx
modified:   src/lib/events/event-card-projection.ts
modified:   src/lib/events/fetchers.ts
modified:   src/lib/events/publish-gate.ts
modified:   src/lib/images/city-photo.ts
modified:   scripts/batch-4-seed-real-covers.mjs
new file:   src/components/templates/PhotographicCategoryHero.tsx
new file:   src/components/templates/PhotographicCityHero.tsx
new file:   src/components/features/events/m5-events-search-strip.tsx
new file:   supabase/migrations/20260504000001_event_photo_required.sql
new file:   scripts/batch-4-screenshot.mjs
new file:   docs/redesign/batch-4-evidence/before/ (44 PNGs + _summary.json)
new file:   docs/redesign/batch-4-evidence/after/  (44 PNGs + _summary.json)
new file:   docs/redesign/batch-4-evidence/checklist.md
new file:   docs/redesign/batch-4-evidence/closure-report.md (this file)
new file:   docs/redesign/batch-4-evidence/diagnosis/cover-backfill.json
```
