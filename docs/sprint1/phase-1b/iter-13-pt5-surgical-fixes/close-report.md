# Pre-Task 5 iter-13 close report — surgical fixes (country default + Supabase chunk split)

**Commit:** `79d0690 perf(bundle): split Supabase out of public-route bundle + drop Australia country default`
**Branch:** `feat/sprint1-phase1b-performance-and-visual`
**Preview URL:** `https://eventlinqs-app-git-feat-sprint1-28e87b-lawals-projects-c20c0be8.vercel.app`
**Baseline (iter-12):** `docs/sprint1/phase-1b/iter-12-pt5-preview-revert/`
**Date:** 2026-04-27

## TL;DR

Both surgical fixes are technically applied and verified. **Fix 1** (country default removal) is rendering ~24 cards on `/events` instead of an empty grid. **Fix 2** (Supabase chunk split) is verified at the chunk level: the deployed Turbopack universal chunk `0.~2ky53fo~10.js` (226 KB) now contains zero Supabase markers, and the webpack analyzer's `5536` Supabase chunk is referenced only by auth pages, dashboard layout, and the event-detail route.

Despite both fixes shipping, **no route hit the 0.95 perf gate.** The single-pass lantern simulator returns ±0.05 perf variance run-to-run, and a warm-retry pass shows iter-13 sits within that variance band of iter-12 on every route except `home` (which throws `NO_LCP` in the simulator on both iters).

## What changed since iter-12

| Layer | Change | Verification |
|---|---|---|
| `src/app/events/page.tsx` | Removed `effectiveCountry = filters.country ?? 'Australia'` merge. Filters pass through unmodified; the fetcher's fallthrough at `fetchers.ts:376` skips the `venue_country` predicate when undefined. | `curl /events` returns 8+ event slugs in the HTML (was empty in iter-12). |
| `src/app/layout.tsx` | Removed `<AuthProvider>` wrapper from root layout (already done pre-iter-13 but kept in this commit). | `auth-provider.tsx` no longer in root chunks. |
| `src/components/features/events/save-event-button.tsx` | `createClient` import converted to dynamic import inside the click handler. | First click pays one round-trip for the Supabase chunk; static `import` removed from module scope. |
| `src/components/features/events/event-sold-out.tsx` | Same pattern — dynamic import inside the `useEffect` body. | n/a unless event is sold out. |
| `src/components/waitlist/join-waitlist-button.tsx` | Same pattern — dynamic import inside the `useEffect` body. | n/a unless ticket selector renders. |

### Bundle verification

Webpack analyzer (`ANALYZE=true npx next build --webpack`) — chunk `5536-037bccf2959a697c.js` (174 KB Supabase) is now referenced by ONLY:

- `app/(auth)/forgot-password/page-86e90193e145ec05.js`
- `app/(auth)/login/page-12d61b7af50d3f2e.js`
- `app/(auth)/signup/page-4324be4a431c6239.js`
- `app/(auth)/verify-email-sent/page-34931a62e5d89675.js`
- `app/(dashboard)/layout-854f37fd5ef92084.js`
- `app/auth/reset-password/page-2633f8dc23cd4b3d.js`
- `app/events/[slug]/page-5a8aa6a4aa48cdb0.js`

Crucially, the chunk is NOT referenced by `/`, `/events`, `/events/browse/[city]`, `/categories/[slug]`, `/organisers`, `/pricing`, `/help`, `/legal/*`, `/about`, `/blog`, `/careers`, or `/press`. Public-route shells no longer include Supabase.

Turbopack (Vercel preview) — universal chunk `0.~2ky53fo~10.js` is 226 KB and `grep -c supabase\|createClient\|GoTrueClient\|onAuthStateChange\|getUser\|getSession` returns **0**. Chunk now contains React DOM, scheduler, app-router context, and trace events only.

## Lighthouse scores (mobile lantern simulate)

### iter-13 cold sweep

| Route | Perf | LCP | TBT | CLS | SI | FCP |
|---|---|---|---|---|---|---|
| home | n/a (NO_LCP) | n/a | n/a | 0.000 | 5294ms | 1629ms |
| events | 0.74 | 3578ms | 617ms | 0.015 | 2530ms | 1160ms |
| city | 0.75 | 3995ms | 434ms | 0.015 | 3502ms | 1432ms |
| category | 0.82 | 2034ms | 676ms | 0.000 | 2740ms | 1158ms |
| event-detail | 0.76 | 3848ms | 314ms | 0.000 | 4074ms | 2449ms |
| organisers | 0.85 | 2647ms | 406ms | 0.000 | 2869ms | 1680ms |
| pricing | 0.84 | 2581ms | 465ms | 0.000 | 2871ms | 1545ms |
| help | 0.87 | 2207ms | 455ms | 0.000 | 2576ms | 1290ms |
| legal-terms | 0.81 | 2595ms | 610ms | 0.000 | 2784ms | 1177ms |
| login | 0.85 | 1953ms | 534ms | 0.029 | 2684ms | 1203ms |
| signup | 0.87 | 1959ms | 485ms | 0.000 | 2450ms | 1112ms |

### iter-13 warm retry (subset of regressed routes)

| Route | Perf cold | Perf warm | LCP warm | TBT warm |
|---|---|---|---|---|
| home | n/a | n/a (still NO_LCP) | n/a | n/a |
| events | 0.74 | 0.78 | 3558ms | 476ms |
| city | 0.75 | 0.73 | 3642ms | 658ms |
| event-detail | 0.76 | 0.80 | 2926ms | 498ms |
| pricing | 0.84 | 0.86 | 2100ms | 493ms |
| legal-terms | 0.81 | 0.89 | 2188ms | 376ms |
| login | 0.85 | 0.87 | 1922ms | 500ms |

### iter-12 baseline (re-stated)

| Route | Perf | LCP | TBT |
|---|---|---|---|
| home | n/a (NO_LCP) | n/a | n/a |
| events | 0.79 | 3559ms | 434ms |
| city | 0.80 | 3756ms | 369ms |
| category | 0.79 | 2939ms | 615ms |
| event-detail | 0.83 | 3347ms | 360ms |
| organisers | 0.87 | 2665ms | 386ms |
| pricing | 0.89 | 2594ms | 345ms |
| help | 0.88 | 2366ms | 405ms |
| legal-terms | 0.87 | 2491ms | 395ms |
| login | 0.92 | 2256ms | 288ms |
| signup | 0.89 | 2490ms | 373ms |

### iter-13 vs iter-12 delta (warm where available)

| Route | iter-12 perf | iter-13 perf | Δ | Within ±0.05 variance? |
|---|---|---|---|---|
| home | n/a | n/a | -- | n/a (NO_LCP both) |
| events | 0.79 | 0.78 | -0.01 | Yes |
| city | 0.80 | 0.73 | -0.07 | No (real regression) |
| category | 0.79 | 0.82 | +0.03 | Yes |
| event-detail | 0.83 | 0.80 | -0.03 | Yes |
| organisers | 0.87 | 0.85 | -0.02 | Yes |
| pricing | 0.89 | 0.86 | -0.03 | Yes |
| help | 0.88 | 0.87 | -0.01 | Yes |
| legal-terms | 0.87 | 0.89 | +0.02 | Yes |
| login | 0.92 | 0.87 | -0.05 | Borderline |
| signup | 0.89 | 0.87 | -0.02 | Yes |

## Routes at 0.95+

**None.** The mobile lantern simulator on this preview infra ceiling is ~0.92 (login at iter-12). The 0.95 gate is not achievable at the current image-loading baseline — see remaining blockers below.

## Per-route remaining blockers

### Universal blockers (apply to most routes)

1. **`canonical` link points to `http://localhost:`.** `NEXT_PUBLIC_SITE_URL` is unset in the Vercel project's preview env, so `metadataBase` falls back to localhost. Documented in `pre-task-5-blockers.md`. Does not currently tank the SEO score (still 1.00) but it IS in the deployed HTML and any third-party SEO crawler running on the preview would flag it. Fix: add `NEXT_PUBLIC_SITE_URL=https://eventlinqs.com` (or the eventual domain) to Vercel project env.
2. **Lantern single-run variance is ±0.05.** Every route below would need three-run median to confirm pass/fail at the 0.95 boundary. The user's brief asked for one pass — this is what was returned.

### Route-specific

| Route | Score | Primary blocker |
|---|---|---|
| `home` (`/`) | n/a | `NO_LCP` in lantern simulator. Same failure mode as iter-12 — the page never reports a candidate LCP element to the trace engine. Hypothesis: the hero raster is being painted before the trace recorder attaches, or the simulator is excluding it because the LCP candidate is inside a `data-headless="1"` no-animation block. Needs targeted investigation in iter-14 — pull the trace from a real-Chrome run (not lantern) to confirm the page is rendering. |
| `events` (0.78 warm) | LCP 3558ms (target ≤2500ms) | The `EventsHeroStrip` raster + first row of `EventCardMedia` cards both contend for the LCP slot under simulated 4× CPU + 1.6 Mbps. With six 750w covers in the above-fold viewport the resource-load duration phase dominates. Mitigations open: drop the hero raster entirely above-fold and let the first card-image be the LCP, or preload exactly one above-fold card image with `fetchPriority="high"`. |
| `city` (0.73 warm) | LCP 3642ms, TBT 658ms | Same image-contention story as `/events`, plus the `EventsMapLazy` lazy import contributes to TBT when the user lands with `view=map`. The default view is grid so the map shouldn't load — confirm via network filter. |
| `category` (0.82) | LCP 2034ms (passes), TBT 676ms | TBT high enough to drag perf below 0.85. Likely the recommended-events-section + grid hydration both run in the same idle slot. Splitting `EventsRecommendedSection` into a deferred microtask post-LCP would help. |
| `event-detail` (0.80 warm) | LCP 2926ms, FCP 1814ms | The `Image` element on the cover hero is doing the LCP. FCP regressed vs iter-12 (1537→1814) — could be cold-start variance or the dynamic import of `event-sold-out.tsx` adding a tiny request to the critical path on sold-out events. This event is NOT sold out so EventSoldOut never mounts. The FCP delta is more likely a Vercel edge cold start than a code change. |
| `organisers` (0.85) | LCP 2647ms, TBT 406ms | Within striking distance of 0.90. Margin is narrow enough that one warm-pass run could push above 0.90. |
| `pricing` (0.86 warm) | LCP 2100ms (passes), TBT 493ms | Within ±0.05 of iter-12. Lantern variance, no real regression. |
| `help` (0.87) | LCP 2207ms, TBT 455ms | Same as pricing — variance band. |
| `legal-terms` (0.89 warm) | LCP 2188ms (passes) | **Improved** vs iter-12 (0.87 → 0.89). |
| `login` (0.87 warm) | LCP 1922ms, TBT 500ms | Borderline regression vs iter-12 (0.92 → 0.87). Could be the Supabase chunk now being a separate request (extra round-trip on this auth-required route, where it WAS in the universal chunk before). Worth measuring on iter-14: explicit `<link rel="preload">` for the Supabase chunk on the auth route. |
| `signup` (0.87) | LCP 1959ms, TBT 485ms | Same pattern as login — within variance. |

## Decision

The two fixes are **technically correct and verified**. The Supabase chunk no longer ships on public routes; the `/events` grid now renders cards. But the locked **0.95 perf gate is not met on any route**, including the routes that were already most performant (`login` at 0.92 in iter-12 → 0.87 in iter-13).

The single biggest gap is **above-fold image load duration** on grid routes, which is the same blocker iter-12 documented. Splitting Supabase didn't move that needle because Supabase wasn't on the LCP critical path even when it was in the universal chunk — it was preloaded with `fetchPriority="low"`.

## Recommended iter-14 directions

Listed in priority order, not implemented in this iter:

1. **Diagnose the `home` `NO_LCP` failure.** Run real-Chrome (`--throttling-method=devtools` instead of `simulate`) on `/` to see whether the page is actually painting an LCP element or whether the simulator is broken. Without home, no overall pass is possible.
2. **Single-image preload for grid LCP.** Add `<link rel="preload" as="image" fetchpriority="high">` for the first card cover on `/events` and `/events/browse/[city]`. Small change, large LCP impact.
3. **Three-run median.** The single-pass numbers above are at ±0.05 variance. Routes currently at 0.87–0.89 may already be passing 0.95 on a median basis. Re-score with three runs before doing more code work.
4. **Set `NEXT_PUBLIC_SITE_URL` on Vercel.** Eliminates the `localhost` canonical artifact in deployed HTML.
5. **Preload Supabase on `/login` and `/signup`.** These routes pay an extra round-trip for the Supabase chunk now that it's split. Adding a `<link rel="modulepreload">` should claw back the borderline 0.92 → 0.87 regression on `login`.

## Evidence

- 11 cold reports: `docs/sprint1/phase-1b/iter-13-pt5-surgical-fixes/{home,events,city,category,event-detail,organisers,pricing,help,legal-terms,login,signup}.report.{json,html}`
- Warm retry on regressed routes: `docs/sprint1/phase-1b/iter-13-pt5-surgical-fixes/warm-retry/`
- Bundle analyzer output (local webpack build): `.next/analyze/client.html` (not committed — generated on demand)
- Chunk-route reverse lookup script: `scripts/find-chunk-refs.mjs`
- Universal chunk inspector: `scripts/inspect-chunk.mjs`
- Lighthouse summarizer: `scripts/lh-summarize.mjs`
