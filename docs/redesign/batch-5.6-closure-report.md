# Batch 5.6 Closure Report - Culture Pages Interactive Rails + Adjacent Scenes Visual Upgrade

Date: 2026-05-07
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3 (admin panel + marketing polish)
Status: CODE COMPLETE - STOP for project manager review

## Scope

3-task interactive uplift on the Batch 5.5 culture pages, narrowing the
gap between the static editorial state delivered in Batch 5.5 and the
interactive, click-routable state required for launch.

| Task | Subject |
|------|---------|
| T1 | Cities rail interactive (horizontal scroll with arrows + drag + native swipe + 15-20 cities AU-first) |
| T2 | Sub-cultures rail clickability + sub_culture filter on /events |
| T3 | Adjacent scenes "You might also like" rebuilt as photographic tiles |
| T4 | Verification + screenshots + commits + push + closure report |

## Per-task delivery

### T1 - Cities rail interactive

`src/components/features/culture/cities-rail.tsx` rebuilt from a static
flex-wrap grid into the SnapRailScroller pattern used on the homepage:

- Arrow nav (left + right) on desktop with right-edge gradient mask.
- Drag-scroll on desktop, native CSS scroll-snap on mobile.
- Scroll-progress indicator below the rail.
- Each tile: 280px wide, 4/5 portrait aspect, photographic city image
  with darkened bottom-up gradient, white city name + "{Culture} events"
  caption anchored bottom-left.
- Click routes to `/culture/{cultureSlug}/{citySlug}` - the
  intersection landing page added in Batch 5.5.

`src/lib/cultures/data.ts` - every culture's `cities` list expanded
from 6-8 entries to 20 entries. The first 15 entries are Australian
(Sydney, Melbourne, Brisbane, Perth, Adelaide, Gold Coast, Canberra,
Hobart, Newcastle, Geelong, Sunshine Coast, Wollongong, Cairns,
Darwin, Townsville). The final 5 are international anchors tuned per
culture (e.g. African ends with London/Toronto/Houston/Atlanta/Lagos;
South Asian ends with London/Toronto/New York/Dubai/Mumbai). This
gives every Tier 1 + Tier 2 page a substantive horizontal rail that
justifies the new arrow controls and keeps Australian discovery
density at the front of every culture surface.

### T2 - Sub-cultures clickable + sub_culture filter

`src/components/features/culture/sub-cultures-rail.tsx` - each tile is
now a `<Link href="/events?culture={cultureSlug}&sub_culture={subSlug}">`.
Previously the rail was visual-only with no destination.

Backend wiring across the events data layer:

- `src/lib/events/types.ts` - `FetchPublicEventsFilters` gains
  `sub_culture?: string`.
- `src/lib/events/search-params.ts` - `EventsSearchParams` parses the
  new `sub_culture` URL param and passes it through to the filters
  shape. `hasActiveFilters` treats sub_culture as a narrowing filter so
  the Recommended rail correctly hides on sub-culture-narrowed views.
- `src/lib/events/fetchers.ts` - new `resolveCultureCategorySlugs`
  helper. When sub_culture is supplied and matches a slug bridged for
  the chosen culture, the events query narrows to that single
  category (e.g. `?culture=african&sub_culture=amapiano` returns the
  amapiano category only). When the sub-culture has no bridged
  category yet, the resolver falls through and only the culture
  filter applies (graceful degradation - the user sees the broader
  culture catalogue rather than an empty grid).
- `fetchPublicEventsCached` cache key includes sub_culture so the new
  filter doesn't share a snapshot with the unfiltered culture page.

### T3 - Adjacent scenes photographic

`src/components/features/culture/related-cultures-rail.tsx` rebuilt
from text-only cards into 16:10 photographic tiles. Each tile carries
the related culture's hero image (via `getCultureHeroPhoto`) with a
darkened bottom-up gradient and the display-name + tagline anchored
bottom-left in white. Tier 1 cultures get a "Culture" eyebrow; Tier 2
verticals get a "Cross-cultural" eyebrow. Routes to `/culture/{slug}`.

Plumbing in `src/app/culture/[culture]/page.tsx` - related-culture
image fetches added to the page-level `Promise.all` so the rail and
the existing sub-culture + city tiles all hydrate from a single
round-trip on the server. `CultureLandingPage` gains a
`relatedCultureImages` prop, slot:value mapped in the same shape as
`subCultureImages` and `cityImages`.

Adjacent scenes is now visually consistent with the cities and
sub-cultures rails - all three rails use the same dark-overlay-plus-
white-text-on-photo treatment so users can wander between adjacent
scenes (African → Caribbean → Gospel) without dead-ending on a single
page.

## Quality gates (2026-05-07)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS (14 culture pages + 271 culture/city pages SSG'd, no route regressions) |
| `npm test` | PASS (10 files, 105 tests) |
| Lighthouse Performance >= 95 mobile | DEFERRED to Vercel preview per CLAUDE.md "no localhost performance measurements" rule |
| axe-core 0 violations | DEFERRED - paired with Lighthouse on Vercel preview |

## Evidence

- 28/28 culture screenshots re-captured at 1440 + 375 (mobile UA) via
  `scripts/batch-5-6-screenshots.mjs` - `docs/redesign/batch-5-evidence/after/culture-{slug}-{1440,375}.png` (overwriting Batch 5.5 captures).
- Rail-flow capture set for the cities rail arrow-click sequence on
  /culture/african - `docs/redesign/batch-5.6-evidence/rail-flow/cities-rail-african-1440-state-{1-initial,2-after-click-1,3-after-click-2}.png` showing rail scroll progress from Sydney → Melbourne → Brisbane → Perth (initial) through Brisbane → Perth → Adelaide → Gold Coast (after click 2).
- Checklist amended with the Batch 5.6 section at
  `docs/redesign/batch-5-evidence/checklist.md`.

## Coordination handoffs

- **C-B5.6-01:** Project manager runs Vercel preview Lighthouse
  median-of-5 mobile + axe-core 0 on
  `/culture/{african,south-asian,caribbean,latin,gospel,comedy}` -
  same routes as Batch 5.5 to verify no rail-interactivity regression.
- **C-B5.6-02:** Project manager verifies
  `/events?culture=african&sub_culture=amapiano` on preview returns the
  narrowed amapiano-only grid (and degrades gracefully to the full
  african set when sub_culture has no bridged category).

No DB migrations in Batch 5.6.

## Files touched

```
src/app/culture/[culture]/page.tsx
src/components/features/culture/cities-rail.tsx
src/components/features/culture/related-cultures-rail.tsx
src/components/features/culture/sub-cultures-rail.tsx
src/components/templates/CultureLandingPage.tsx
src/lib/cultures/data.ts
src/lib/events/fetchers.ts
src/lib/events/search-params.ts
src/lib/events/types.ts

scripts/batch-5-6-screenshots.mjs                                            (new)
docs/redesign/batch-5-evidence/checklist.md                                  (amended)
docs/redesign/batch-5-evidence/after/culture-{slug}-{1440,375}.png          (28 overwritten)
docs/redesign/batch-5.6-evidence/rail-flow/cities-rail-african-1440-state-*.png (3 new)
docs/redesign/batch-5.6-closure-report.md                                    (this file)
docs/sessions/admin-marketing/progress.log                                   (appended)
```

## Hard-rule compliance

- No em-dashes in any source, copy, commit message, or doc.
- No exclamation marks in user-facing copy.
- No "diaspora" anywhere.
- Australian English throughout.
- No `bg-image`, no raw `<img>`, no `next/image` direct import - all
  media flows through `@/components/media`.
- Cross-session file ownership respected: only files under
  `src/components/`, `src/app/`, `src/lib/cultures/`, `src/lib/events/`,
  `public/`, `docs/`, and `scripts/` were touched. No payment code, no
  infrastructure config, no `src/types/database.ts`, no `next.config.ts`.

## [GATE] Batch 5.6 code complete - STOP for project manager review
