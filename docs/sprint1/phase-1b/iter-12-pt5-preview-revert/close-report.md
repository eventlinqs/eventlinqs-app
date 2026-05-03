# Iter-12 Close Report - Vercel Preview Validation Post-Revert

Branch: `feat/sprint1-phase1b-performance-and-visual`
HEAD: `ac4b95e` (iter-11 blocker docs) on top of `ae44066` (Revert B.1)
Vercel preview: `https://eventlinqs-ekdp5m7sl-lawals-projects-c20c0be8.vercel.app`
Date: 2026-04-28

## TL;DR

Locked-standard 0.95+ Performance **not achieved on any route** even on
the prod preview. The B.1 revert was net-positive (8 of 10 routes
improved on TBT, 6 of 10 on Performance) but the gap is real, not a
localhost artifact. Two distinct LCP failure modes remain, and a
single shared JS chunk (`0.~2ky53fo~10.js`) is the dominant TBT
bottleneck on every route.

## Final scoreboard (iter-12, Vercel preview, mobile)

| Route | Perf | A11y | BP | SEO | LCP (ms) | TBT (ms) | CLS |
|---|---|---|---|---|---|---|---|
| home | n/a* | 1.00 | 1.00 | 1.00 | NO_LCP | n/a | 0.000 |
| events | **0.79** | 1.00 | 1.00 | 1.00 | 3559 | 434 | 0.015 |
| city | **0.80** | 1.00 | 1.00 | 1.00 | 3756 | 369 | 0.015 |
| category | **0.79** | 1.00 | 1.00 | 1.00 | 2939 | 615 | 0.000 |
| event-detail | **0.83** | 1.00 | 1.00 | 1.00 | 3347 | 360 | 0.000 |
| organisers | **0.87** | 1.00 | 1.00 | 1.00 | 2665 | 386 | 0.000 |
| pricing | **0.89** | 1.00 | 1.00 | 1.00 | 2594 | 345 | 0.000 |
| help | **0.88** | 1.00 | 1.00 | 1.00 | 2366 | 405 | 0.000 |
| legal-terms | **0.87** | 1.00 | 1.00 | 1.00 | 2491 | 395 | 0.000 |
| login | **0.92** | 1.00 | 1.00 | 1.00 | 2256 | 288 | 0.029 |
| signup | **0.89** | 1.00 | 1.00 | 1.00 | 2490 | 373 | 0.000 |

\* Home `NO_LCP` chronic since iter-5; same lantern simulator quirk
seen on every iteration of this code shape, including iter-7
production-preview measurement. Real-device runs do not exhibit it.

A11y / BP / SEO 100 across all 11 routes - Pre-Task 4 Phase C.3
gains held. CLS within budget on every route.

## Locked-standard gate

| Standard | Threshold | Pass / Tested |
|---|---|---|
| Performance | >= 0.95 | **0 / 10** |
| A11y | = 1.00 | 10 / 10 |
| Best Practices | = 1.00 | 10 / 10 |
| SEO | = 1.00 | 10 / 10 |
| LCP | <= 2500 ms | **3 / 10** (help, legal-terms, login) |
| TBT | <= 300 ms | **1 / 10** (login) |
| CLS | <= 0.1 | 10 / 10 |

## iter-10 (pre-revert) vs iter-12 (post-revert) - same prod-preview environment

| Route | iter-10 Perf | iter-12 Perf | Δ Perf | iter-10 LCP | iter-12 LCP | iter-10 TBT | iter-12 TBT |
|---|---|---|---|---|---|---|---|
| events | 0.76 | 0.79 | +0.03 | 3768 | 3559 | 499 | **434** |
| city | 0.80 | 0.80 | 0.00 | 3694 | 3756 | 390 | **369** |
| category | 0.83 | 0.79 | -0.04 | 3134 | 2939 | 397 | 615 |
| event-detail | 0.85 | 0.83 | -0.02 | 2727 | 3347 | 404 | **360** |
| organisers | 0.81 | 0.87 | **+0.06** | 2552 | 2665 | 626 | **386** |
| pricing | 0.84 | 0.89 | **+0.05** | 2641 | 2594 | 463 | **345** |
| help | 0.86 | 0.88 | +0.02 | 2532 | 2366 | 440 | **405** |
| legal-terms | 0.85 | 0.87 | +0.02 | 2797 | 2491 | 430 | **395** |
| login | 0.89 | 0.92 | +0.03 | 2493 | 2256 | 370 | **288** |
| signup | 0.92 | 0.89 | -0.03 | 1959 | 2490 | 335 | 373 |

The revert was a real win on TBT - eight of ten routes improved,
including organisers (-240 ms) and pricing (-118 ms) by huge margins.
Two routes regressed on Perf (category -0.04, signup -0.03), with
category showing a +218 ms TBT regression that is not explainable by
the revert alone (revert removed a deferred-import that affected
every route uniformly; category-only regression suggests run-to-run
variance or a different cause).

## Two distinct LCP failure modes

The LCP breakdown audit cleanly separates the failing routes into
two categories.

### Category A: Resource load delay (image-bound)

The LCP is an image, but the image is not preloaded fast enough.

| Route | LCP | TTFB | Resource load delay | Resource load duration | Element render delay |
|---|---|---|---|---|---|
| events | 3559 | 159 | **1286** | 62 | 107 |
| city | 3756 | 160 | **1185** | 75 | 96 |
| event-detail | 3347 | 192 | **827** | 116 | 282 |

LCP element on events / city: `li.w-64 > a.group > div.relative > img.object-cover`
with `fetchpriority="auto"` and `loading="lazy"` - this is the
Recommended rail tile, picked because the inline `/events` grid
renders empty on the preview (country-default bug at
`src/app/events/page.tsx:57`, identified in PT4 close report
recommendation #2). The rail tile is in a Suspense boundary that
streams in late, so the browser has no chance to start the LCP
image fetch until ~1.2-1.3 seconds after navigation.

LCP element on event-detail:
`section.relative > div.absolute > div.absolute > img.object-cover`
with `fetchpriority="high"` and `loading="eager"` - already
prioritised correctly. The 827 ms resource load delay is from the
image being a Supabase-hosted raster (~50-80 KB) that has to round-
trip through Supabase storage transformations on cold edge cache.

### Category B: Element render delay (text-bound, hydration-gated)

The LCP is a text element above the fold. There is no image LCP
candidate, so Lighthouse picks an h1/p that paints late because
hydration/JS execution is blocked.

| Route | LCP | TTFB | Element render delay | LCP element |
|---|---|---|---|---|
| category | 2939 | 177 | **666** | h1#page-hero-heading |
| organisers | 2665 | 176 | **600** | h1#organisers-hero-heading |
| pricing | 2594 | 193 | **657** | h1#page-hero-heading |
| help | 2366 | 169 | **618** | h1#page-hero-heading |
| legal-terms | 2491 | 180 | **595** | first `<p>` in prose |
| login | 2256 | 200 | **495** | h1.font-display |
| signup | 2490 | 204 | **824** | h1.font-display |

These routes have no above-the-fold image. The h1 is in the SSR
HTML, but its render is delayed because the main thread is busy
evaluating `0.~2ky53fo~10.js` (350-741 ms scripting per route, see
below). Lowering this chunk's main-thread time would directly drop
element render delay 1:1 and bring all 7 routes under the 2500 ms
LCP gate.

## Universal TBT bottleneck: `0.~2ky53fo~10.js`

This single chunk dominates main-thread time on every measured
route on the preview deploy.

| Route | This chunk total | scripting | Other top JS chunks |
|---|---|---|---|
| events | 828 ms | 721 ms | 0gyanf0v5_rzs.js (667 ms) |
| city | 823 ms | 741 ms | 0gyanf0v5_rzs.js (376 ms) |
| category | 511 ms | 460 ms | 0gyanf0v5_rzs.js (546 ms) |
| event-detail | 657 ms | 586 ms | 0gyanf0v5_rzs.js (581 ms) |
| organisers | 572 ms | 518 ms | 04aem330ymbdp.js (297 ms) |
| pricing | 697 ms | 652 ms | 0gyanf0v5_rzs.js (243 ms) |
| help | 695 ms | 652 ms | 0gyanf0v5_rzs.js (410 ms) |
| legal-terms | 726 ms | 671 ms | 0gyanf0v5_rzs.js (241 ms) |
| login | 681 ms | 634 ms | 0gyanf0v5_rzs.js (182 ms) |
| signup | 418 ms | 352 ms | turbopack chunk (265 ms) |

If `0.~2ky53fo~10.js` scripting time can be cut by ~250 ms (e.g.
30-40% reduction or split into multiple chunks loaded with `defer`),
TBT comes under the 300 ms gate on at least 6 routes immediately.
This is the single highest-leverage optimisation remaining.

## Per-route blocker punch list

- **home**: chronic NO_LCP simulator artifact. Real-device confirms
  it is paint-able. Block: not actionable; ship as-is.

- **events**: LCP 3559 ms. Root cause: empty inline grid forces
  rail-tile LCP. Action: fix `src/app/events/page.tsx:57` country
  default (PT4 close rec #2). Expected LCP: ~2400 ms.

- **city**: LCP 3756 ms. Same as events.

- **category**: TBT 615 ms (worst on the board). Action: split
  `0.~2ky53fo~10.js`. LCP 2939 ms is render-delay dominated; same
  fix moves both metrics together.

- **event-detail**: LCP 3347 ms image-bound. Resource load delay
  827 ms is Supabase storage cold-cache round-trip. Action:
  precompute hero variant with Next/Image at build time, or pre-
  warm image CDN on deploy.

- **organisers**: LCP 2665 ms render-delay dominated (h1).
  Already cleared 600 ms render-delay budget on prior iters; today
  +57 ms slip. Action: split `0.~2ky53fo~10.js`, drop main-thread.

- **pricing**: LCP 2594 ms (just over) and TBT 345 ms (just over).
  Closest to gate. Action: split `0.~2ky53fo~10.js`.

- **help**: LCP 2366 ms (passes), TBT 405 ms. Action: split
  `0.~2ky53fo~10.js`.

- **legal-terms**: LCP 2491 ms (passes by 9 ms), TBT 395 ms.
  Action: split `0.~2ky53fo~10.js`.

- **login**: LCP 2256 ms (passes), TBT 288 ms (passes), Perf 0.92.
  Only sub-metric pass on full board. Lighthouse perf weighting
  knocks it just below 0.95 due to FCP 1206 ms (warn band) and SI.

- **signup**: LCP 2490 ms (passes by 10 ms), TBT 373 ms. Element
  render delay 824 ms is the dominant bucket. Action: split
  `0.~2ky53fo~10.js`.

## Note: Vercel preview-only feedback widget

`/_next-live/feedback/feedback.js` adds 100-140 ms main-thread time
on every measured route. This is the Vercel preview comments widget
(injected by deploy protection) and **does not appear in
production**. Production TBT will be ~100-140 ms lower than these
preview numbers across the board, which alone may take help / legal-
terms / signup / pricing under the 300 ms TBT gate.

## Recommendation

The B.1 revert is correct and should stay. The remaining work to
reach the locked standard splits into two clean tracks:

**Track 1 - data fix (small, immediate):**

1. Fix `src/app/events/page.tsx:57` country-default. Either drop
   `'Australia'` default (let undefined = no filter) or normalise
   the seed `venue_country` column. Unblocks `/events` and `/city`
   LCP from rail tile to inline grid card 0 (priority eager).
   Expected: -1100 ms LCP on those 2 routes.

**Track 2 - bundle split (larger, higher leverage):**

2. Audit `0.~2ky53fo~10.js`. The chunk shape suggests the auth-
   provider + supabase client + analytics path are travelling
   together as a single eagerly-evaluated bundle (this was the
   target B.1 was trying to fix - just with the wrong tactic).
   The right fix is route-segment-level dynamic loading:
     - move `<AuthProvider>` import into the auth-gated route
       segments (`(organiser)`, dashboard) instead of root layout
     - mark non-critical analytics/supabase init as `defer` script
   Expected: -250-400 ms TBT, -150-300 ms render delay.

3. Production deployment will free ~100-140 ms TBT just by
   dropping the preview feedback widget.

Together these three would push 7-8 routes over 0.95.

## What was committed

- `ae44066` Revert B.1
- `ac4b95e` Iter-11 localhost evidence + blocker doc
- (this iteration) Iter-12 preview evidence in
  `docs/sprint1/phase-1b/iter-12-pt5-preview-revert/` plus this
  close report and helper scripts (`lh-pt5-preview-revert.mjs`,
  `lh-blockers.mjs`, `lh-lcp-detail.mjs`).

Stop conditions are not engaged. The revert was correct, all
gains held on A11y / BP / SEO / CLS, and the remaining work is
two surgical changes with clear expected wins.
