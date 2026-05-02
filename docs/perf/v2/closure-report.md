# Mobile 95+ v2 closure report

Date: 2026-05-02
Branch: `feat/sprint1-phase1b-performance-and-visual`
Final commit before closure: `32c5f0e` (iter 8) plus this report.

## Mission outcome

Mission gate: median Lighthouse Performance >= 95 mobile on `/` AND `/events` on Vercel preview, control route `/about` not drifting below floor (87).

| Route | Vercel baseline | Final (iter 8) | Gap to 95 | Gate met |
|---|---|---|---|---|
| `/` | 44 apparent / 77 simulate-only n=2 | 74 apparent / 74 simulate-only n=1 | 21 (apparent) / 16 (best simulate at iter 3, 79) | NO |
| `/events` | 87 | 84 | 11 | NO |
| `/about` | 89 | 87 | floor exactly | KEPT (at floor) |

Phase C 13-route verification was gated on both `/` and `/events` reaching 95+. Gate not met. Phase C not run.

## What moved

### `/events`

LCP improvement is real and monotonic across iterations:

| Iter | Change | LCP median (ms) | Delta |
|---|---|---|---|
| Baseline | none | 2821 | - |
| 1 | sibling enhancer | 2584 | -237 |
| 3 | 375 deviceSize + q=80 | 2560 | -24 |
| 7 | parallel categories+events fetch | 2317 | -243 |
| 8 | minimumCacheTTL 1 year | 2240 | -77 |

LCP target (<2500ms for the 95 gate) is met at iter 7. Net LCP delta over 8 iters: -581ms (-21%).

Why the score still sits at 84 instead of 95: TBT rose from 343ms baseline to 562ms at iter 8 (+219ms, +64%). The TBT delta is environmental — the same drift appears on untouched `/about` (277ms baseline -> 470ms iter 8) and on untouched `/` simulate runs across the same windows. Vercel preview deployments share build infrastructure that is observably noisier as the day progresses; iter 7 and iter 8 ran late in the measurement window. The LCP work was the right work. TBT is not iter-specific.

### `/`

LCP improvement is partial and Lantern-unstable:

| Iter | Change | Apparent median | Simulate median (n captured) |
|---|---|---|---|
| Baseline | none | 44 | 77 (n=2) |
| 1 | sibling enhancer | 73 | 75 (n=3) |
| 3 | 375 deviceSize + q=80 | 76 | 79 (n=3) |
| 7 | parallel fetch | 76 | 76 (n=1) |
| 8 | edge cache TTL | 0 | 74 (n=1) |

The apparent median climbs from 44 to 76 because iter 1 and iter 3 reduced the rate of NO_LCP fallback (from 3/5 to 2/5 to 0-1/5). Iter 7 and iter 8 fell back into NO_LCP storms (4/5 devtools), most likely because of environmental TBT drift causing the optimistic LCP graph to time out. Best simulate read across the run: iter 3 at 79.

The hero carousel's post-paint enhancer mount (introduced at iter 1) creates a moving DOM node for slide 0's background that Lantern's optimistic graph still treats as a candidate. Even with the static shell painted first under a server boundary, the enhancer hand-off destabilises the simulate graph just enough to push some runs into NO_LCP fallback.

## What did not move

### `/` LCP image fetch is the unresolved blocker

The LCP element is the slide 0 background (`HeroMedia` priority raster). With iter 3 emitting a 375w AVIF variant and iter 4 confirmed `<link rel="preload" as="image" imageSrcSet=... fetchPriority="high">` is at position 3 in `<head>`, browser-side fetch is already as early as Next.js can make it.

What still costs ~3000ms on the preview deployment:
1. Cold-encoding penalty on `/_next/image` for the 375w AVIF variant on first hit per deployment URL (each preview gets its own cache namespace).
2. The carousel enhancer's `requestIdleCallback` re-mount of slide 0 within the carousel viewport, which post-LCP work but adds graph instability.
3. TLS handshake + Vercel cold function on the underlying source fetch from `gndnldyfudbytbboxesk.supabase.co` storage on first variant generation.

The first item dominates. Production traffic warms the variant once and subsequent visits hit the edge cache immediately. Lighthouse CI on a fresh preview deployment will always pay this penalty.

### TBT on `/events`

`/events` has 562ms TBT vs ~250ms needed for the 95 gate. Below-fold lazy hydration (iter 5, deferred) was the planned fix. It was deferred because LCP was the binding constraint on `/`. With `/events` LCP now <2500ms at iter 8, TBT is the new binding constraint and below-fold lazy hydration becomes the next iteration's work.

## Iteration ledger

- Iter 1: KEEP. Sibling enhancer pattern. Server static shell owns LCP; client enhancer mounts after first paint via `requestIdleCallback`. Removes hydration cost from LCP critical path. Necessary plumbing for any future lazy-hydrate work on `/`.
- Iter 2: NO-OP. `'use client'` audit found no vestigial directives.
- Iter 3: KEEP. `next.config.ts` images: 375 deviceSize, 80 quality. Mobile gets a properly-sized variant; quality no longer silently downgraded.
- Iter 4: NO-OP. Browser preload tag already auto-emitted by `next/image priority`. Nothing to migrate.
- Iter 5: DEFERRED. Below-fold lazy hydration. Reason: LCP was the binding constraint at the time and below-fold work would not move LCP. Now the binding constraint on `/events` per iter 8.
- Iter 6: NO-OP. Critical CSS inlining. Tailwind chunk is already 10kB gzipped, immutable, 1-year cached. Inlining would duplicate it into every HTML response and forfeit cache.
- Iter 7: KEEP. `Promise.all([fetchActiveCategoriesCached(), fetchPublicEventsCached()])` on `/events`. Server-side parallelisation; cannot regress client TBT.
- Iter 8: KEEP-WITH-CAVEAT. `images.minimumCacheTTL` 60s -> 1 year. Image-optimiser config; takes effect once a variant is warm on the edge. Production wins; preview cold-cache does not.

## Architectural blockers documented

To clear 95 on `/` (LCP <2500ms), one of these is needed:
1. Pre-generated AVIF static assets bypassing `/_next/image` entirely for the slide 0 hero (commit a baked-out `/public/hero/slide0-{375,640,...}.avif` set, render via `next/image unoptimized` on the LCP path). Trades build-time CI complexity for zero cold-cache penalty.
2. Eliminate the carousel from `/` entirely on mobile breakpoints — render only the static shell on mobile, ship the carousel as a desktop-only experience. Not a small product decision.
3. Accept that Lighthouse CI on cold preview deployments will not match production scores, run mission verification on a warmed deployment, and switch the gating measurement environment to production after a soak period.

To clear 95 on `/events` (TBT <300ms), the path is:
1. Below-fold lazy hydration (iter 5 deferred). `IntersectionObserver` gated mounts on `EventsPopularSection`, `EventsGrid` rows below the second viewport, and the filter bar's category drawer. Concretely: `m5-events-grid.tsx` and `m5-events-popular-section.tsx` are client components today; convert them to enhancer-pattern siblings the way `featured-event-hero` was at iter 1.

## Methodology notes

- Median-of-5 with `scripts/perf-median.mjs`, Vercel preview as primary measurement environment.
- Lantern simulate is the trusted throttling method; devtools fallback is treated as contamination and downweighted.
- Range >20pts is flagged contaminated. Multi-pt deltas across runs of untouched routes are treated as environmental noise, not iter-specific regressions.
- One change per iteration. No batched changes.
- Baseline measurements at commit `2f523e3`. Iteration measurements at commits referenced per progress.log.

## Output artifacts

- `docs/perf/v2/baseline-vercel-median5.{json,md}` (commit 2f52914)
- `docs/perf/v2/iter1-vercel-median5.json` (commit 4d3112a) and `iter1-vercel.md`
- `docs/perf/v2/iter3-vercel-median5.json` (commit 7cd6fcb)
- `docs/perf/v2/iter7-vercel-median5.json` (commit f8d6fe2)
- `docs/perf/v2/iter8-vercel-median5.json` (this commit)
- `docs/perf/v2/progress.log` (full ledger)
- `docs/perf/v2/closure-report.md` (this document)
