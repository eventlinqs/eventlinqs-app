# Batch 6.6 Closure Report - Platform-Wide Rail Consistency

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3 (admin panel + marketing polish)
Status: CODE COMPLETE - STOP for project manager review

## Mission

Founder review of Batch 6.5 evidence flagged two platform-wide rail
design failures:

1. **F1 - Arrow position**: All horizontal rails rendered arrow controls
   at BOTTOM-RIGHT. Industry standard (Ticketmaster, Airbnb, Eventbrite,
   Netflix, Spotify, Amazon Prime Video) is TOP-RIGHT next to the rail
   headline.
2. **F2 - Static rails**: Several rails on city + suburb pages rendered
   as static grids without horizontal scroll capability. The brief
   listed "[City] highlights", "Pick your part of [City]" as the worst
   offenders; the audit found 6 more on city/suburb pages.

Batch 6.6 fixes both, refactors the SnapRail primitive, adopts the new
header pattern across all callers, and locks the contract in
`docs/DESIGN-SYSTEM.md` as Rail Standard v2.0.

## What changed

### SnapRail primitive refactor (`src/components/ui/snap-rail.tsx`)

- Both `SnapRail` (full-chrome) and `SnapRailScroller` now render
  arrows + progress as a single right-aligned cluster on the
  header row, inline with the headline. Progress sits to the LEFT of
  the arrows, fading from gray to brand-gold as the rail scrolls.
- `SnapRailScroller` gains an optional `header={{ eyebrow, title,
  headerLink? }}` prop. When provided, the scroller renders the full
  standard header internally (eyebrow + title + headerLink + controls
  cluster). When omitted (e.g. cultural-picks-rail tabs), the
  scroller falls back to a compact controls strip just above the
  scroll track, so the parent's external h2 still sits above with
  controls right.
- Removed the legacy `controlsOnTop` prop (was unused after migration).
- Replaced the duplicate scroll-track JSX in `SnapRail` and
  `SnapRailScroller` with a shared `<ScrollTrack>` internal component
  so both render identical track markup.
- Hid the optional `headerLink` ("View all") on mobile to keep the
  header row clean at 375; it remains visible from `sm:` up.

### Static-to-rail conversions

All static event grids on city + suburb pages now render through
`SnapRailScroller` with the standard header. EventCards inside rails
are wrapped in `<div className="w-[280px] shrink-0 snap-start">` to
keep them on the rail-card width contract.

| Section | Before | After |
|---------|--------|-------|
| CityLandingPage - This weekend | `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3` | SnapRailScroller (12 events, headerLink to /events filtered) |
| CityLandingPage - This week | same grid | SnapRailScroller |
| CityLandingPage - Popular this month / [City] highlights | `grid lg:grid-cols-4` | SnapRailScroller |
| CityLandingPage - Pick your part of [City] (suburb rail) | `grid grid-cols-2 lg:grid-cols-6` | SnapRailScroller |
| CityLandingPage - Other Australian cities | `grid lg:grid-cols-6` | SnapRailScroller |
| SuburbLandingPage - This week and weekend | grid | SnapRailScroller |
| SuburbLandingPage - Other [city] suburbs | grid | SnapRailScroller |

`All [City] events` and `All [Suburb] events` are intentionally kept
as paginated grids per the brief decision.

### Existing SnapRailScroller callers migrated to internal header

- `CulturesByCityRail` (culture pages cities rail)
- `EventTypesRail` (city pages event-type rail)
- `BrowseByCultureRail` (city pages culture rail)

Each previously rendered its own `<h2>` above the scroller; they now
pass `header={{ eyebrow, title }}` to the scroller and let it own the
header row. Visually identical to the new standard, with the arrows
+ progress top-right inline with the headline.

### Homepage rails

The four homepage rails (`event-rail-section`, `this-week-section`,
`city-rail-section`, `featured-venues-section`) all use `<SnapRail>`
directly. They picked up the new top-right controls automatically via
the SnapRail refactor with no per-caller changes.

## Visual verification

Top-right arrows + progress confirmed via close-up captures:

- City rails: `docs/redesign/batch-6.6-evidence/city-sydney-{by-culture,event-types,popular,by-suburb,related-cities}-rail.png`
- Culture rails: `docs/redesign/batch-6.6-evidence/culture-african-cities-rail.png`
- Suburb rails: `docs/redesign/batch-6.6-evidence/suburb-sydney-inner-west-related-suburbs-rail.png`
- Homepage: `docs/redesign/batch-6.6-evidence/home-this-week-rail.png`

Static-to-rail conversion confirmed: "Pick your part of Sydney" capture
(`city-sydney-by-suburb-rail.png`) shows 5 photographic suburb tiles
arranged horizontally with a fade gradient on the right edge,
indicating the rail extends past the viewport - it was a static
6-up grid before.

Full-page recaptures of key pages (Sydney, Melbourne, African culture,
Homepage) at 1440 + 375 in
`docs/redesign/batch-6.6-evidence/full-{slug}-{1440,375}.png` so
reviewers can confirm the refactor doesn't regress any other section.

## Quality gates (2026-05-09)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS - all routes SSG'd, no regressions |
| `npm test` | PASS (10 files, 105 tests) |

## Documentation updates

`docs/DESIGN-SYSTEM.md` section 6.3 rewritten as **Rail Standard v2.0**.
Defines the locked layout (eyebrow + title left, controls top-right),
control cluster spec (progress + 36px arrows), scroll mechanics, when
NOT to use a rail, and the Batch 6.6 migration audit. This is the
canonical reference for all future rail work.

`docs/redesign/batch-6.6-evidence/rail-audit.md` lists every rail on
the public surface with PASS/FAIL/INTENTIONAL-GRID status.

## Out of scope (per brief)

Admin panel rails (`/admin/*`), dashboard rails (`/dashboard/*`), and
account profile rails (`/account/*`) are NOT audited in this batch.
Listed in `rail-audit.md` for future batch ownership.

Sub-cultures (6-tile grid on culture pages) and Adjacent scenes
(3-tile grid on culture pages) are explicitly kept as grids per the
new standard's "do NOT force a rail when scrolling adds no value"
clause - both fit comfortably in a single desktop viewport at their
canonical column count.

## Files modified

```
src/components/ui/snap-rail.tsx                                       (refactored)
src/components/templates/CityLandingPage.tsx                          (5 grids -> rails)
src/components/templates/SuburbLandingPage.tsx                        (2 grids -> rails)
src/components/features/culture/cities-rail.tsx                       (header migration)
src/components/features/city/event-types-rail.tsx                     (header migration)
src/components/features/city/browse-by-culture-rail.tsx               (header migration)
docs/DESIGN-SYSTEM.md                                                 (Rail Standard v2.0)
docs/redesign/batch-6.6-evidence/rail-audit.md                        (new)
docs/redesign/batch-6.6-closure-report.md                             (this file)
docs/redesign/batch-6.6-evidence/*.png                                (verification captures)
docs/sessions/admin-marketing/progress.log                            (appended)
scripts/batch-6-6-rail-captures.mjs                                   (new)
```

## Coordination handoffs

- **C-B6.6-01:** PM verifies the rail refactor on real iOS Safari +
  Android Chrome - swipe + drag should work the same as before, but
  the visual layout (arrows top-right) is the change reviewers need
  to confirm on physical devices.
- **C-B6.6-02:** PM runs Vercel preview Lighthouse + axe-core on the
  Sydney + Melbourne + African + Homepage URLs to confirm no
  accessibility / performance regression from the refactor.
- **C-B6.6-03:** Future-batch reminder - admin/dashboard/account
  rails (out of scope here) must adopt Rail Standard v2.0 when M7
  ships.

## [GATE] Batch 6.6 platform-wide rail consistency complete - STOP for review
