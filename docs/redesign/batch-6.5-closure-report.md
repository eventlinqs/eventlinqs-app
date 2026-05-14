# Batch 6.5 Closure Report - Critical Fixes to Batch 6

Date: 2026-05-08
Branch: redesign/world-class-rebuild-2026-05-03
Author: Session 3 (admin panel + marketing polish)
Status: CODE COMPLETE - STOP for project manager review

## Mission

Founder review of Batch 6 evidence flagged 4 critical failures across
all 20 city pages and 24 suburb pages. The Batch 6 checklist had marked
all 44 pages PASS without per-page visual verification - a real
accountability failure on my part. Batch 6.5 fixes the four root causes
and replaces the original checklist with one that names a specific
screenshot for every PASS claim.

## Failures fixed

### F1 - Mapbox map renders blank

**Root cause** (verified via DOM inspection): the inner Mapbox container
used `position: absolute; inset: 0`. Despite the wrapper having
`h-[400px] sm:h-[500px]`, the absolute child collapsed to height 0 in
the actual layout. The Mapbox `mapboxgl-map` element measured `h: 0,
w: 1214` on /city/sydney @ 1440. The map appeared as an empty white
box on every city page.

**Fix** in `src/components/features/city/city-map.tsx`:
- Replaced `<div className="absolute inset-0">` with explicit
  `h-[400px] w-full sm:h-[500px]` directly on the Mapbox container.
- Added `requestAnimationFrame(() => map.resize())` after map load to
  guarantee Mapbox picks up the final container dimensions.
- Loading skeleton is now `pointer-events-none absolute inset-0` so it
  overlays the map during init without intercepting interactions.

**Visual verification**: 4 fresh captures showing the rendered Mapbox
with brand-styled base + gold event pins + suburb polygon overlays:
- `docs/redesign/batch-6.5-evidence/sydney-mapbox-fixed-1440.png`
- `docs/redesign/batch-6.5-evidence/melbourne-mapbox-fixed-1440.png`
- `docs/redesign/batch-6.5-evidence/brisbane-mapbox-fixed-1440.png`
- `docs/redesign/batch-6.5-evidence/perth-mapbox-fixed-1440.png`

### F2 - Suburb tiles render as black placeholders

**Root cause**: the S5 "Browse by Culture" section had been wired as a
duplicate suburb rail using `<CulturesByCityRail>` with suburb names
as the `cities` array and `suburbImages` (keyed by full suburb slug
like `sydney-inner-west`) as the `images` map. Inside that rail, the
slug was computed via `citySlugify(name)` which produces `inner-west`,
missing the lookup. Every tile fell back to the navy-gradient
placeholder. The S9 "By Suburb" rail was meanwhile working correctly.

**Fix**:
- New component `src/components/features/city/browse-by-culture-rail.tsx`
  rendering 14 photographic culture tiles per the Batch 6 spec, each
  routing to the `/culture/[culture]/[citySlug]` intersection page.
- `CityLandingPage.tsx` swaps S5 to use the new rail. The S9 By Suburb
  rail stays unchanged.
- `app/city/[slug]/page.tsx` fetches culture hero photos in parallel
  with the existing image fetches and threads them through as
  `cultureImages`.

**Visual verification**:
- 4 culture-rail captures: `docs/redesign/batch-6.5-evidence/{sydney,melbourne,brisbane,perth}-culture-rail-fixed-1440.png`
- 7 By-Suburb-rail captures: `docs/redesign/batch-6.5-evidence/{sydney,melbourne,brisbane,perth,gold-coast,canberra,hobart}-suburbs-fixed-1440.png`

### F3 - Mobile yellow strip overflow

**Root cause**: the global mobile-menu sheet
(`src/components/layout/site-header-client.tsx`) uses
`position: fixed; right: 0; transform: translateX(100%)` so it sits
offscreen when closed. In Chromium, when html/body don't clip
horizontally, fixed-positioned elements past the viewport extend
`document.documentElement.scrollWidth`. Playwright `fullPage` capture
uses that scrollWidth, giving a 441px-wide screenshot at a 375px
viewport. The extra 66px on the right exposed fragments of the
offscreen drawer (gold buttons, etc), reading as a yellow vertical
strip in the original Batch 6 screenshots.

**Diagnostic** (`scripts/b65-check-overflow.mjs`):
- Before: `docW=441, bodyW=441, htmlOverflowX=visible`
- After:  `docW=375, bodyW=441, htmlOverflowX=clip`

**Fix** in `src/app/globals.css`: added `overflow-x: clip` to BOTH
`html` and `body`. Body alone is insufficient because html is the
actual scrolling container in modern Chromium. `clip` is preferred
over `hidden` because it preserves `position: sticky` behaviour.

**Visual verification**:
- `docs/redesign/batch-6.5-evidence/sydney-mobile-fixed-375.png`
- `docs/redesign/batch-6.5-evidence/melbourne-mobile-fixed-375.png`
- `docs/redesign/batch-6.5-evidence/toowoomba-mobile-fixed-375.png`

### F4 - Mobile design polish vs Ticketmaster

**Root cause**: CityHero used `text-3xl` H1 on mobile with tight `mt-3`
spacing and `h-11` CTAs. CityEditorialSection used `text-sm` body.
MobileStickyBar used 64px height with `text-sm` label. All functional
but visibly less weight than Ticketmaster's mobile city guide pattern.

**Fixes** to match the Ticketmaster mobile quality bar:
- `CityHero`: hero `64vh min-h-[440px] max-h-[560px]` mobile, `52vh`
  desktop. H1 from `text-3xl` to `text-[2.25rem]` mobile,
  `leading-[1.02]` for tighter weight. Subtitle `text-[15px]
  leading-relaxed` (was text-sm). CTAs full-width stacked on mobile
  (h-12 = 48px touch target) with inline pill row on desktop.
- `CityEditorialSection`: heading `text-[1.75rem] leading-[1.15]`
  mobile, body `text-[15px] leading-[1.7]`. More breathing room
  (mt-5 instead of mt-4 between heading and body).
- `MobileStickyBar`: `h-[60px]` (was 64). Label `text-[15px]
  tracking-tight` bold (was text-sm). Subtitle `text-[11px]` (was 10).

**Visual verification**:
- Sydney mobile full-page after fix: `docs/redesign/batch-6.5-evidence/sydney-mobile-fixed-375.png`
- Sticky bar in scroll position: `docs/redesign/batch-6.5-evidence/sydney-mobile-sticky-bar-375.png`
- 88 page captures (40 cities + 48 suburbs) re-baselined at
  `docs/redesign/batch-6-evidence/after/`.

## Quality gates (2026-05-08)

| Gate | Result |
|------|--------|
| `npm run lint --max-warnings=0` | PASS (0 warnings) |
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS - all routes SSG'd, no regressions |
| `npm test` | PASS (10 files, 105 tests) |

## Per-fix component / file inventory

```
Modified:
  src/components/features/city/city-map.tsx          (F1: explicit container dims + resize)
  src/components/features/city/city-hero.tsx         (F4: bigger mobile hero + stacked CTAs)
  src/components/features/city/city-editorial-section.tsx  (F4: bigger heading + body)
  src/components/features/city/mobile-sticky-bar.tsx (F4: refined sizing)
  src/components/templates/CityLandingPage.tsx       (F2: swap to BrowseByCultureRail, drop suburbCityRailNames)
  src/app/city/[slug]/page.tsx                       (F2: fetch culture hero photos, thread cultureImages)
  src/app/globals.css                                (F3: overflow-x: clip on html + body)

New:
  src/components/features/city/browse-by-culture-rail.tsx  (F2: 14 photographic culture tiles, routes to /culture/[culture]/[city])
  scripts/batch-6-5-diagnose.mjs                     (F1+F2+F3 diagnostic script)
  scripts/batch-6-5-verify-fixes.mjs                 (verification capture script)
  scripts/b65-check-overflow.mjs                     (F3 overflow diagnostic)
```

## Honest accountability note

The original Batch 6 checklist marked all 44 pages PASS without per-page
visual verification. That was a real failure - the founder's review
caught 4 distinct, page-wide problems that a single visual sweep would
have caught. Going forward:

- "PASS" is reserved for sections where I can name a specific
  screenshot AND describe what I see in it.
- Mass screenshot scripts must be followed by a manual sweep where
  each capture is at least sampled visually.
- Self-judgment without a referenced screenshot is forbidden.

The Batch 6 checklist (`docs/redesign/batch-6-evidence/checklist.md`)
has been rewritten under this contract. Every PASS row in the new
checklist names either a specific screenshot path or a verified shared
component.

## Coordination handoffs

- **C-B6.5-01:** Founder runs Vercel preview Lighthouse median-of-5
  mobile + axe-core 0 on the 8 Tier 1 cities per CLAUDE.md "no
  localhost performance measurements" rule. Confirm Mapbox renders
  on real devices (the brand-recolor + gold pins are visible in
  Playwright headless WebGL but should be re-checked on iOS Safari +
  Android Chrome which can have WebGL quirks).
- **C-B6.5-02:** PM verifies the mobile sticky CTA bar appears above
  the global BottomNav on real iPhone + Android, with safe-area-inset
  padding handled correctly on iPhone X+ notch.
- **C-B6.5-03:** PM verifies `overflow-x: clip` on html + body
  doesn't break any existing surface. The Batch 5.6 culture pages,
  homepage, and /events have horizontal scroll-snap rails that should
  still work the same way (confirmed locally).

## [GATE] Batch 6.5 fixes complete - STOP for project manager review
