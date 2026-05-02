# Media Inconsistencies - Violations of the Standard

**Date:** 2026-04-26
**Source:** `docs/MEDIA-AUDIT.md`
**Status to apply standard:** `docs/MEDIA-ARCHITECTURE.md` defines the rules. This document is the **list of every existing violation** that must be remediated in Pre-Task 2 (refactor).

Each violation is tagged with severity:

- **🔴 BLOCKER** - directly causes Lighthouse degradation (NO_LCP, missing dims = CLS, large unoptimized image = LCP slow). Must fix before iter-1 measurement.
- **🟠 HIGH** - measurable score impact (wrong sizes hint, missing fetchPriority on hero, missing lazy on below-fold).
- **🟡 MEDIUM** - consistency / future-proofing (quality tier mismatch, animation timing not centralised).

---

## V1 🔴 BLOCKER - Hero fallback uses SVG poster on `<video>` (NO_LCP root cause)

**File:** `src/lib/images/event-media.ts:148-173` and `src/components/ui/smart-media.tsx:78-104`

**Issue:** When no organiser `video_url` exists and `getCategoryPhoto()` returns the SVG fallback (`/images/event-fallback-hero.svg`), `getFeaturedHeroBackground()` returns:

```ts
{ kind: 'video', src: '/hero/hero-crowd.mp4', poster: '/images/event-fallback-hero.svg' }
```

`SmartMedia` renders this as `<video poster="...svg">`. Lighthouse's LCP detection **excludes SVG elements as LCP candidates**. The video itself doesn't paint until decoded, so the page produces no LCP candidate for the entire trace window → `errorMessage: NO_LCP` → Performance score `null`.

**Fix:** Hero fallback must ship a real raster (AVIF/WebP/JPEG) image. New `HeroMedia` component requires raster `image` prop and refuses to render a video with an SVG poster.

---

## V2 🔴 BLOCKER - `branded-placeholder` kind has no LCP-eligible element

**File:** `src/components/ui/branded-placeholder.tsx:24-52` consumed by `src/components/ui/smart-media.tsx:107-114`

**Issue:** When an event has no cover image and no category photo is available, `getEventMedia` and `getFeaturedEventMedia` return `kind: 'branded-placeholder'`. `SmartMedia` renders only CSS gradients - no `<img>`, no `<video>`, no `<picture>`. There is **no LCP candidate** in the hero region.

**Fix:** Above-fold contexts must never render `branded-placeholder` alone. New `HeroMedia` rejects this kind and falls back to a curated raster crowd image at the boundary.

---

## V3 🔴 BLOCKER - `FeaturedEventHero` slide 0 priority depends on async media resolution

**File:** `src/components/features/events/featured-event-hero.tsx:189` and `src/components/ui/smart-media.tsx:132,158`

**Issue:** Slide 0 only gets `priority=true` if `getFeaturedHeroBackground` returns `kind='still-kenburns'` or `kind='video'`. For carousel and placeholder kinds, the priority flag flows but the rendered element either doesn't qualify for LCP (placeholder) or has the carousel opacity transition layered on (carousel mode).

**Fix:** `HeroMedia` always renders a single, statically-painted raster `<Image priority fetchPriority="high">` as the LCP layer. Carousel rotation, ken-burns transform, and video overlay (if any) sit on top of that layer - they do not replace it.

---

## V4 🟠 HIGH - Carousel image opacity transition on slide 0 in `SmartMedia`

**File:** `src/components/ui/smart-media.tsx:137-140`

**Issue:** Inline style `opacity: i === carouselIndex ? 1 : 0` plus `transition: opacity 900ms ease, transform 4500ms ease` applies to slide 0. While the **initial paint** has opacity 1, the `transform: scale(1.04)` paired with a 4500ms transform transition can disqualify the element from LCP measurement on some Chromium builds (LCP observer skips elements undergoing active transforms in some implementations).

**Fix:** Hero LCP image must paint statically. Ken-burns scale lives on a SECOND layer that mounts after the LCP element has settled, or via a CSS animation that starts only after the first paint commits.

---

## V5 🟠 HIGH - `SmartMedia` default `sizes` is full-viewport, leaks to non-hero usage

**File:** `src/components/ui/smart-media.tsx:48`

```ts
sizes = '(max-width: 768px) 100vw, 1920px'
```

**Issue:** Card/tile contexts that forget to override download a 1920px asset for a 300px tile. Wastes bandwidth, slows LCP for the page that actually needs the 1920px asset (priority budget).

**Fix:** Card components must declare their own `sizes`. New components carry sensible defaults per layout role.

---

## V6 🟠 HIGH - Quality tiers hardcoded per component, not centrally managed

**Files:** `src/components/ui/smart-media.tsx:134,159` (75), `src/components/features/events/event-card.tsx:129` (85), `src/components/features/events/city-rail-tile.tsx:25` (70).

**Issue:** Three separate magic numbers across three components. No way to retune image quality globally without touching N files.

**Fix:** Centralise in `next.config.ts` `qualities` array + `MEDIA_QUALITY` constant exported from `src/components/media/quality.ts`. Components read from the constant.

---

## V7 🟠 HIGH - Raw `<img>` tags miss `loading="lazy"` and `decoding="async"`

**Files:**
- `src/components/dashboard/dashboard-topbar.tsx:99` - avatar (above-fold)
- `src/components/dashboard/upcoming-events-panel.tsx:62` - thumbnail (panel)
- `src/components/features/events/city-tile.tsx:25` - local SVG (rail)
- `src/app/dev/logo-preview/page.tsx:64` - dev only (excluded)

**Issue:** Each uses `eslint-disable-next-line @next/next/no-img-element` and ships raw `<img>` without `loading`, `decoding`, `width`, or `height` attributes. Risks CLS from un-dimensioned images and wastes main thread on synchronous decode.

**Fix:** Migrate to `OrganiserAvatar` (topbar), `EventCardMedia` (upcoming panel), `CityTileImage` (city tile). Each component enforces `loading`, `decoding`, and explicit dimensions.

---

## V8 🟠 HIGH - Above-fold `DashboardTopbar` avatar is unoptimised raw `<img>`

**File:** `src/components/dashboard/dashboard-topbar.tsx:99`

**Issue:** Sticky topbar avatar - visible on first paint of every dashboard route - is a raw `<img src={avatar}>` with no optimisation, no dimensions, no priority, no lazy directive, no fallback if the URL is unreachable.

**Fix:** Replace with `<OrganiserAvatar size="topbar" priority />`.

---

## V9 🟡 MEDIUM - `loading` attribute never explicitly set on `<Image>`

**Files:** all Next `<Image>` callsites (smart-media, event-card, city-rail-tile, live-vibe-marquee).

**Issue:** Next's default behaviour is `loading="lazy"` unless `priority` is set. Relying on default is fine but makes intent ambiguous in code review. New components set `loading` explicitly.

---

## V10 🟡 MEDIUM - Animation timings duplicated across components

**Files:**
- `src/components/ui/smart-media.tsx:139` - `'opacity 900ms ease, transform 4500ms ease'`
- `src/components/features/events/hero-carousel-client.tsx:151` - `transition-opacity duration-700`
- card hover transitions - various

**Issue:** No shared timing variables. Brand-level easing/duration changes require touching many files.

**Fix:** Add `MEDIA_TRANSITIONS` constant in `src/components/media/transitions.ts`. Components import the canonical values.

---

## V11 🟡 MEDIUM - `images.qualities` not declared in `next.config.ts`

**File:** `next.config.ts:26-50`

**Issue:** Next 16 supports a `qualities` array to constrain `quality` prop values at config level. Currently any `quality={N}` is accepted, which means a forgotten `quality={100}` would ship 100% JPEG ungated.

**Fix:** Add `qualities: [70, 75, 85]` in image config; components reference `MEDIA_QUALITY.{rail|standard|hero}`.

---

## V12 🟡 MEDIUM - No `<picture>` element used for art-direction breakpoints

**Status:** acceptable for now - `next/image` `srcSet` covers our cases. Flagged for future when distinct mobile vs desktop crops are needed.

---

## V13 🟡 MEDIUM - `videos.pexels.com` declared in `remotePatterns` but never used

**File:** `next.config.ts:46-48`

**Issue:** Remote pattern allowed but commented out elsewhere ("we deliberately skip Pexels videos" - `event-media.ts:141-144`). Dead config surface.

**Fix:** Remove the unused pattern.

---

## V14 🟡 MEDIUM - `BrandedPlaceholder` uses inline `style={{ backgroundImage: ... }}`

**File:** `src/components/ui/branded-placeholder.tsx:32-37`

**Issue:** Decorative gradient is inline `backgroundImage`. ESLint rule (V-eslint-1) bans `background-image` for **content imagery**, but we must explicitly allow this decorative pattern. Currently no rule distinguishes the two.

**Fix:** ESLint rule scopes the ban to `<div>`/`<section>` elements outside `src/components/media/decorative/` - and `BrandedPlaceholder` either moves to that directory or annotates the decorative intent.

---

## Forbidden patterns (must NOT ship)

The following are banned outright in feature components (ESLint rule will enforce):

1. ❌ `background-image: url(...)` for content imagery (raster photos, organiser uploads, hero backgrounds)
2. ❌ Raw `<img>` for content (only allowed for local SVG with eslint-disable annotation in approved locations)
3. ❌ Above-fold media without `priority` and `fetchPriority="high"`
4. ❌ Above-fold `<Image>` or `<video>` without explicit `width` + `height` (or `fill` with sized parent)
5. ❌ `<video>` element with SVG poster on the LCP path
6. ❌ `kind='branded-placeholder'` rendered as the sole hero LCP element
7. ❌ Opacity transition or `transform: scale()` on the LCP image
8. ❌ Client-only mount (`'use client'` with `useEffect`-mounted `<Image>`) for above-fold media
9. ❌ `loading="lazy"` on a `priority` image (contradiction)
10. ❌ Hardcoded `quality={N}` outside `MEDIA_QUALITY.*` references
11. ❌ Hardcoded `sizes="100vw"` outside `MEDIA_SIZES.*` helpers
12. ❌ `unoptimized={true}` on remote raster images (only allowed for local SVG)

---

## Refactor scope summary (drives Pre-Task 2)

| Violation | Component to migrate | Replacement |
|---|---|---|
| V1, V2, V3, V4 | `FeaturedEventHero` + `SmartMedia` hero usage | `HeroMedia` |
| V5 | `EventBentoTile`, `EventCard`, `LiveVibeMarquee`, `CityRailTile` | `EventCardMedia` / `CityTileImage` |
| V7, V8 | `DashboardTopbar` | `OrganiserAvatar` |
| V7 | `UpcomingEventsPanel` | `EventCardMedia` |
| V7 | `CityTile` | `CityTileImage` |
| V6, V11 | every callsite with magic-number `quality` | `MEDIA_QUALITY` constant |
| V10 | every callsite with inline transition strings | `MEDIA_TRANSITIONS` constant |
| V13 | `next.config.ts` | remove `videos.pexels.com` |
| V14 | `BrandedPlaceholder` | move to `media/decorative/` directory |

Estimated touched files in Pre-Task 2: **~14**.
