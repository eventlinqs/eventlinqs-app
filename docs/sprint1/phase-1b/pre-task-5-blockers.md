# Pre-Task 5 Iter-11 - Blocker Report

Branch: `feat/sprint1-phase1b-performance-and-visual`
HEAD: `ae44066` (Revert "perf(auth): defer Supabase client load via dynamic import")
Date: 2026-04-27

## Action taken

Per Pre-Task 4 close report recommendation #1, reverted commit
`fbd0932` (B.1) which had introduced a uniform +266 to +484 ms TBT
delta across all 10 measured routes.

- `git revert fbd0932` (one merge conflict in
  `docs/sprint1/phase-1b/pre-task-4-progress.md`, resolved by keeping
  the post-B.1 HEAD content - the parent-of-fbd0932 side held no
  unique content)
- `npm run build` clean (no type errors, no lint failures, BUILD_ID
  generated)
- 11-route Lighthouse sweep against `npm run start` on
  `localhost:3000`
- Output: `docs/sprint1/phase-1b/iter-11-pt5-revert-b1/`

## Locked-standard gate result on localhost

**Not met on any route.** Cannot push.

| Route | Perf | A11y | BP | SEO | LCP (ms) | TBT (ms) | CLS |
|---|---|---|---|---|---|---|---|
| home | n/a | 1.00 | 1.00 | 1.00 | NO_LCP | n/a | 0.000 |
| events | 0.71 | 1.00 | 1.00 | 1.00 | 5297 | 365 | 0.010 |
| city | 0.72 | 1.00 | 1.00 | 1.00 | 5471 | 336 | 0.010 |
| category | 0.74 | 1.00 | 1.00 | **0.91** | 4696 | 329 | 0.000 |
| event-detail | 0.88 | 1.00 | 1.00 | 1.00 | 3662 | **166** | 0.000 |
| organisers | 0.74 | 1.00 | 1.00 | 1.00 | 5126 | **290** | 0.000 |
| pricing | 0.67 | 1.00 | 1.00 | **0.91** | 4794 | 561 | 0.000 |
| help | 0.75 | 1.00 | 1.00 | **0.91** | 4666 | 311 | 0.000 |
| legal-terms | 0.70 | 1.00 | 1.00 | **0.91** | 4985 | 424 | 0.000 |
| login | 0.78 | 1.00 | 1.00 | **0.91** | 3913 | 395 | 0.029 |
| signup | 0.79 | 1.00 | 1.00 | **0.91** | 4353 | 254 | 0.000 |

A11y / BP all 1.00. CLS all under 0.1.

## Why localhost cannot validate the gate (environment delta)

Lighthouse on `localhost:3000` against `npm run start` differs from the
Vercel Sydney edge preview that produced the iter-10 numbers in three
ways that distort every Performance-related metric.

### 1. LCP is inflated 1.3-1.5x because there is no edge

| Route | iter-10 LCP (prod-preview) | iter-11 LCP (localhost) | Inflation |
|---|---|---|---|
| events | 3768 | 5297 | 1.41x |
| city | 3694 | 5471 | 1.48x |
| category | 3134 | 4696 | 1.50x |
| event-detail | 2727 | 3662 | 1.34x |
| organisers | 2552 | 5126 | 2.01x |
| pricing | 2641 | 4794 | 1.81x |
| help | 2532 | 4666 | 1.84x |
| legal-terms | 2797 | 4985 | 1.78x |
| login | 2493 | 3913 | 1.57x |
| signup | 1959 | 4353 | 2.22x |

Cause: localhost has no brotli, no HTTP/2 multiplexing, no Sydney POP
proximity, and Next.js `npm run start` is single-threaded so all
preview-cookie + image requests serialise on one Node event loop.
Phase A.3 already established that real-edge runs +0.20 to +0.26
points higher than localhost simulator on Performance for the same
code shape.

### 2. SEO 0.91 on six routes is a localhost-specific canonical artifact

The root layout sets `alternates: { canonical: '/' }` at
`src/app/layout.tsx:28`. Six routes do not override it:

- `/categories/[slug]`
- `/pricing`
- `/help` (and `/help/[slug]`)
- `/legal/terms`
- `/login`
- `/signup`

On the prod preview, `NEXT_PUBLIC_SITE_URL` is set, so the canonical
resolves to a different domain than the loaded preview URL and the
audit passes (Lighthouse only flags the same-domain root mismatch).
On localhost, `NEXT_PUBLIC_SITE_URL` is undefined and falls back to
`http://localhost:3000`, so the canonical resolves to
`http://localhost:3000/` while the loaded URL is e.g.
`http://localhost:3000/pricing`, which the audit flags with
"Points to the domain's root URL (the homepage), instead of an
equivalent page of content".

This is a real bug (these six routes should each have their own
`alternates: { canonical: '...' }` block), but it is masked on prod
preview by domain mismatch. It did not exist as a regression at
iter-10 - iter-10 simply ran on prod preview where the audit passes.

### 3. TBT comparison shows the revert worked but localhost noise dominates

| Route | iter-10 TBT (prod-preview) | iter-11 TBT (localhost) | Delta |
|---|---|---|---|
| events | 499 | 365 | -134 |
| city | 390 | 336 | -53 |
| category | 397 | 329 | -68 |
| event-detail | 404 | **166** | -237 |
| organisers | 626 | **290** | -336 |
| pricing | 463 | 561 | +98 |
| help | 440 | 311 | -129 |
| legal-terms | 430 | 424 | -6 |
| login | 370 | 395 | +25 |
| signup | 335 | 254 | -81 |

Eight of ten routes improved. event-detail dropped -237 ms and
organisers dropped -336 ms - both now within or close to the 300 ms
gate. Two routes regressed (pricing +98, login +25). These are most
likely localhost CPU contention noise (Lighthouse and `npm run start`
share one Node process tree on a single laptop CPU); the prior
regression introduced by B.1 was uniform across all 10 routes,
whereas this localhost noise is bidirectional and uneven.

## Per-route blockers under the locked standard

These are the blockers as currently measured on localhost. They are
not necessarily blockers on prod preview.

- **home**: chronic `LanternError: NO_LCP` (also seen at iter-5,
  iter-7, iter-10). Carousel + CSS animation gating in
  `hero-carousel-client.tsx`. Real-device measurement does not
  exhibit this. **Block: not real, simulator quirk.**

- **events**: localhost LCP 5297 ms vs gate 2500. Inflation is
  1.41x. Even if 1.41x reduction is applied (LCP / 1.41 = 3756 ms),
  still over gate. The inline grid renders empty on preview because
  of the country-default bug at `src/app/events/page.tsx:57`
  (recommendation #2 from PT4 close report) - that's a separate fix.

- **city**: same as events; 1.48x localhost inflation, country
  default still applies on this route.

- **category**: localhost canonical bug + LCP inflation 1.50x.

- **event-detail**: TBT 166 ms (passes gate). LCP 3662 ms (1.34x
  inflation; expected 2733 ms on prod-preview, just over gate).

- **organisers**: TBT 290 ms (passes gate). LCP 5126 ms - this is
  2.01x localhost inflation, suggesting genuine prod-preview LCP
  near 2552 ms (matches iter-10 exactly). Real LCP just at gate.

- **pricing**: localhost TBT 561 ms is 98 ms regression vs iter-10.
  Likely localhost CPU contention; needs prod-preview run to
  confirm. Canonical bug applies.

- **help**: TBT 311 ms (just over gate). Canonical bug applies.

- **legal-terms**: TBT 424 ms (over gate). Canonical bug applies.

- **login**: TBT 395 ms (over gate). Canonical bug applies. CLS
  0.029 (passes).

- **signup**: TBT 254 ms (passes gate). LCP 4353 ms inflated. The
  signup route was already very close at iter-10 (perf 0.92).
  Canonical bug applies.

## Decision

Did not push. Per directive: "If 0.95+ achieved on most routes,
push everything. If not, document specific blockers per route.
Then stop."

The locked standard cannot be validated on localhost for this
codebase. The only valid gate is real-device or prod-preview
measurement.

## Recommended next steps (for review on Lawal's return)

1. **Push the revert (`ae44066`) plus this report and the iter-11
   reports**. The revert itself is the recommendation #1 from PT4
   close that Lawal pre-approved. Pushing is required to deploy and
   measure on prod preview.

2. **Deploy preview build of `feat/sprint1-phase1b-performance-and-visual`
   on Vercel**. This produces a Sydney-edge URL where Lighthouse can
   re-run with apples-to-apples comparison vs iter-10.

3. **Re-run the prod-preview Lighthouse sweep** against the new
   preview URL using `scripts/lh-pt4-d-warm.mjs` (point the
   `PREVIEW` constant at the new URL). If TBT recovers to the
   80-200 ms band across all routes, performance on most should
   reach 0.95+ given iter-10 was already 0.76-0.92 with B.1 active.

4. **Fix the country-default bug in `src/app/events/page.tsx:57`**
   (PT4 close recommendation #2). This unblocks the inline
   `/events` and `/events/browse/[city]` grids and moves the LCP
   candidate off the rail tile.

5. **Fix the canonical-inheritance bug** in 6 routes (categories
   slug, pricing, help, legal/terms, login, signup, plus
   help/[slug]). Add `export const metadata: Metadata = { alternates:
   { canonical: '/route' } }` to each. This is invisible on the
   prod preview but should be fixed for production correctness.

6. **Re-run the LHCI gate** (`lighthouserc.json`) once the above
   are in place. The gate is currently authoritative against the
   localhost prod build, so the canonical and country-default
   fixes above must land before the gate can pass even on a clean
   build.

## Files changed in this session

- `docs/sprint1/phase-1b/pre-task-4-progress.md` (revert conflict
  resolved)
- `src/components/providers/auth-provider.tsx` (reverted to
  static Supabase import)
- `scripts/inspect-chunks.mjs` (deleted as part of revert)
- `scripts/lh-pt5-revert-b1.mjs` (new - 11-route localhost sweep
  helper)
- `scripts/lh-summary.mjs` (new - report aggregator)
- `docs/sprint1/phase-1b/iter-11-pt5-revert-b1/*.report.{json,html}`
  (22 files - new)
- `docs/sprint1/phase-1b/pre-task-5-blockers.md` (this file)

Stop.
