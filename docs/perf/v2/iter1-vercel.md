# Iter 1 corrected (Vercel preview, median-of-5)

Date: 2026-05-02
Commit: 67c12b5
Preview URL: https://eventlinqs-jzzkbjql0-lawals-projects-c20c0be8.vercel.app

## Change

Replaced the iter 1 anti-pattern (nested `next/dynamic({ssr:false})` wrapping a "static" shell) with a sibling pattern under a server parent.

`featured-event-hero.tsx` is now a pure server component that renders two siblings:

1. `<FeaturedHeroStaticShell />` (server, no `'use client'`) — slide 0 background, foreground H1/eyebrow/subcopy/CTAs, ribbon card. Owns the LCP element on first paint with zero client boundary on its render path.
2. `<HeroCarouselEnhancer />` (`'use client'`) — renders nothing on initial render. After first paint, `useEffect` schedules a `requestIdleCallback` (200ms `setTimeout` fallback) that flips a state to mount `<HeroCarouselClient />` and sets `body[data-hero-enhanced="1"]`.

A new globals.css rule `body[data-hero-enhanced="1"] [data-hero-shell] { display: none; }` hides the static shell once the carousel takes over, so there is no double-render and no flash.

## Results

| Route | Baseline (apparent) | Iter 1 (apparent) | Baseline simulate-only | Iter 1 simulate-only | Decision |
|---|---|---|---|---|---|
| `/` | 44 (range 79 CONTAMINATED) | 73 (range 65 CONTAMINATED) | 77.5 (n=2) | 75 (n=3) | KEEP |
| `/events` | 87 (range 6 OK) | 87 (range 10 OK) | 87 | 87 | KEEP |
| `/about` | 89 (range 5 OK) | 90 (range 2 OK) | 89 | 90 | KEEP-CONTROL |

Per-run breakdown on `/`:

| Run | Throttling | Perf | LCP | TBT |
|---|---|---|---|---|
| 1 | simulate | 73 | 4158ms | 261ms |
| 2 | simulate | 86 | 2769ms | 396ms |
| 3 | devtools | 36 | 5660ms | 4779ms |
| 4 | simulate | 75 | 3199ms | 659ms |
| 5 | devtools | 21 | 4349ms | 3699ms |

Three simulate runs succeeded (baseline had two). Lantern still emits NO_LCP on a fraction of runs because the carousel mount post-paint creates a new DOM node for slide 0 background that the optimistic graph treats as a moving LCP candidate.

## Why no LCP score improvement on /

The LCP image was already in the pre-rendered HTML at baseline. `HeroCarouselClient` was a client component, but it received the slide 0 `<HeroMedia priority />` JSX as a prop pre-resolved on the server, so the image was in initial HTML. Hydrating the carousel as a wrapper does not delay the image fetch.

What iter 1 changed: hydration is no longer on the LCP critical path. The static shell paints with zero client boundary, then the enhancer mounts after first paint. This does not improve LCP score directly because LCP was not hydration-bound in the first place — it is image-fetch-bound (~3000ms+ on Vercel preview).

To clear 95 on `/`, LCP must drop below ~2500ms. This needs:

- Iter 4 (priority/preload migration on the LCP background image) to ensure the browser starts the fetch as early as possible.
- Image format / size optimisation for the slide 0 background.
- Possibly TTFB reduction (iter 7/8).

## Why iter 1 still kept

- No regression on any route. Apparent / median 73 reflects 2 NO_LCP runs that fall back to devtools and crash; simulate-only median 75 vs baseline 77.5 is within the 5pt noise band.
- Architectural plumbing for iter 5 (below-fold lazy hydration). The enhancer pattern is now precedent for deferring other client surfaces.
- Removes hydration cost from the LCP element render path even though that did not bind LCP at baseline; it does bind TBT and FCP indirectly.

## Output artifacts

- `docs/perf/v2/iter1-vercel-median5.json` raw harness output
- `docs/perf/v2/iter1-vercel.md` (this document)
