# Iter 1 close + Phase B pause

Date: 2026-05-02
Branch: feat/sprint1-phase1b-performance-and-visual
HEAD when paused: dd0c529 plus docs only (working tree iter 1 reverted)

## Iter 1 result: REVERT

**Change attempted**: render slide 0 of the home hero as a server-rendered shell (`FeaturedHeroStaticShell`) and defer `HeroCarouselClient` via `next/dynamic({ ssr: false })`. Intent was to remove carousel hydration cost from the LCP path.

**Files added (then deleted)**:

- `src/components/features/events/featured-hero-static-shell.tsx`
- `src/components/features/events/hero-carousel-deferred.tsx`

**Edits made (then reverted)**:

- `src/components/features/events/featured-event-hero.tsx`: import swap from `HeroCarouselClient` to `HeroCarouselDeferred`, JSX swap.

**Measurement (median-of-5, mobile, local prod)**:

| Route | Baseline perf | Iter 1 perf | Delta | TBT delta | Verdict |
|---|---|---|---|---|---|
| `/` | 62 (range 5pts) | 33 (range 9pts) | -29 | +1130ms | REGRESSION |
| `/events` | 88 (range 13pts) | 80 (range 10pts) | -8 | similar | REGRESSION |
| `/about` | 88 (range 12pts) | 96 (range 14pts) | +8 | similar | NOISE (untouched route, CONTAMINATED, +8 not credible) |

**Why it regressed**: The plan was to remove carousel hydration cost from the LCP path. In practice, the static shell sits inside a client wrapper (`HeroCarouselDeferred`) that imports it directly. Server output puts the static shell HTML in the document, but on hydration the entire wrapper plus its imported static shell is treated as part of the client bundle. After hydration, the dynamic import of `hero-carousel-client` triggers a chunk fetch, and once it resolves the static shell unmounts and the carousel mounts from scratch. Net effect: hydrate the shell, fetch a new chunk, mount the carousel, run all carousel state initialisation a second time. TBT went from 2253ms baseline to 3367-3990ms across all 5 iter 1 runs.

The mistake was assuming `next/dynamic({ ssr: false, loading: ... })` would treat the `loading` content as a free server-rendered fallback. In an App Router setup with the deferred wrapper marked `'use client'`, the wrapper itself owns the client boundary and its imported "static" shell rides along on hydration.

A correct version of this iteration would need either (a) a server component that conditionally renders `<HeroCarouselClient>` without crossing through a client wrapper at all, or (b) a real "lazy hydrate" primitive, which Next.js does not currently expose.

**Decision**: REVERT.

## Why Phase B is now paused: measurement environment unreliable

After reverting iter 1, ran 5 fresh runs on `/` to confirm we land back on baseline:

| Run | Throttling | Perf | LCP | TBT |
|---|---|---|---|---|
| 1 | devtools | 60 | 3154ms | 3580ms |
| 2 | devtools | 55 | 3816ms | 4350ms |
| 3 | devtools | 62 | 2809ms | 4179ms |
| 4 | simulate | 86 | 3893ms | 140ms |
| 5 | devtools | 64 | 2690ms | 3556ms |

Median perf 62 matches the original baseline, but range is **31 points** (vs 5 points at baseline) and TBT bounces between 140ms and 4350ms on identical code. Run 4 alone uses simulate (Lantern) throttling and reports 86 perf with 140ms TBT, which means the underlying code might already be at 86 perf. The other 4 runs fall back to devtools (real CPU emulation) and report 55-64 perf with 3500-4400ms TBT.

The throttling method is producing the variance: simulate vs devtools disagree by 30+ points and 4000ms+ TBT on the same HEAD. The script falls back to devtools when simulate emits NO_LCP, and that fallback is happening on most runs to `/` because `HeroCarouselClient`'s deferred slide-1+ mount delays a stable LCP candidate.

This is the same measurement-environment-failure stop condition that paused the prior session (see `docs/perf/iter-status.md`). With 30+ point swings on identical code, no iteration can be evaluated against the no-regression rule (Rule 7) with confidence. Tried iteration 1 still produced an unambiguous regression because the magnitude (-29 points across all 5 runs, +1130ms TBT) exceeded the noise floor. But for any iteration aiming at +5 to +10 points, that signal sits inside the noise band and cannot be distinguished from environmental drift.

Per Mission Rule 6 (stop conditions), pausing here.

## What needs to happen before Phase B can resume

1. **Vercel preview environment**: Mission Rule 4 specifies Vercel preview as the primary measurement environment with local as fallback. The Vercel CLI is not currently installed on this host (per session-start hook). Installing `vercel` and linking the project would let us measure on Vercel preview, where the runtime CPU is consistent.

2. **Local environment hygiene**: between baseline and post-revert recheck, the host went from a 5-point Lighthouse range to a 31-point range on identical code. Something on the host (background processes, thermal, disk I/O, accumulated zombie node/chrome processes from prior runs) is increasing CPU pressure. The reaping in `perf-median.mjs::ensureClean` only addresses chrome.exe, not stray node.exe processes left over from interrupted prod servers.

3. **Throttling consistency**: Lantern (simulate) NO_LCP on `/` keeps forcing the script into devtools mode for that route. Devtools throttling reports 55-64 perf, simulate reports 86 perf. We need to choose ONE method and stick with it for iteration comparisons. Adding an explicit `--throttling=devtools` flag to the harness would force consistency.

## What is on origin right now

HEAD: dd0c529 (Phase 0 docs landed)
Working tree: docs only (Phase A baseline + Iter 1 close docs). No source changes.

## Iter 1 lesson for the next attempt

Defer-hydrate via `next/dynamic({ ssr: false, loading: <staticShell/> })` from a `'use client'` wrapper does NOT achieve "render shell on server, mount carousel after LCP". It achieves "render shell on server, hydrate the shell on client, then re-render twice with a chunk fetch in between". The right approach for static-paint-first hydration deferral in Next.js App Router is not yet obvious and may require either:

- Making `featured-event-hero.tsx` itself decide between `<FeaturedHeroStaticShell/>` and `<HeroCarouselClient/>` based on a server-side flag (e.g., a probabilistic A/B or a feature gate). The carousel is ONLY rendered when the user has interacted (mouseenter, scroll, keyboard) — but Next 16 does not expose a "has user interacted yet" primitive on the server.
- Using a service-worker-mediated swap. Excessive for this surface.
- Accepting that `HeroCarouselClient` hydration cost is a fixed cost and reducing the work it does internally (fewer state hooks, defer the auto-advance interval setup until first user input).

The third option is most actionable. A future iter could rewrite `HeroCarouselClient` to start with NO state hooks (no useState, no useEffect, no useSyncExternalStore) and only initialise them when the user mouseenters the hero region or scrolls past it. The first paint then includes a "frozen" carousel that looks identical to slide 0.
