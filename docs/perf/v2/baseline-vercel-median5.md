# Phase A baseline (Vercel preview, median-of-5)

Date: 2026-05-02
Preview URL: https://eventlinqs-e030cq2yx-lawals-projects-c20c0be8.vercel.app
Deployment: dpl_5XzVBy2VupAVqyseZXttVXwztvWn (commit 2f523e3)
Branch: feat/sprint1-phase1b-performance-and-visual
Harness: `scripts/perf-median.mjs --runs=5 --routes=/,/events,/about`
Form factor: mobile (Pixel 5 emulation, 375x812 @ DPR 3)
Throttling: simulate (with devtools fallback when Lantern returns NO_LCP)

## Median results

| Route | Perf (median) | LCP | FCP | TBT | SI | CLS | Range | Status |
|---|---|---|---|---|---|---|---|---|
| `/` | 44 (apparent) | 3790ms | 3029ms | 366ms | 4597ms | 0.000063 | 79pts | CONTAMINATED |
| `/events` | 87 | 2821ms | n/a | 343ms | n/a | 0 | 6pts | OK |
| `/about` | 89 (control) | 2238ms | n/a | 277ms | n/a | 0 | 5pts | OK |

`/events` and `/about` are clean. The Vercel preview environment is consistent: 5-6 point Lighthouse ranges across 5 runs.

## `/` route diagnosis: throttling-method dependency

Per-run breakdown on `/`:

| Run | Throttling | Perf | LCP | TBT |
|---|---|---|---|---|
| 1 | devtools | 44 | 4904ms | 4069ms |
| 2 | devtools | null | 4615ms | null |
| 3 | devtools | null | 3790ms | null |
| 4 | simulate | 79 | 3611ms | 366ms |
| 5 | simulate | 76 | 3444ms | 552ms |

When simulate works (runs 4, 5), `/` reports perf 76-79 with TBT 366-552ms. When simulate fails NO_LCP (runs 1-3) and the harness falls back to devtools, devtools crashes and produces null scores or perf 44 with TBT 4069ms.

Root cause: the hero carousel's `HeroCarouselClient` mounts slides 1+ at +1600ms after first paint (per `hero-carousel-client.tsx::otherBgsMounted`). Lantern's optimistic LCP graph sees this as a moving LCP candidate and emits NO_LCP rather than commit to slide 0's image as the LCP element. Without a stable LCP, simulate fails. The script falls back to devtools, which on Vercel preview's CPU has its own pathology (TBT measurement errors).

The "true" baseline for `/` from runs 4 and 5 (simulate only): perf median ~77.5, LCP ~3528ms, TBT ~459ms. Range across simulate-only runs: 3 points.

## Bottleneck per route

### `/` (effective baseline ~77 perf, simulate-only)

LCP 3528ms (simulate runs). FCP not directly captured but ~3029ms (devtools-derived). TBT 366-552ms.

The LCP element is the first slide background image of `featured-event-hero.tsx` (raster image inside `HeroCarouselClient`). The `HeroCarouselClient` is a `'use client'` component that wraps the LCP element. While the slide 0 background DOES appear in initial HTML (server pre-rendered), the rest of the carousel infrastructure hydrates over it on first render, and the deferred slides 1+ mount at +1600ms. Both the carousel hydration and the deferred mount destabilize Lantern's LCP graph.

**Iter 1 target**: lift slide 0 entirely out of the client boundary. `featured-event-hero.tsx` (server) renders `FeaturedHeroStaticShell` (server) as the first child and `HeroCarouselEnhancer` (client sibling) as the second child. The enhancer mounts the full carousel after first paint. Slide 0 of the static shell becomes the unambiguous LCP element with no client component on its render path.

### `/events` (baseline 87 perf)

LCP 2821ms, TBT 343ms. FCP not directly measured.

The LCP element is the first card image in the popular rail (Pexels via `/_next/image`). Per the heromedia-audit, the resource-load-delay is dominated by Pexels cold-encoding (~1060ms). To clear 95, the LCP element either needs (a) a local raster swap analogous to home iter 1, or (b) hydration cost reduction for adjacent components combined with image-optimisation pre-warming.

### `/about` (control, baseline 89 perf)

LCP 2238ms, TBT 277ms. Floor for control across iterations: 87 (89 - 2pt drift allowance).

## Methodology notes

- Vercel preview range is 5-6pts on `/events` and `/about`, vs the local-prod range of 12-31pts measured yesterday. Vercel preview is therefore a viable measurement environment (Mission Rule 4 confirmed).
- `/` route triggers a Lighthouse throttling fallback that contaminates the median. The harness's per-run `throttlingUsed` field correctly identifies this. To get a trustable `/` baseline before iter 1, see "true baseline" above (simulate-only).
- Chrome reaping per run is implemented in `perf-median.mjs::ensureClean`. Bulk taskkill via the script subprocess is safe (no shell stall).

## Output artifacts

- `docs/perf/v2/baseline-vercel-median5.json` raw harness output
- `docs/perf/v2/baseline-vercel-median5.md` (this document)
