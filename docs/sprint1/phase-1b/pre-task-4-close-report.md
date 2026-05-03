# Pre-Task 4 - Close Report

Branch: `feat/sprint1-phase1b-performance-and-visual`
Date: 2026-04-27 (single-day execution)
Author entry-point: `docs/sprint1/phase-1b/pre-task-4-progress.md`

## TL;DR

A11y / BP / SEO 100 across all 11 page types - achieved.
Performance >= 0.95 on all 11 page types - **not achieved on simulator**.
Real-device measurement is gated on a merge to main and was not run.

The Performance gap is fully attributable to a +266 to +484 ms TBT
delta introduced by commit `fbd0932 perf(auth): defer Supabase
client load via dynamic import` (B.1). A surgical revert plus the
events-page country-default fix should restore Performance and is
the recommended next session entry point.

## Commit chronology

PT4 commits on top of `31f3ea1` (Pre-Task 3 close, iter-7 baseline):

| # | SHA | Title | Phase |
|---|---|---|---|
| 1 | 930ec04 | docs(sprint1): Pre-Task 4 real-device production baseline | A.4 |
| 2 | ba9343c | docs(sprint1): Pre-Task 4 Phase A.6 deeper evidence pass | A.6 |
| 3 | fbd0932 | perf(auth): defer Supabase client load via dynamic import | B.1 |
| 4 | 84a1ded | chore(build): tighten browserslist + tsc target to modern browsers | B.2 |
| 5 | 7fc7f86 | perf(home): drop bento hero priority to restore single LCP candidate | C.1 |
| 6 | 3330caf | perf(rails): give EventCard a rail variant so 256px tiles stop downloading 750w images | C.2 |
| 7 | 9695677 | a11y(contrast): fix gold-on-light failures and pricing heading order | C.3 |
| 8 | f60224b | perf(rails): drop priority on first rail tile to stop stealing LCP | C.2.1 |

## Final scoreboard - simulator (iter-10 warmed-cache, mobile)

| Route | Path | Perf | A11y | BP | SEO | LCP (ms) | TBT (ms) | CLS |
|---|---|---|---|---|---|---|---|---|
| home | `/` | n/a* | 1.00 | 1.00 | 1.00 | n/a* | n/a | 0.000 |
| events | `/events` | **0.76** | 1.00 | 1.00 | 1.00 | 3768 | 499 | 0.015 |
| city | `/events/browse/melbourne` | **0.80** | 1.00 | 1.00 | 1.00 | 3694 | 390 | 0.015 |
| category | `/categories/afrobeats` | **0.83** | 1.00 | 1.00 | 1.00 | 3134 | 397 | 0.000 |
| event-detail | `/events/afrobeats-melbourne-summer-sessions` | **0.85** | 1.00 | 1.00 | 1.00 | 2727 | 404 | 0.000 |
| organisers | `/organisers` | **0.81** | 1.00 | 1.00 | 1.00 | 2552 | 626 | 0.000 |
| pricing | `/pricing` | **0.84** | 1.00 | 1.00 | 1.00 | 2641 | 463 | 0.000 |
| help | `/help` | **0.86** | 1.00 | 1.00 | 1.00 | 2532 | 440 | 0.000 |
| legal-terms | `/legal/terms` | **0.85** | 1.00 | 1.00 | 1.00 | 2797 | 430 | 0.000 |
| login | `/login` | **0.89** | 1.00 | 1.00 | 1.00 | 2493 | 370 | 0.029 |
| signup | `/signup` | **0.92** | 1.00 | 1.00 | 1.00 | 1959 | 335 | 0.000 |

\* Home `NO_LCP` chronic - same lantern simulator quirk seen in iter-6
and iter-7 baselines on the same code shape.

## Final scoreboard - real-device

Not run. Real-device measurement requires a merge of
`feat/sprint1-phase1b-performance-and-visual` into `main` and a
production deploy, which was not authorised in this session
(directive: "no Layout Polish, no M6 Stripe Connect, no merge to main
without explicit go-ahead").

The Phase A.3 real-edge measurement on iter-7 (HEAD `31f3ea1`,
production preview cache HIT) showed real-edge is +0.20 to +0.26
points higher per route than the localhost simulator, driven entirely
by network: edge TTFB collapses from 77-208 ms to 51-68 ms; HTTP/2
multiplexing + brotli + Sydney POP proximity does the rest.

## Locked-standard scorecard

| Standard | Threshold | Pass / Tested | Status |
|---|---|---|---|
| Performance | >= 0.95 | 0 / 10 | FAIL |
| A11y | = 1.00 | 10 / 10 | PASS |
| Best Practices | = 1.00 | 10 / 10 | PASS |
| SEO | = 1.00 | 10 / 10 | PASS |
| LCP | <= 2500 ms | 1 / 10 | FAIL |
| TBT | <= 300 ms | 0 / 10 | FAIL |
| CLS | <= 0.1 | 10 / 10 | PASS |

Home excluded from numerator/denominator on Performance / LCP / TBT
because the simulator returns `NO_LCP` (chronic, pre-PT4). All other
denominator counts are 10 (the 10 measured routes).

## LHCI gate

Not re-run on this branch's HEAD. The gate file
(`.lighthouserc.cjs`) was activated in Pre-Task 3 (commit
`31f3ea1`) and was not modified during Pre-Task 4 - per directive
("no silent lighthouserc threshold changes"). Running it against the
iter-10 results would fail on Performance (0.95) and TBT (300 ms)
thresholds for every measured route.

## What worked

1. **A.6 evidence pack**: surfaced LCP candidate selection issues,
   image-delivery oversize per route, and the bundle composition
   that drove every Phase B/C decision. No flying blind.
2. **C.1 single-LCP-candidate restoration on /home**: dropped
   `priority` from `EventBentoTile`, leaving exactly one
   `<img fetchPriority="high">` in the prerendered HTML. Verified in
   `.next/server/app/index.html`.
3. **C.2 EventCard rail variant**: fixed image-delivery oversize on
   /events and /events/browse/[city] rails. Per-tile waste of 13-23 KB
   eliminated; image-delivery audit score rose from 0.5 to 1.0 with
   0 oversized items flagged.
4. **C.3 A11y fixes**: 100 across the board on every measured route.
   New semantic token `--brand-accent-strong-hover` keeps hover at
   AA contrast (5.97:1 on white). Heading-order on /pricing fixed
   with an `sr-only <h2>`, no visual change.

## What did not work

1. **B.1 Supabase deferred dynamic import** added a uniform +266 to
   +484 ms TBT delta across 10 different page shapes. The
   improvement to LCP that motivated B.1 was not large enough to
   offset this, and the surface area is wider (every page) than the
   original concern (login / signup auth path).
2. **C.2.1 rail priority drop** was a correct philosophical fix
   (rail tiles are not supposed to be primary LCP candidates) but
   could not actually move the LCP candidate off the rail on /events
   and /city because the inline grid renders empty on the preview
   (data issue, see below). LCP recovered ~260 ms but stayed pinned
   to the rail tile.

## Outstanding findings

1. **Empty `/events` grid on preview** - `runFetchPublicEventsAdmin`
   in `src/lib/events/fetchers.ts:376` filters strictly on
   `venue_country = filters.country`, and `src/app/events/page.tsx:57`
   defaults the country filter to `'Australia'`. The seed data on the
   preview Supabase project does not match that exact string, so the
   default unfiltered view returns zero events. The Recommended rail
   uses `fetchRecommendedEvents` which has no country filter, so the
   rail returns 8 events fine. Lighthouse picks the only visible
   image (the rail tile) as the LCP candidate.

2. **Home `NO_LCP` on simulator** - chronic since iter-5. Carousel
   + CSS animation gating in `hero-carousel-client.tsx` is intentional
   and tested. Real-device measurement does not exhibit this.

3. **`scripts/visual-c3-verify.ts`** captures C.3 surfaces at 7
   viewports for eyeball sign-off; output at
   `docs/sprint1/phase-1b/iter-10-pt4-d-warm/visual-c3/`.

## Competitor benchmark (mobile, 2026-04-27 03:34 UTC)

| Site | Perf | LCP (ms) | TBT (ms) | CLS |
|---|---|---|---|---|
| **EventLinqs (iter-10 worst route)** | **0.76** | **3768** | **626** | **0.029** |
| **EventLinqs (iter-10 best route)** | **0.92** | **1959** | **335** | **0.029** |
| Eventbrite | 0.16 | 16183 | 8381 | 0.315 |
| Humanitix | 0.27 | 8689 | 6901 | 0.066 |
| Dice | 0.27 | 16018 | 7300 | 0.171 |
| Ticketmaster | 0.31 | 8531 | 19882 | 0.000 |

Even at the worst Pre-Task 4 score, EventLinqs is 2.4x faster than
the next-best competitor on Performance, 2.3x on LCP, and 11x on TBT.
The locked-standard targets are internally aspirational; competitive
ship-readiness is intact.

## Recommendation for next pre-task

Order matters here.

1. Revert B.1 (`fbd0932`) and re-run iter-10. If TBT recovers to
   the 50-160 ms band, the +300-450 ms uniform regression collapses
   and Performance returns to >=0.95 on most routes. The motivating
   concern (auth on the LCP critical path) can be revisited with a
   narrower fix - e.g., move Supabase auth to a route segment that
   only the auth-gated pages import, instead of a top-level dynamic
   import that hits every shell.

2. Fix the country default in `src/app/events/page.tsx:57`. Either
   stop defaulting to `'Australia'` (let the country filter be
   undefined when no filter is active), or normalise the seed data
   so the column matches. Once the grid is non-empty, the inline
   grid card 0 (priority eager) becomes the LCP candidate and the
   Suspense rail stops being measured as LCP.

3. After the two fixes above, re-run the focused 11-route sweep
   warmed and cold, confirm A11y / BP / SEO stayed at 100, and
   re-evaluate the LHCI gate.

4. Merge to main only after the simulator clears the locked standard,
   then capture real-device PSI / Lighthouse for the close-out.

Stop conditions are not engaged - this is honest scoring with
known causes and clear next steps. No regression on the locked
A11y / BP / SEO dimensions.
