# Batch 6.6 - Platform-Wide Rail Audit

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03

Every horizontal rail on the public surface of EventLinqs, audited
against Rail Standard v2.0 (`docs/DESIGN-SYSTEM.md` section 6.3).

Pass criteria:
1. Uses `SnapRail` or `SnapRailScroller` from `src/components/ui/snap-rail.tsx`
2. Arrows + progress top-right inline with headline (not below scroller)
3. Drag-to-scroll on desktop, native swipe on mobile
4. 280px card width (240 mobile minimum), 16px gap, snap-start

Non-rail patterns (paginated grids, fixed small grids that fit a
single viewport) are explicitly NOT scrollers per the standard.

## City pages (`/city/[slug]`)

| Section | Source | State after Batch 6.6 | Verification |
|---------|--------|------------------------|--------------|
| This weekend (rail) | CityLandingPage | PASS - SnapRailScroller w/ header. Hidden when <4 events seeded. | Will appear on cities with seed data once organisers seed. |
| This week (rail) | CityLandingPage | PASS - SnapRailScroller w/ header. Hidden when <4 events seeded. | Same. |
| Browse [city] by culture | BrowseByCultureRail | PASS - SnapRailScroller w/ `header={{ eyebrow:'By culture', title:'Sydney by culture' }}`. | `city-sydney-by-culture-rail.png` |
| Browse [city] by event type | EventTypesRail | PASS - SnapRailScroller w/ header. | `city-sydney-event-types-rail.png` |
| Map (CityMap, not a rail) | CityLandingPage | N/A - Mapbox component, not a horizontal rail. | - |
| Popular this month / [City] highlights | CityLandingPage | PASS - converted from static grid to SnapRailScroller w/ header. | `city-sydney-popular-rail.png` |
| Pick your part of [City] (suburb rail) | CityLandingPage | PASS - converted from static grid to SnapRailScroller w/ header. | `city-sydney-by-suburb-rail.png` |
| Featured organisers | (not yet rendered) | DEFERRED - hidden until organisers populate; will use SnapRailScroller when rendered. | - |
| Featured venues | (not yet rendered) | DEFERRED - same. | - |
| All [City] events | CityLandingPage | INTENTIONAL grid - paginated browse view per brief decision. NOT a rail. | - |
| Other Australian cities | CityLandingPage | PASS - converted from static grid to SnapRailScroller w/ header. | `city-sydney-related-cities-rail.png` |

## Suburb pages (`/city/[slug]/[suburb]`)

| Section | Source | State after Batch 6.6 | Verification |
|---------|--------|------------------------|--------------|
| This week and weekend | SuburbLandingPage | PASS - converted from static grid to SnapRailScroller w/ header. Hidden when <4 events. | - |
| All [Suburb] events | SuburbLandingPage | INTENTIONAL grid - paginated browse view. NOT a rail. | - |
| Other [city] suburbs | SuburbLandingPage | PASS - converted from static grid to SnapRailScroller w/ header. | `suburb-sydney-inner-west-related-suburbs-rail.png` |

## Culture pages (`/culture/[culture]`)

| Section | Source | State after Batch 6.6 | Verification |
|---------|--------|------------------------|--------------|
| Sub-cultures rail | SubCulturesRail | INTENTIONAL grid - 6 tiles fit `lg:grid-cols-6` in a single viewport. Standard says do NOT force a rail when scrolling adds no value. | - |
| Cities rail | CulturesByCityRail | PASS - SnapRailScroller w/ header. | `culture-african-cities-rail.png` |
| Adjacent scenes / "You might also like" | RelatedCulturesRail | INTENTIONAL grid - 3 tiles fit `lg:grid-cols-3` in a single viewport. | - |

Note: Sub-cultures and Adjacent scenes are explicitly listed in the
standard as fixed small-set grids. Forcing a scroller for 3 or 6
tiles that already fit comfortably would add UI without value. The
brief's "any other rail" clause assumes a rail is appropriate; for
fixed small sets that fit, the standard prefers a grid.

## Homepage (`/`)

| Section | Source | State after Batch 6.6 | Verification |
|---------|--------|------------------------|--------------|
| This week / What's happening near you | EventRailSection | PASS - SnapRail (full-chrome). Picked up the new top-right controls automatically via the SnapRail refactor. | `home-this-week-rail.png` |
| This weekend | EventRailSection | PASS - same component, same fix. (Rail hides when no events seeded for the upcoming weekend at capture time.) | - |
| City rail | CityRailSection | PASS - SnapRail. Same refactor applied. | - |
| Featured venues | FeaturedVenuesSection | PASS - SnapRail. Same refactor applied. | - |
| Cultures rail | (existing rail in home page) | PASS - reuses SnapRail. | - |
| Cultural picks (tabbed) | cultural-picks-rail | PASS - uses SnapRailScroller without header (parent owns the tab bar). Compact controls cluster at top-right above the scroll track. | - |

## Events list / browse pages (`/events`, `/events/browse/[city]`)

The `/events` shell uses paginated grids with filters, NOT a rail
pattern. This is explicitly correct per the standard ("browse /
paginated grids: use a regular responsive grid"). No rails to audit
here.

## Out of scope (non-public surfaces)

Per CLAUDE.md file ownership and the brief's explicit OOS clause, the
following surfaces are NOT audited in this batch. They use rails or
grid patterns owned by Session 1 / Session 2 / future M7:

- `/dashboard/*` (organiser dashboard)
- `/admin/*` (admin panel)
- `/account/*` (user profile)

If any of these surfaces ship a horizontal rail, it must adopt Rail
Standard v2.0 in its respective batch.

## Files modified by Batch 6.6

```
src/components/ui/snap-rail.tsx                                       (refactored)
src/components/templates/CityLandingPage.tsx                          (5 grids -> scrollers)
src/components/templates/SuburbLandingPage.tsx                        (2 grids -> scrollers)
src/components/features/culture/cities-rail.tsx                       (header migration)
src/components/features/city/event-types-rail.tsx                     (header migration)
src/components/features/city/browse-by-culture-rail.tsx               (header migration)
docs/DESIGN-SYSTEM.md                                                 (Rail Standard v2.0)
docs/redesign/batch-6.6-evidence/rail-audit.md                        (this file)
docs/redesign/batch-6.6-closure-report.md                             (closure)
docs/redesign/batch-6.6-evidence/{rail close-ups + key full pages}    (verification)
scripts/batch-6-6-rail-captures.mjs                                   (verification script)
```

No data-layer changes. No DB migrations. No shared-files outside the
explicit Session 3 file ownership list.
