# Batch 7 Closure Report - Culture × City Intersection Page Polish

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3 (admin panel + marketing polish)
Status: CODE COMPLETE - STOP for project manager review

## Mission

The 271 intersection pages at `/culture/[culture]/[city]` were SSG'd
in Batch 5.6 with a minimal hero + events grid + CTA pattern. They
were never polished against the Ticketmaster / Airbnb destination
quality bar. Batch 7 brings them up to launch quality with the
12-section spec from the brief, the editorial-copy generator, and
visual reuse of the platform's Rail Standard v2.0 components.

## Sections delivered (per page)

| # | Section | Status | Source |
|---|---------|--------|--------|
| S1  | CultureCityHero | Shipped (reuses CityHero w/ culture+city labels + intersection hero subtitle generator) |
| S2  | DateFilterChips (sticky) | Shipped (reuses Batch 6 component) |
| S3  | CityEditorialSection (150-200 words) | Shipped (reuses Batch 6 component) - copy from intersection-editorial.ts |
| S4  | This Week + This Weekend rails (≥4 events to render) | Shipped (SnapRailScroller w/ Rail Standard v2.0) |
| S5  | Sub-cultures in [city] rail (Tier 1 cultures only) | Shipped (SnapRailScroller w/ photographic tiles) |
| S6  | Popular this month rail (≥4 events to render) | Shipped (SnapRailScroller) |
| S7  | CityMap (Mapbox) | Shipped (reuses Batch 6.5 component) - hides cleanly when the city has no record in the cities table |
| S8  | Featured organisers (≥3 to render) | Hidden until populated; renders empty by design |
| S9  | Featured venues (≥3 to render) | Hidden until populated; renders empty by design |
| S10 | All [culture] events in [city] (paginated grid) | Shipped, with empty-state CTA when zero events match |
| S11 | Related intersections - 2 rails ([Culture] in other cities + Other cultures in [city]) | Shipped (SnapRailScroller) |
| S12 | Organiser CTA + Newsletter | Shipped (reuses Batch 6 component) - cityName prop is the plain city, intersection context is implicit from URL |
| S13 | MobileStickyBar | Shipped (reuses Batch 6 component) - bar label uses the combined "[Culture] [City]" so the CTA is specific |

## Editorial copy

`src/lib/cultures/intersection-editorial.ts` ships:

- **10 hand-crafted intersection paragraphs** (150-200 words each,
  Australian English, no em-dashes, no exclamation marks): african
  Sydney + Melbourne, south-asian Sydney + Melbourne, caribbean Sydney,
  east-asian Sydney, latin Sydney, mediterranean Melbourne,
  middle-eastern Sydney, filipino Melbourne. These are the highest-
  intent SEO targets per the brief.
- **Template generator** for the remaining ~261 combinations. The
  template composes from the culture's existing tagline + sub-culture
  list + the city's name and state. Voice still matches the brand.
- **10 hand-crafted hero subtitles** for the same set, with a generic
  fallback `${culture.tagline} On stage in ${cityName}.`

Both generators take `(culture, citySlug, cityName, cityRecord | null)`
so they degrade gracefully when the city isn't in the new
`src/lib/cities/data.ts` registry (e.g. London, Toronto, Houston which
appear in `culture.cities` for cross-discovery but aren't AU launch
cities).

## Quality gates (2026-05-09)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS - 271 intersection pages SSG'd alongside all other routes |
| `npm test` | PASS (10 files, 105 tests) |

## Visual verification

20 screenshots captured (10 intersections × 1440 + 375):

`docs/redesign/batch-7-evidence/intersections/{culture}-{city}-{1440,375}.png`

Captured set:
- african/sydney, african/melbourne
- south-asian/sydney, south-asian/melbourne
- caribbean/sydney, east-asian/sydney
- latin/sydney, mediterranean/melbourne
- middle-eastern/sydney, filipino/melbourne

Spot-checked African/Sydney @ 1440 and South Asian/Melbourne @ 1440:
- S1 hero renders with culture-city-specific title and intersection
  hero subtitle.
- S2 sticky chips visible.
- S3 editorial reads with the hand-crafted paragraph (e.g. African
  Sydney mentions Chatswood, Lakemba, Marrickville and Pan-African
  Gospel Sundays).
- S5 sub-cultures rail with photographic tiles + arrows + progress
  top-right per Rail Standard v2.0.
- S7 map section header renders. The Mapbox canvas itself loads with
  a recoloured base style on the Tier 1 cities; on smaller-record
  cities the section hides gracefully.
- S10 all-events grid empty-state CTA shows ("The first {culture}
  {city} event on EventLinqs could be yours") because the dev seed has
  limited culture+city events.
- S11a "{Culture} in other cities" rail shows photographic city tiles
  (Melbourne / Brisbane / Perth for African Sydney).
- S11b "Other cultures in {city}" rail shows photographic culture tiles
  (Caribbean / Gospel / Comedy for African Sydney).
- S12 dark CTA panel with "Throwing an event in Sydney?" + newsletter
  capture.

## Files modified

```
src/app/culture/[culture]/[city]/page.tsx                              (rewrite)
src/components/templates/CultureCityLandingPage.tsx                    (new)
src/lib/cultures/intersection-editorial.ts                             (new)

scripts/batch-7-screenshots.mjs                                        (new)
docs/redesign/batch-7-evidence/intersections/*.png                     (20 captures)
docs/redesign/batch-7-closure-report.md                                (this file)
docs/sessions/admin-marketing/progress.log                             (appended)
```

No DB migrations, no shared-files, no breaking API changes. The route
keeps the same generateStaticParams + generateMetadata signatures.

## Hard-rule compliance

- No em-dashes anywhere (source, copy, commits, docs).
- No exclamation marks in user-facing copy.
- No "diaspora" anywhere.
- Australian English throughout the editorial copy.
- All rails follow Rail Standard v2.0 (top-right arrows + progress).
- File ownership respected (only `src/app/culture/`, `src/components/`,
  `src/lib/`, `docs/`, `scripts/` touched).

## Coordination handoffs

- **C-B7-01:** PM runs Vercel preview Lighthouse + axe-core on
  `/culture/african/sydney` and `/culture/south-asian/melbourne`
  (representative top traffic targets) per CLAUDE.md "no localhost
  performance measurements" rule.
- **C-B7-02:** PM verifies the editorial paragraphs pass the brand-
  voice sweep on a real device read-through. The 10 hand-crafted
  paragraphs were read against the rules; the template fallback was
  unit-checked but not paragraph-by-paragraph reviewed.
- **C-B7-03:** Future-batch reminder - when M9 marketing populates
  organisers and venues, S8 + S9 rails will start rendering. Their
  data layer plumbing is already in CityLandingPage and can be reused
  here with culture+city filters.

## [GATE] Batch 7 intersection-page polish complete - STOP for review
