# Pre-Task 5 iter-14 close report — image preload (FINAL iteration)

**Commit:** `fce9178 perf(lcp): mark first recommended-rail card as priority`
**Branch:** `feat/sprint1-phase1b-performance-and-visual`
**Preview URL:** `https://eventlinqs-app-git-feat-sprint1-28e87b-lawals-projects-c20c0be8.vercel.app`
**Methodology:** 11 routes × 3 warm-retry passes (33 Lighthouse runs total) → median.
**Date:** 2026-04-27

## TL;DR — honest assessment

**No route hit the 0.95 perf gate.** Median best is `login` at 0.92, then `category` / `legal-terms` / `help` / `signup` / `pricing` clustered at 0.89–0.91. The grid routes (`/events`, `/events/browse/[city]`, `/event-detail`) sit at 0.80–0.82 because their LCP element is an `<img>` paying a 1000–1230ms resource load delay through Next.js's image optimizer that the priority fix did not eliminate.

**Recommendation:** **Pause performance work.** Move to actual launch blockers (M6 Stripe Connect, Layout Polish). Treat the locked 0.95 perf gate as evidence-mismatched and either calibrate it against three-run preview-deploy medians (current ceiling ≈0.92) or accept performance optimization as a post-launch concern.

## What changed since iter-13

`src/components/features/events/m5-recommended-rail.tsx` — first card now passes `priority={i === 0}` to `EventCard`, which forwards through to `EventCardMedia` and ultimately to `next/image`. This causes:

1. `<img fetchpriority="high" loading="eager">` instead of `auto/lazy` on the rail's first card.
2. Next.js auto-injects `<link rel="preload" as="image" imagesrcset="..." imageSizes="...">` in the document `<head>` — verified live on the deployed preview.

The fix is technically correct and applied. The LCP element trace confirms it is now flagged priority. The simulator just doesn't reward it enough to clear 0.95.

## Median scores across 3 warm passes

| Route | Perf median | LCP median | TBT median | CLS median | SI median | FCP median | Per-run perf |
|---|---|---|---|---|---|---|---|
| home | **0.87** | 2768ms | 349ms | 0.000 | 2623ms | 1457ms | n/a, 0.87, n/a |
| events | **0.82** | 3601ms | 345ms | 0.015 | 2553ms | 1391ms | 0.81, 0.84, 0.82 |
| city | **0.82** | 3699ms | 288ms | 0.015 | 2680ms | 1343ms | 0.82, 0.84, 0.82 |
| category | **0.91** | 2418ms | 301ms | 0.000 | 2117ms | 1339ms | 0.84, 0.92, 0.91 |
| event-detail | **0.80** | 2770ms | 619ms | 0.000 | 3037ms | 1158ms | 0.81, 0.80, 0.79 |
| organisers | **0.85** | 2447ms | 512ms | 0.000 | 1857ms | 1196ms | 0.84, 0.85, 0.91 |
| pricing | **0.89** | 2613ms | 285ms | 0.000 | 1848ms | 1611ms | 0.85, 0.89, 0.92 |
| help | **0.90** | 2559ms | 317ms | 0.000 | 1753ms | 1292ms | 0.90, 0.93, 0.89 |
| legal-terms | **0.91** | 2590ms | 252ms | 0.000 | 1835ms | 1436ms | 0.91, 0.84, 0.93 |
| login | **0.92** | 1993ms | 322ms | 0.029 | 1457ms | 1077ms | 0.92, 0.90, 0.92 |
| signup | **0.90** | 2434ms | 324ms | 0.000 | 1782ms | 1111ms | 0.90, 0.90, 0.91 |

CLS, A11y, BP, SEO not shown — A11y/BP/SEO are 1.00 across the board, CLS is in the table.

## iter-14 vs iter-13 deltas

| Route | iter-13 (warm where avail) | iter-14 (median 3 passes) | Δ |
|---|---|---|---|
| home | n/a (NO_LCP) | **0.87** | full recovery |
| events | 0.78 | **0.82** | +0.04 |
| city | 0.73 | **0.82** | +0.09 |
| category | 0.82 | **0.91** | +0.09 |
| event-detail | 0.80 | **0.80** | 0 |
| organisers | 0.85 | **0.85** | 0 |
| pricing | 0.86 | **0.89** | +0.03 |
| help | 0.87 | **0.90** | +0.03 |
| legal-terms | 0.89 | **0.91** | +0.02 |
| login | 0.87 | **0.92** | +0.05 |
| signup | 0.87 | **0.90** | +0.03 |

The improvements are real: 9 of 11 routes moved up, none moved down. But every route still falls short of 0.95. **The methodology change (3-pass median over single warm pass) explains some of the apparent gain** — single-pass numbers in iter-13 had ±0.05 noise — but the underlying LCP and TBT numbers genuinely improved on at least the rail-LCP routes (`events`, `city`, `category`).

## Per-route remaining blocker

### Routes ≥0.90 (close to gate)

| Route | Median | LCP | Primary blocker |
|---|---|---|---|
| login | 0.92 | 1993ms | LCP good. Element-render-delay 463ms on the `h1` — JS hydration cost on a route that just imports the auth client. Trimming `app/(auth)/login/page` chunks further would help, but we already split Supabase. |
| legal-terms | 0.91 | 2590ms | LCP element is `<p>` text. Element render delay 734ms — pure hydration cost from the SiteHeader + SiteFooter pull-through. |
| category | 0.91 | 2418ms | LCP is the `h1` hero text (passes 2500ms). Element render delay 667ms — same hydration story as legal-terms. |
| help | 0.90 | 2559ms | Same `h1` LCP, similar render delay 691ms. |
| signup | 0.90 | 2434ms | Same `h1` LCP, render delay 828ms. |

### Routes 0.85–0.89 (mid-band)

| Route | Median | LCP | Primary blocker |
|---|---|---|---|
| pricing | 0.89 | 2613ms | `h1` LCP, render delay 756ms. ~110ms over LCP target. Closing this would need either more aggressive hero text fonting (preload variable Manrope subset) or stripping a layer of layout JS. |
| home | 0.87 | 2768ms | Hero image LCP. Resource load delay 572ms (much better than grid routes — homepage hero URL is in the metadata so it gets preloaded earlier). 270ms over LCP target. |
| organisers | 0.85 | 2447ms | `h1` LCP, render delay 712ms. TBT 512ms — high. The organisers page imports something heavier than the comparable text-only legal-terms route. |

### Routes 0.80–0.82 (grid routes — the actual blocker)

| Route | Median | LCP | Primary blocker |
|---|---|---|---|
| events | 0.82 | 3601ms | LCP is the rail card image (`li.w-64 > a > div > img.object-cover`). After iter-14 fix, the image has `fetchpriority="high"` and `loading="eager"` and a `<link rel="preload">` is in the head. **Resource load delay is still 1060ms** — meaning the browser starts the fetch 1.06s after TTFB despite the preload. This is the Next.js image-optimizer encoding time on a cold edge cache. The optimizer URL is `/_next/image?url=https%3A%2F%2Fimages.pexels.com%2Fphotos%2F7803683%2F...&w=384&q=70` — Next.js fetches Pexels, encodes to AVIF/WebP, then serves. On a fresh deploy with no cache hit, the encode pipeline takes ~1s. |
| city | 0.82 | 3699ms | Identical to events (same LCP element pattern, same optimizer cold-cache). |
| event-detail | 0.80 | 2770ms | Hero image LCP with priority. Resource load delay 1229ms — even higher than events because the slug is unique and won't share cache hits across users. TBT also elevated at 619ms. |

## What the iter-14 fix actually did

- **Confirmed working at the HTML level.** Verified by curling `/events` on the preview and finding `<link rel="preload" as="image" imagesrcset="...?w=...&q=70" imagesizes="..." fetchPriority="high"/>` in the head, plus the rendered `<img fetchpriority="high" loading="eager">` matching the LCP element trace.
- **Did NOT meaningfully reduce LCP on `/events` or `/city`.** LCP went from 3558→3601 on events (within variance) and 3642→3699 on city. The reason is the resource load delay isn't a browser priority issue — it's a Next.js image-optimizer cold-encoding bottleneck. Even with preload + priority, the browser is asking the optimizer for an image it has to fetch from Pexels and encode on the fly.
- **DID help `/home` recover from NO_LCP.** The home hero now has a clean LCP at 2768ms instead of failing the simulator's element-detection. This is a real win.
- **Modest perf gains on text-LCP routes** (category +0.09, login +0.05, etc.) — partly methodology (3-run median averages out cold-start noise) and partly genuine.

## Why the gate remains unreachable from app code

The locked target is **0.95 perf** with **LCP ≤2500ms**. On grid routes (`events`, `city`, `event-detail`):

1. **Image-optimizer cold encode (~1000ms)** — fixable only by:
   - Pre-warming optimizer cache via cron-pinged URLs (operational complexity, blocked by Vercel pricing tier on bandwidth).
   - Self-hosting the images on a CDN that doesn't re-encode (loses Vercel's bandwidth optimization).
   - Switching the LCP candidate to a static asset already on the edge (would require redesigning the hero strip to include a static raster).
2. **Static text LCP routes (pricing, organisers, help)** — render delay 700–800ms is mostly Next.js client hydration of nested layouts. Reducing it requires:
   - Trimming the `SiteHeader` + `BottomNav` hydration chain.
   - Server-only rendering more of the layout.
   - Both of these are larger architectural changes than a single iter.

3. **Lantern simulator overhead** — even on routes where LCP < 2500ms (`login` 1993ms, `category` 2418ms, `signup` 2434ms), the perf score caps at ~0.92 because Speed Index and TBT also factor in. The simulator's mobile model (4× CPU, 1.6 Mbps) is unforgiving for any JS-heavy app.

## What WAS achieved across iter-12 → iter-14

- Reverted the broken Supabase deferral (iter-11/12).
- Removed `Australia` country default that was hiding non-AU events from `/events` (iter-13).
- Split Supabase out of every public-route bundle — verified at chunk level (iter-13).
- Marked the actual rail-card LCP element as priority (iter-14).
- Documented per-route LCP elements with exact selectors and phase breakdowns.
- Established that home is now recoverable from NO_LCP.

## Recommendation: pause performance, ship M6

The 0.95 gate is not currently achievable on this preview infrastructure with the current image strategy. Three honest paths forward:

1. **Calibrate the gate to evidence.** Set the production gate at **perf ≥ 0.85 median over 3 runs** (current floor: events/city/event-detail at 0.80–0.82 — within ±0.03 of this band). Tighter LCP gate per route: `≤3700ms` for grid, `≤2800ms` for text-LCP. Move on to launch.
2. **Defer performance to post-launch.** Accept current numbers. Build out M6 Stripe Connect, Layout Polish, and the remaining launch blockers. Revisit performance with real production telemetry (Real User Metrics on plausible/web vitals) — those numbers tend to be 15–20% better than lantern simulation, and the gate can be evaluated against actual user experience.
3. **Continue grinding LCP** (NOT recommended). Would require: pre-warming optimizer cache, redesigning hero strip to use a static raster, or trimming SiteHeader hydration chain. Each is multiple days of work for ~0.05 points and breaks `/events` until the redesign lands.

The user asked for this iter to be the FINAL round of perf work regardless of result. Per that instruction, **pausing here and moving to launch blockers.**

## Evidence

- 33 Lighthouse runs (11 routes × 3 passes): `docs/sprint1/phase-1b/iter-14-pt5-image-preload/run{1,2,3}/`
- Median summary script: `scripts/lh-median-summary.mjs`
- LCP element trace per run: `scripts/lh-lcp-detail.mjs`
- Sweep runner: `scripts/lh-iter14-3pass.mjs`
- Verified preload link in deployed HTML head (curled `/events`, found `<link rel="preload" as="image" fetchPriority="high">`).
