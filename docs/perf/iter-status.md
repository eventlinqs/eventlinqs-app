# Mobile 95+ iteration status (M6.5 Phase 1B carry-over)

Date paused: 2026-05-02
Branch: feat/sprint1-phase1b-performance-and-visual
Last known-good commit on origin: e33a1dba6feed811d9fc35ea7f510c5559048994

## Why the loop stopped

Phase B verification was contaminated by Chrome process accumulation. Lighthouse runs invoked via the brand-sweep harness were not reaping their child Chrome instances. By the time iter 4 was being measured, `tasklist | findstr -i chrome` reported 72 simultaneous chrome.exe processes on the host. With that many Chromium instances competing for CPU, individual Lighthouse audits showed 30+ point performance score swings run-to-run, with home `/` flapping between 0.57 and 0.91 on identical code.

After killing all chrome.exe processes (PIDs reaped via `taskkill /F /IM chrome.exe /T`) and re-running 3 audits on identical HEAD, home `/` still showed 0.57, 0.61, 0.57. The host CPU had not yet recovered, and the audit data remained unusable. The user issued a stop directive: do not iterate further, do not revert iter 1 to iter 3, document and pause.

## Iterations the progress log records as genuine improvements (kept on origin)

These three iterations shipped in commits `bca5122` and `e33a1db` and are present on origin. Their improvement deltas were captured in `docs/perf/mobile-95-progress.log` before the measurement environment broke down.

### iter 1 (commit bca5122) - local AVIF hero raster, no Pexels

`src/lib/images/event-media.ts::getFeaturedHeroBackground` was simplified to always return the local `/images/hero/{slug}.jpg` raster as the hero LCP image, instead of routing Pexels through `/_next/image`. The Pexels round-trip was adding ~1100ms of cold-encoding to the LCP path on first request.

Recorded delta on `/`: LCP -47ms, TBT -288ms, SI -2953ms, Perf 0.74 to 0.85.
Recorded delta on `/events`: LCP -966ms, Perf 0.86 to 0.91.

### iter 2 (commit e33a1db, partial) - prefetch={false} on auth links

`src/components/layout/site-header-client.tsx` had four `<Link>`/`<Button>` instances pointing to `/login` and `/signup` (desktop topbar plus the mobile sheet). Default Next 15 Link prefetching was dragging the supabase auth chunk into every home and events shell. Adding `prefetch={false}` removed the chunk from the initial page load on routes where the user is unlikely to need it.

Recorded delta on `/`: TBT -200ish ms (avg 0.86 across 3 runs).
Recorded delta on `/events`: TBT dropped large; Lantern LCP regressed in some runs but the chunk reduction was the goal.

### iter 3 (commit e33a1db, completion) - sync popular rail in shell + vestigial use-client cleanup

Three changes shipped together:

- New `fetchPopularThisWeekPublic` fetcher in `src/lib/events/fetchers.ts` using `createPublicClient` (anon key, no cookies) wrapped in `unstable_cache` with hourly bucket key. This keeps ISR alive for `/events` because the prior dynamic `cookies()` call was forcing per-request rendering.
- New `EventsPopularSection` server component at `src/components/features/events/m5-events-popular-section.tsx` rendering synchronously (no Suspense fallback) so the first rail card lands in initial HTML and is discoverable as the LCP candidate.
- Vestigial `'use client'` removed from `src/components/features/events/event-card.tsx` and `src/components/layout/site-footer.tsx` (neither file had state, effects, or handlers).

Recorded delta on `/`: element render delay 2058ms to 84ms (large), Perf avg 0.86.
Recorded delta on `/events`: first rail card now confirmed in initial HTML (priorityHinted, requestDiscoverable, eagerlyLoaded all pass), supabase chunk no longer loads, Perf avg 0.86.

## Iterations attempted and reverted

### iter 4 - next/dynamic on HeroCarouselClient

`src/components/features/events/featured-event-hero.tsx` was modified to import `HeroCarouselClient` via `next/dynamic` so the client carousel hydrated lazily. The intent was to reduce TBT by deferring the carousel JS off the LCP path. Reverted in the same session because home `/` Perf appeared to drop from 0.85 to 0.57 over the next audit batch. We now know that drop coincided with the Chrome process accumulation contaminating the host, not with iter 4 itself, so the revert may have been incorrect. Currently NOT on origin.

### iter 5 - .avif source for hero raster

`src/lib/images/event-media.ts` was changed so `heroRasterFor` returned `${HERO_RASTER_DIR}/${slug}.avif` instead of `.jpg`. The intent was to skip the Next image optimiser re-encoding step since the source AVIFs already exist on disk. Reverted in the same session for the same reason as iter 4: home Perf appeared to regress, and we now suspect the regression was measurement noise from the contaminated host. Currently NOT on origin.

## Open question

Are the iter 1, iter 2, iter 3 fixes that DO sit on origin actually shipping the improvement they claim in the progress log? The progress log entries were written during the same audit runs that ultimately turned out to be host-contaminated. The deltas may be directionally correct but should be re-validated on a clean host (zero leftover Chrome processes, no other Lighthouse runs in flight) before we trust the numbers as a baseline for Phase C.

A second open question: the stop directive listed "dynamic carousel import" as one of the real improvements to keep, but the only change that fits that description was iter 4, which is currently reverted off origin. Either iter 4 should be re-applied and re-measured in a clean environment, or the directive was referring to a different change. This needs human clarification before any further code work.

## What is on origin right now

Commits on origin for the 95+ push, oldest first:

- bca5122 perf(home): always serve local AVIF for hero LCP, skip Pexels for featured background
- e33a1db perf(mobile-95): iter 2-3 - eliminate prefetched supabase chunk and stream first rail card in shell

HEAD matches origin. Working tree is clean. No pending edits.

## Do not resume without

1. A clean host measurement environment (zero leftover Chrome processes; no other Lighthouse runs concurrent).
2. Three back-to-back audit runs on bare e33a1db to establish a trustworthy baseline for `/` and `/events`.
3. A decision on iter 4 (re-apply or drop) and iter 5 (re-apply or drop) based on the user's reading of the discrepancy above.
