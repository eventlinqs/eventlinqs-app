# Phase A baseline (median-of-5)

Date: 2026-05-02
Environment: local prod (`npm run start`) on http://localhost:3000
Harness: `scripts/perf-median.mjs --runs=5 --routes=/,/events,/about`
Throttling: simulate (with devtools fallback when Lantern returns NO_LCP)
Form factor: mobile (Pixel 5 emulation, 375x812 @ DPR 3)
HEAD: dd0c529 (Phase 0 docs landed)
Output JSON: `docs/perf/v2/baseline-median5.json`

## Median results

| Route | Perf (median) | LCP | FCP | TBT | SI | CLS | Range | Status |
|---|---|---|---|---|---|---|---|---|
| `/` | 62 | 3198ms | 2127ms | 2253ms | 3368ms | 0.000077 | 5pts | OK |
| `/events` | 88 | 3859ms | 1370ms | 92ms | 1373ms | 0 | 13pts | CONTAMINATED |
| `/about` | 88 | 3623ms | 1069ms | 143ms | 2088ms | 0 | 12pts | CONTAMINATED |

`/events` and `/about` runs 2-3 spiked (cold cache effect after server restart). Runs 1, 4, 5 were tightly clustered. Median is therefore representative of warm-cache behavior, but the range flags noise.

`/` is coherent across all 5 runs (perf 60-65). All 5 runs fell back to devtools throttling because Lantern's simulate mode returned NO_LCP (the first paint is likely too late or the LCP candidate did not reach the trace processor).

## LCP element selectors

The `audits['largest-contentful-paint-element']` audit was not produced under `onlyCategories: ['performance']`. The `lcpElement` field is null for all routes in the JSON. Future iterations will rely on the prior heromedia-audit findings:

- `/` LCP element = first slide of `featured-event-hero.tsx` (raster image inside `HeroCarouselClient`)
- `/events` LCP element = first card image in popular rail (Pexels via `/_next/image`)
- `/about` LCP element = TBD (likely the hero h1 or the hero raster, since CLS is zero and TBT is small)

## Bottleneck per route

### `/` (perf 62)

Dominant bottleneck: **TBT 2253ms**, plus LCP 3198ms with FCP at 2127ms. TBT alone consumes most of the missing perf points.

Hydration cost is the lever. The Phase 0 use-client audit identified `HeroCarouselClient` as the primary target: the first slide is rendered inside the client boundary, so the LCP image cannot paint until the carousel hydrates. The carousel uses `useState`, `useEffect`, `useSyncExternalStore`, refs, key handlers, and a deferred ambient layer mount, all of which run after hydration on a 4x CPU slowdown emulated mobile.

Decision: Phase B Iter 1 targets `featured-event-hero.tsx`. Lift the first slide's `<HeroMedia>` out of `HeroCarouselClient` and render it as a server component. The carousel hydrates after LCP and replaces the static layer.

### `/events` (perf 88, contaminated)

Dominant bottleneck: **LCP 3859ms** (median across runs 1-5; range 3855-6159ms). TBT is healthy (92ms). The hydration story is fine.

Per the heromedia-audit, the LCP element is the first card image from Pexels going through `/_next/image`. Pexels cold-encoding adds ~1100ms on first request. This is not addressable through hydration cleanup. Mitigations:

1. Replace the rail's first card cover with a local raster (analogous to home iter 1).
2. Pre-warm Pexels through `/_next/image` at build time.
3. Skip the first card's image optimization round-trip with a same-origin CDN backstop.

Decision: parked behind Iter 1 outcome on `/`. If `/` clears 95 with hydration alone, revisit `/events` with iter focused on either pre-warm or local raster swap.

### `/about` (perf 88, contaminated, control)

Mission Rule 5 lists `/about` as the control route. Median 88 is its baseline. Iterations must NOT push `/about` more than 2 points below 88 (i.e., 86 floor). LCP 3623ms suggests the about page has its own large hero or expensive text rendering. Not a target. Just a guardrail.

## Methodology notes

- Chrome reaping per run is implemented in `perf-median.mjs::ensureClean`. Tasklist verified zero chrome.exe processes before each run. Reaping uses `taskkill /F /IM chrome.exe /T` inside the script subprocess, NOT in the main shell session (avoids the bulk-taskkill stall documented in `iter-status.md`).
- MSYS path conversion (Git Bash on Windows) mangles `--routes=/about` into `--routes=C:/Program Files/Git/about`. Fix: prefix the node command with `MSYS_NO_PATHCONV=1`. This is a Windows-bash gotcha, not a script bug.
- `/` falls back to devtools throttling because simulate mode emits NO_LCP. devtools throttling is a heavier real-CPU emulation, so the perf score is conservative. If a future iteration brings simulate back to producing LCP, scores will rise mechanically without underlying improvement. To compare apples to apples, prefer the same throttling method across iterations on `/`.
