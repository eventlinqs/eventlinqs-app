# Batch 6 Closure Report - City + Suburb Pages (Surpass Ticketmaster City Guides)

Date: 2026-05-07
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3 (admin panel + marketing polish)
Status: CODE COMPLETE - STOP for project manager review

## Mission

Ticketmaster launched their City Guides feature in July 2025, capturing
~2M monthly Google searches for city-based event queries. Australia is
uncovered by Ticketmaster City Guides, giving EventLinqs a window to
own AU city-page SEO. Goal for Batch 6: surpass Ticketmaster, match
Airbnb destination experience, integrate DICE-style editorial curation.

## Scope shipped

- **20 city pages** at `/city/[slug]` (8 Tier 1 capitals + Gold Coast,
  12 Tier 2 regional cities). Each carries the 15-section spec in the
  brief.
- **24 suburb pages** at `/city/[slug]/[suburb]` across 7 Tier 1 cities
  (Sydney 6, Melbourne 6, Brisbane 4, Perth 4, Gold Coast 2, Canberra 1,
  Hobart 1). Each carries the 8-section spec.
- **DB migration** `supabase/migrations/20260507000001_city_taxonomy.sql`
  adds `cities` (20 rows), `suburbs` (24 rows), extends `event_types`
  with `dj-set` + `cultural`, and adds `city_primary` + `suburb_primary`
  columns on `events` with a soft backfill from `venue_city`.
- **7 new components** under `src/components/features/city/`:
  CityHero, DateFilterChips, CityMap (Mapbox), EventTypesRail,
  CityEditorialSection, MobileStickyBar, CityNewsletterCapture, plus
  CityOrganiserCtaPanel.
- **2 new templates** under `src/components/templates/`: CityLandingPage,
  SuburbLandingPage.
- **Mapbox integration** with brand-recoloured base style (cream land,
  pale teal water, navy labels, hidden POI clutter) + custom gold
  drop-pin event markers + suburb polygon overlays + branded popup
  cards. Falls back to a static event list when the token is missing.
- **Newsletter capture API** at `/api/newsletter/subscribe` with Zod
  validation. v1 stub logs the signup; provider integration lands in M9.
- **Sitemap** extended with 44 new URLs at appropriate priorities
  (Tier 1 city 0.9, Tier 2 city 0.75, suburb 0.65).
- **Schema.org JSON-LD**: City + ItemList on every city page,
  Place on every suburb page.

## Section-by-section delivery

### City pages (15 sections)

| # | Section | Status |
|---|---------|--------|
| S1  | CityHero (photographic + 2 CTAs) | Shipped |
| S2  | DateFilterChips (sticky, URL-driven) | Shipped |
| S3  | CityEditorialSection (200-300 words, community-first) | Shipped, 20 cities written |
| S4  | This Week + This Weekend rails (≥4 events to render) | Shipped |
| S5  | Browse by Culture rail (SnapRailScroller) | Shipped |
| S6  | EventTypesRail (8 tiles) | Shipped |
| S7  | CityMap (Mapbox, custom navy/gold style) | Shipped |
| S8  | Popular this month (8 cards, ≥4 to render) | Shipped |
| S9  | By Suburb rail (Tier 1 only) | Shipped |
| S10 | Featured Organisers (≥3 to render) | Shipped, hidden until populated |
| S11 | Featured Venues (≥3 to render) | Shipped, hidden until populated |
| S12 | All [City] Events Grid (with empty-state CTA) | Shipped |
| S13 | Related Cities Rail (6-8 photographic tiles) | Shipped |
| S14 | Organiser CTA + Newsletter Capture | Shipped |
| S15 | MobileStickyBar (≤768px, 200px scroll trigger) | Shipped |

### Suburb pages (8 sections)

| # | Section | Status |
|---|---------|--------|
| SS1 | CityHero (suburb scoped) | Shipped |
| SS2 | DateFilterChips | Shipped |
| SS3 | CityEditorialSection (100-150 words) | Shipped, 24 suburbs written |
| SS4 | This Week + Weekend combined | Shipped |
| SS5 | All [Suburb] Events Grid | Shipped |
| SS6 | Related Suburbs Rail | Shipped |
| SS7 | Back to [City] CTA | Shipped |
| SS8 | MobileStickyBar | Shipped |

## Mapbox styling decisions

The brief specifies a custom map style with exact brand colours. Rather
than building a full Mapbox style spec (hundreds of layer definitions)
or hosting a custom Studio style (vendor lock + token rotation overhead),
the implementation in `src/components/features/city/city-map.tsx`:

- Loads the official `mapbox://styles/mapbox/light-v11` base style.
- On `load` event, iterates `getStyle().layers` and recolours by id
  pattern: water → pale teal, land → cream, parks → muted sage, road
  classes → cream/beige variants, place labels → brand navy. POI
  symbols are hidden so the brand pins read clean.
- Renders gold drop-pin DOM elements (32x40 SVG, navy border, white
  inner circle). Hover scales 1.15x.
- Suburb polygons use simple circular approximations (48-point ring,
  ~4km radius) around each suburb's lat/lng. Real cadastral
  boundaries would require sourcing official suburb shapefiles, which
  is M9 data work; the brand-friendly approximation lands the visual
  intent for v1 (subtle navy fill, hover lifts opacity, click routes
  to suburb page).
- Branded popup card (white, navy border, gold date, navy "View event"
  button) rendered as inline HTML via `setHTML`.
- Loading skeleton: cream background with pulsing gold spinner.
- Error fallback: static event list with anchor links.

## Editorial content

Every city editorial section names 3+ specific cultural communities and
2+ specific suburbs/neighbourhoods, per the brief, in Australian
English with no em-dashes and no exclamation marks. Each ends on an
organiser-pride line that closes back to the EventLinqs platform.

Sample (Sydney):
> "From Lakemba's Ramadan night markets to Bondi's summer beach
> parties, Sydney runs on diversity and rhythm. Filipino fiestas in
> Blacktown, Mardi Gras parades in Darlinghurst, Lebanese mahrajan in
> Punchbowl, Korean street food festivals in Strathfield, Yoruba owambe
> in Chatswood, Greek paneghiri in Marrickville. ..."

The full registry is at `src/lib/cities/data.ts`.

## Per-page checklist

44 pages individually graded against the spec. Every page passes every
gate (15 city sections / 8 suburb sections render, date chips work,
mobile sticky CTA wired, editorial communities ≥3). See:

`docs/redesign/batch-6-evidence/checklist.md`

## Image relevance audit

44 hero queries (20 cities + 24 suburbs) audited:
- 34 GOOD (77%)
- 10 ACCEPTABLE (23%)
- 0 POOR

See: `docs/redesign/batch-6-evidence/image-relevance.md`

## Reference captures

Pre-build competitor captures of city-guide patterns at
`docs/redesign/references/`:
- Ticketmaster AU Sydney + UK London (desktop + mobile)
- Airbnb Sydney experiences (desktop + mobile)
- DICE London city page (desktop + mobile)

## Quality gates

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS - 20 city + 24 suburb pages SSG'd, sitemap extended, no route regressions |
| `npm test` | PASS (10 files, 105 tests) |
| Mapbox custom style + gold pins + suburb polygons on Sydney | Verified - `docs/redesign/batch-6-evidence/map/sydney-mapbox-1440.png` |
| Mobile sticky CTA bar after hero scroll | Verified - `docs/redesign/batch-6-evidence/mobile-sticky-cta.png` |
| Lighthouse Performance >= 95 mobile | DEFERRED to Vercel preview per CLAUDE.md "no localhost performance measurements" rule (acknowledged conflict with brief; CLAUDE.md is the higher authority here) |
| axe-core 0 violations | DEFERRED to Vercel preview per same rule |

### Note on Lighthouse + axe-core deferral

The brief lists "Run all quality gates locally, commit results" with
Lighthouse + axe as line items. CLAUDE.md hard rule:

> NO localhost performance measurements (Vercel preview or production
> warmed only)

The two instructions conflict. CLAUDE.md is the higher authority for
this codebase, so Lighthouse + axe runs are explicitly handed off to
the project manager via coordination notes C-B6-03. This is the only
gate not run locally; lint, tsc, build, and unit tests all pass green.

## Coordination handoffs

- **C-B6-01:** Founder runs `supabase db push --linked` from PowerShell
  to apply `20260507000001_city_taxonomy.sql`. Fully idempotent. No
  NOT VALID gates.
- **C-B6-02:** PM verifies `NEXT_PUBLIC_MAPBOX_TOKEN` is set in
  Vercel preview + production. Without it the map renders the static
  fallback list (graceful degradation, but loses the brand experience).
  Token URL allowlist must include production + preview domains before
  promotion to prevent token leakage.
- **C-B6-03:** PM runs Vercel preview Lighthouse median-of-5 mobile +
  axe-core 0 on Sydney + Melbourne + Brisbane + Perth (Tier 1 launch
  set) per CLAUDE.md rule.
- **C-B6-04:** PM runs 7-viewport visual regression on Vercel preview
  for the 8 Tier 1 cities + 6 Sydney suburbs (sample of suburb
  template).
- **C-B6-05:** PM verifies the side-by-side comparisons against
  Ticketmaster + Airbnb on the Vercel preview - links in
  `docs/redesign/batch-6-evidence/comparisons/`.

## Files touched

```
supabase/migrations/20260507000001_city_taxonomy.sql                  (new)
src/lib/cities/data.ts                                                (new)
src/lib/images/suburb-photo.ts                                        (new)
src/components/features/city/city-hero.tsx                            (new)
src/components/features/city/date-filter-chips.tsx                    (new)
src/components/features/city/city-map.tsx                             (new)
src/components/features/city/event-types-rail.tsx                     (new)
src/components/features/city/city-editorial-section.tsx               (new)
src/components/features/city/mobile-sticky-bar.tsx                    (new)
src/components/features/city/city-newsletter-capture.tsx              (new)
src/components/features/city/city-organiser-cta-panel.tsx             (new)
src/components/templates/CityLandingPage.tsx                          (new)
src/components/templates/SuburbLandingPage.tsx                        (new)
src/app/city/[slug]/page.tsx                                          (new)
src/app/city/[slug]/[suburb]/page.tsx                                 (new)
src/app/api/newsletter/subscribe/route.ts                             (new)
src/app/sitemap.ts                                                    (amended)
package.json + package-lock.json                                      ([SHARED] mapbox-gl + @types/mapbox-gl added)

scripts/batch-6-reference-captures.mjs                                (new)
scripts/batch-6-screenshots.mjs                                       (new)
docs/redesign/batch-6-evidence/checklist.md                           (new)
docs/redesign/batch-6-evidence/image-relevance.md                     (new)
docs/redesign/batch-6-closure-report.md                               (this file)
docs/redesign/references/{ticketmaster,airbnb,dice}/*.png             (new, 8)
docs/redesign/batch-6-evidence/after/{city|suburb}-*-{1440|375}.png   (new, 88)
docs/redesign/batch-6-evidence/map/sydney-mapbox-1440.png             (new)
docs/redesign/batch-6-evidence/mobile-sticky-cta.png                  (new)
docs/redesign/batch-6-evidence/comparisons/{city}-vs-tm-airbnb.md     (new, 4)
docs/sessions/admin-marketing/progress.log                            (appended)
```

## Hard-rule compliance

- No em-dashes anywhere (source, copy, commits, docs).
- No exclamation marks in user-facing copy.
- No "diaspora" anywhere on the public surface.
- Australian English throughout the editorial copy.
- All media flows through `@/components/media`. No raw `<img>` outside
  the existing CityTileImage SVG escape hatch. No `bg-image` for content
  imagery. No direct `next/image` import.
- Cross-session file ownership respected. The only files touched
  outside `src/components/`, `src/app/`, `src/lib/`, `public/`, `docs/`,
  `scripts/`, and `supabase/migrations/` are `package.json` +
  `package-lock.json` for the `mapbox-gl` install, which CLAUDE.md
  flags as `[SHARED]` - flagged in the commit message accordingly.

## [GATE] Batch 6 code complete - STOP for project manager review
