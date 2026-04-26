# Media Architecture Audit

**Date:** 2026-04-26
**Branch:** `feat/sprint1-phase1b-performance-and-visual`
**Scope:** Every `<Image>`, `<img>`, `<video>`, `<picture>`, and `background-image` usage across `src/`, plus `next.config.ts`, `tailwind.config.ts`, and `public/`.

This document is the **inventory**. The violations list is in `MEDIA-INCONSISTENCIES.md`. The forward-looking standard is in `MEDIA-ARCHITECTURE.md`.

---

## 1. Inventory by category

### A. Next.js `<Image>` component (10 callsites, 5 distinct components)

| File:Line | Component | Above-fold? | Priority / fetchPriority | Quality | Sizes hint | Notes |
|---|---|---|---|---|---|---|
| `src/components/ui/smart-media.tsx:126` | `SmartMedia` (carousel mode) | depends on caller | conditional `priority && i === 0` | 75 | caller-supplied | Multi-image carousel; only index 0 gets priority |
| `src/components/ui/smart-media.tsx:152` | `SmartMedia` (still-kenburns) | depends on caller | conditional | 75 | caller-supplied | Single Ken Burns image |
| `src/components/features/events/event-card.tsx:129` | `EventCard` | grid context | optional `priority` prop | 85 | `(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw` | Used in card grids |
| `src/components/features/events/city-rail-tile.tsx:25` | `CityRailTile` | below-fold rail | hardcoded `fetchPriority="low"` | 70 | `(min-width: 640px) 280px, 220px` | SVG bypass via `unoptimized` |
| `src/components/features/events/live-vibe-marquee.tsx:171` | `LiveVibeMarquee` | below-fold | none | default | `sizes="280px"` | Conditional on `item.src` |
| `src/app/events/[slug]/page.tsx` | Event detail hero | yes | priority via SmartMedia | inherited | inherited | Routes through SmartMedia |
| `src/components/features/events/event-bento-tile.tsx` | `EventBentoTile` | hero tile yes, others no | size-aware | inherited | size-aware | Best-in-class size hints |

### B. Raw HTML `<img>` tags (4 files)

| File:Line | Component | Reason | Has `loading`? | Above-fold? | Notes |
|---|---|---|---|---|---|
| `src/components/features/events/city-tile.tsx:25` | `CityTile` | local SVG cities | no | rail | `eslint-disable @next/next/no-img-element` |
| `src/components/dashboard/dashboard-topbar.tsx:99` | `DashboardTopbar` avatar | external avatar URL | no | yes (header) | `eslint-disable` |
| `src/components/dashboard/upcoming-events-panel.tsx:62` | `UpcomingEventsPanel` thumb | dashboard panel | no | dashboard above-fold | `eslint-disable` |
| `src/app/dev/logo-preview/page.tsx:64` | dev-only logo previews | local SVGs only | no | dev route only | Excluded from prod |

### C. CSS `background-image` (0 content uses)

| Location | Type | Notes |
|---|---|---|
| `BrandedPlaceholder` (lines 30-35) | decorative gradients | NOT content imagery; gold radial accents on dark gradient |
| `featured-event-hero.tsx` `renderBackground` (lines 78-93) | decorative dark vignette overlay | NOT content imagery; gradient overlay above the LCP image for legibility |

**No raw content imagery uses `background-image`.** All content goes through `<Image>` or `<img>`.

### D. `<video>` elements (1 implementation)

| File:Line | Element | Poster | autoPlay | preload | Notes |
|---|---|---|---|---|---|
| `src/components/ui/smart-media.tsx:92` | `<video>` (kind='video') | `media.poster` (often `/images/event-fallback-hero.svg`) | conditional, disabled in headless | `'auto'` if autoplay else `'none'` | muted, playsInline, loop |
| `public/hero/hero-crowd.mp4` | self-hosted hero video asset | served by SmartMedia when category photo unavailable | — | — | **POSTER IS SVG → CAUSES NO_LCP** |

### E. `<picture>` elements

None. `next/image` srcset generation is used instead.

---

## 2. `next.config.ts` image config

```ts
images: {
  formats: ['image/avif', 'image/webp'],
  deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
  imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  minimumCacheTTL: 60,
  remotePatterns: [
    'gndnldyfudbytbboxesk.supabase.co' (Supabase storage — organiser uploads),
    'picsum.photos' (seed-script placeholder; treated as "no cover" by isRealCover),
    'images.pexels.com' (category hero photos),
    'videos.pexels.com' (declared but deliberately unused — see event-media.ts:141-144),
  ],
}
```

- `qualities` array NOT configured → component-level `quality={N}` props are honoured but not centrally constrained.
- AVIF is preferred, WebP is fallback. No JPEG/PNG fallback registered (browsers without WebP fall back to original format).
- Hostname for Supabase was corrected from Mumbai (`gndnldyfudbytbboxesk` original) to Sydney project ID in commit `1cea327`.

---

## 3. `public/` asset inventory

```
public/
├── cities/
│   ├── lagos.svg
│   ├── london.svg
│   ├── melbourne.svg
│   ├── sydney.svg
│   └── _fallback.svg
├── hero/
│   └── hero-crowd.mp4          ← LCP fallback video (SVG poster — broken)
├── images/
│   ├── event-fallback-hero.svg ← used as video poster (NOT LCP-eligible)
│   └── event-fallback-thumb.svg
├── logos/
│   ├── eventlinqs-concept-a.svg
│   ├── eventlinqs-concept-b.svg
│   └── eventlinqs-concept-c.svg
├── file.svg / globe.svg / next.svg / vercel.svg / window.svg (defaults)
```

**Missing:** No raster (JPEG/WebP/AVIF) hero fallback. Every fallback path terminates in an SVG, which is why `getFeaturedHeroBackground()` produces a video element with an SVG poster — the configuration that triggered NO_LCP in iter-0.

---

## 4. Hero / above-fold LCP candidates

### Homepage `/` (`src/app/page.tsx:208`)
- LCP candidate: slide 0 of `<FeaturedEventHero>` → `SmartMedia` instance.
- Three possible kinds:
  1. `kind='video'` with `<video>` element + `poster` attribute (poster is `/images/event-fallback-hero.svg` in fallback path)
  2. `kind='still-kenburns'` with `<Image priority fetchPriority="high">` (Pexels category photo)
  3. `kind='branded-placeholder'` — pure CSS gradient (NO image element at all)
- `getFeaturedHeroBackground` (event-media.ts:148) priority order:
  1. organiser `video_url`
  2. category Pexels photo (Ken Burns)
  3. **fallback to `/hero/hero-crowd.mp4` with SVG poster** ← NO_LCP path

### Event detail `/events/[slug]`
- LCP candidate: `SmartMedia` with `priority={true}` and `placeholderChromeless={true}`
- Resolved server-side via `getFeaturedEventMedia()` — same fall-through risk

### `/events` listing
- LCP candidate: first `<EventBentoTile>` or `<EventCard>` in grid (depends on layout)

### `/events/[city]`
- Same as `/events`

### Dashboard `/(dashboard)/dashboard`
- LCP candidate: dashboard-topbar avatar (raw `<img>`) or `<DashboardHero>`

---

## 5. Supporting files reviewed

- `src/lib/images/event-media.ts` — orchestrator that picks an `EventMedia` variant per event
- `src/lib/images/category-photo.ts` — Pexels lookup for category fallback (referenced; not opened during audit)
- `src/components/ui/smart-media.tsx` — universal renderer (carousel / kenburns / video / placeholder)
- `src/components/ui/branded-placeholder.tsx` — decorative SVG-free gradient placeholder

---

## 6. Pattern variations in use

- **Quality tiers:** 70 (city rail), 75 (smart-media all kinds), 85 (event-card), default unset (live-vibe). Four distinct hardcodes, no central authority.
- **Sizes hints:** five distinct strategies — full-viewport default in SmartMedia, fixed `280px` in marquee, responsive grid in EventCard, fixed-with-bp in CityRailTile, size-aware in EventBentoTile.
- **Priority assignment:** SmartMedia decides internally based on parent `priority` and slide index; EventCard accepts an explicit prop; CityRailTile hardcodes `fetchPriority="low"`.
- **Lazy loading:** never explicitly set on Next `<Image>` (default lazy except when `priority`); 4 raw `<img>` tags omit `loading="lazy"` entirely.
- **Animation timings:** `opacity 900ms ease, transform 4500ms ease` (carousel), `transition-opacity duration-700` (slide fade), no shared variable.
- **Video posters:** `media.poster` falls back to `/images/event-fallback-hero.svg` — single source of NO_LCP.
- **Headless / audit-mode opt-out:** `document.body.dataset.headless === '1'` checks in SmartMedia disable autoplay and freeze the carousel — needs to be set by Lighthouse runner via `--extra-headers` or page setup script.
