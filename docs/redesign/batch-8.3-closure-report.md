# Batch 8.3 Closure Report - Venue Profile Page Build + OP7 Wire-up

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3 (admin panel + marketing polish)
Status: CODE COMPLETE - STOP for project manager review

## GATE 1 - Reference captures: PASS

| File | Size | Status |
|------|------|--------|
| `docs/redesign/references/venue-profile/ticketmaster-1440.png` | 1386160 bytes | PASS |
| `docs/redesign/references/venue-profile/ticketmaster-375.png` | 678710 bytes | PASS (fallback to /discover/concerts - TM venue-specific URLs returned <100KB in headless Chromium due to anti-bot) |
| `docs/redesign/references/venue-profile/dice-1440.png` | 154391 bytes | PASS (fallback to /browse/sydney - DICE venue pages also blocked headless captures) |
| `docs/redesign/references/venue-profile/dice-375.png` | 112674 bytes | PASS (same fallback) |
| `docs/redesign/references/venue-profile/eventbrite-1440.png` | 1399414 bytes | PASS |
| `docs/redesign/references/venue-profile/eventbrite-375.png` | 1374194 bytes | PASS |

All 6 files on disk before build began. Fallback paths documented in
the script + this closure note - the captures still surface
representative platform aesthetics for layout reference.

## GATE 2 - Existing code audit: net-new build

Per `docs/redesign/batch-8.3-evidence/existing-code-audit.md`:

`src/app/venues/[handle]/page.tsx` did not exist (no
`src/app/venues/` directory at all). The `Venue` interface exists
in `src/types/database.ts` but lacks `slug`, `latitude`,
`longitude`, `venue_type`, `amenities`, `website`, `phone`. The
audit decided **net-new build with name-derived handle and
event-aggregation data layer**, with forward-compat for the M7
admin panel surfacing the missing schema.

## What shipped

### Resolver

`src/lib/venues/resolver.ts` - `resolveVenueProfile(handle)` returns
a unified `VenueProfile` shape sourced from the venues table when a
row matches handle, otherwise from `events.venue_name` aggregations.
Forward-compat: when M7 admin panel adds slug/lat/lng/type/amenities/
website/phone, the resolver picks them up via the existing fields
without code changes.

### Five new components

`src/components/features/venues/`:
- `venue-schema-jsonld.tsx` - Schema.org Place JSON-LD
- `venue-profile-hero.tsx` - VP1 hero
- `venue-amenities-grid.tsx` - VP2 venue info grid
- `venue-mobile-sticky-bar.tsx` - VP9 mobile sticky CTA

The VP3 map reuses the existing `CityMap` (Mapbox); VP4/VP5/VP6/VP7/VP8
reuse `SnapRailScroller`, `EventCard`, `OrganiserAvatar`,
`CityTileImage`, `CategoryHeroEmpty` per the brief's "reuse existing"
guidance.

### Net-new route

`src/app/venues/[handle]/page.tsx` (410 lines) composes VP1-VP9 with
ISR `revalidate=300` and the SEO contract from the brief:

- Title: `[Venue] - Events & Info - [City] - EventLinqs`
- 155-char description composing city + capacity + venue type +
  venue.description
- og:image (1200x630 venue.image_url) + alt
- twitter:card=summary_large_image
- Schema.org Place JSON-LD with PostalAddress + GeoCoordinates +
  maximumAttendeeCapacity + embedded upcoming Event array

### OP7 wire-up on organiser profile (Batch 8.2 coordination)

Resolves C-B8.2-02. `src/app/organisers/[handle]/page.tsx`
aggregates venues from `upcoming + past` events by venue_name,
orders by event count desc, surfaces top 6 in a SnapRailScroller
with deep links to `/venues/[venueSlugify(name)]`. Hidden when fewer
than 2 distinct venues so we never render a one-tile rail.

## Per-section status (VP1-VP9 + OP7)

| # | Section | Status | Notes |
|---|---------|--------|-------|
| VP1 | Hero (cover + name + city + capacity/type pills + 2 CTAs) | PASS | VenueProfileHero rendering with capacity + venue type pills, View upcoming events + Get directions |
| VP2 | Venue info (description + amenities grid) | PASS | VenueAmenitiesGrid surfacing only fields we have today (capacity, venue type, address); empty fields silently omitted |
| VP3 | Mapbox single-pin map | PASS | CityMap reused with single venue pin + brand styling; hidden when no coords or no token |
| VP4 | Upcoming events rail | PASS | SnapRailScroller w/ Rail Standard v2.0; empty state via CategoryHeroEmpty |
| VP5 | Past events grid | PASS | 12 cards, hidden when none |
| VP6 | Organisers using this venue | PASS | SnapRailScroller w/ OrganiserAvatar tiles, hidden when fewer than 2 |
| VP7 | Event types pills | PASS | Inline pill row, top 6 by count, hidden when fewer than 2 |
| VP8 | Similar venues rail | PASS | SnapRailScroller w/ photographic tiles, sorted by capacity proximity, hidden when fewer than 3 |
| VP9 | Mobile sticky bar | PASS | VenueMobileStickyBar bottom-16 z-50 md:hidden |
| OP7 | Venues organiser uses (Batch 8.2 coordination) | PASS | New venues rail on organiser profile sourced from events.venue_name aggregation, top 6 by count, hidden when fewer than 2 |

## Quality gates (2026-05-09)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS - /venues/[handle] dynamic route added, all other routes preserved |
| `npm test` | PASS (10 files, 105 tests) |

## Visual + SEO verification

`docs/redesign/batch-8.3-evidence/`:

- 6 venue profile screenshots (3 venues × 1440 + 375):
  - Enmore Theatre (typical state, 2 upcoming events, 2 organisers, geocoded)
  - Hordern Pavilion (sparse data, 1 event)
  - Luna Park Big Top (sparse data, 1 event)
- 1 mobile sticky bar capture: `mobile-sticky-bar-enmore-theatre.png`
- 1 SEO verification dump for Enmore Theatre confirming:
  - Title: `Enmore Theatre - Events & Info - Sydney - EventLinqs`
  - Canonical: `/venues/enmore-theatre`
  - og:title + og:description + og:url + og:type
  - twitter:card=summary_large_image
  - Schema.org Place JSON-LD with PostalAddress
    (`118-132 Enmore Rd, Newtown, Sydney NSW Australia`),
    GeoCoordinates (`-33.8979, 151.1747`), and embedded 2-event array
    with full Place + Organization payloads
- 1 OP7 wire-up after capture: `op7-wireup-after-1440.png` showing
  the new "Venues Owambe Sydney uses" rail with 3 venue tiles

Visual spot-check on Enmore Theatre 1440: dark hero with "Venue"
eyebrow, "Enmore Theatre" name, "Sydney" subtitle with map-pin
icon, "Capacity {n}" + "Live music venue" pills, "View upcoming
events" + "Get directions" CTAs. Below: 3-column grid with venue
type + address. Mapbox map with a gold pin centred on Enmore Theatre
coordinates. Upcoming events rail showing Lagos Comedy Tour +
Reggaeton and Bachata. Organisers using Enmore Theatre rail (Lagos
Comedy Tour + Latin Sabor Sydney). Event types pills (Arts &
Culture + Nightlife). Footer.

## Visual consistency with Batches 6-8.2

- Hero proportions match the city / culture / event-detail / organiser
  pattern (full-bleed image + dark gradient + bottom-left content
  stack with 64vh-min-440px on mobile, 55vh on desktop)
- Typography scale matches: text-[2.25rem] H1 mobile, sm:text-4xl,
  lg:text-5xl (per Batch 6.5 polish)
- Brand tokens 100% (no hardcoded hex)
- Media architecture: HeroMedia + CityTileImage + OrganiserAvatar
  (zero raw `<img>`)
- Footer: PageShell global Batch 5.5 4-col compact footer
- Rail patterns match Rail Standard v2.0 (top-right arrows + progress)
- Card patterns: 4:3 / 4:5 portrait + dark gradient + bottom-anchored
  label match across city / culture / venue tiles

## Files modified

```
src/app/venues/[handle]/page.tsx                                     (new)
src/lib/venues/resolver.ts                                           (new)
src/components/features/venues/venue-schema-jsonld.tsx               (new)
src/components/features/venues/venue-profile-hero.tsx                (new)
src/components/features/venues/venue-amenities-grid.tsx              (new)
src/components/features/venues/venue-mobile-sticky-bar.tsx           (new)
src/app/organisers/[handle]/page.tsx                                 (modified - OP7 wireup)

scripts/batch-8-3-references.mjs                                     (new)
scripts/batch-8-3-screenshots.mjs                                    (new)
scripts/batch-8-3-find-venues.mjs                                    (new diagnostic)

docs/redesign/references/venue-profile/{ticketmaster,dice,eventbrite}-{1440,375}.png  (6)
docs/redesign/batch-8.3-evidence/existing-code-audit.md              (audit doc)
docs/redesign/batch-8.3-evidence/venue-{slug}-{1440,375}.png         (6 page captures)
docs/redesign/batch-8.3-evidence/mobile-sticky-bar-{slug}.png        (sticky)
docs/redesign/batch-8.3-evidence/seo-verification-{slug}.txt         (SEO dump)
docs/redesign/batch-8.3-evidence/op7-wireup-after-1440.png           (OP7 verification)
docs/redesign/batch-8.3-closure-report.md                            (this file)
docs/sessions/admin-marketing/progress.log                           (appended)
```

## Coordination handoffs

- **C-B8.3-01:** PM runs Vercel preview Google Rich Results test on
  a sample venue URL (`/venues/enmore-theatre`) to confirm the
  Schema.org Place JSON-LD passes - the local DOM dump confirms all
  required fields are present.
- **C-B8.3-02:** Future-batch reminder - M7 admin panel must surface
  a typed schema for venues (slug, latitude, longitude, venue_type,
  amenities, website, phone, hours). The resolver will pick them up
  automatically when shipped.
- **C-B8.3-03:** Future-batch reminder - the Event detail page
  (Batch 8.1) currently links 'View venue page' as a placeholder
  label. A follow-up commit can wire that link to
  `/venues/${venueSlugify(event.venue_name)}` now that the route
  exists.
- **C-B8.3-04:** Future-batch reminder - similar-venues sort by
  capacity proximity is approximate; M7 admin panel should add
  venue_type-aware similarity (don't show a stadium under a small
  comedy club just because their capacity diff is small).

## [GATE] Batch 8.3 venue profile + OP7 wire-up complete - STOP for review
