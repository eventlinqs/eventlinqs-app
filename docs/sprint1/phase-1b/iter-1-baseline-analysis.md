# Pre-Task 3 Iter-1 Baseline - Analysis

Captured: 2026-04-26 (immediately post Pre-Task 2 close, HEAD 34dc68b)
Server: `npm run start` against `npm run build` output, localhost:3000
Lighthouse: 13.1.0, mobile form-factor (default Moto G Power emulation, 4x CPU throttle, simulated 3G)

## Standard reminder

Performance 100 / A11y 100 / BP 100 / SEO 100. LCP < 1.0s, TBT < 100ms, FCP < 1.0s. Beat Ticketmaster.com.au, DICE.fm, Eventbrite.com.au, Humanitix.com on Sydney/London/NYC.

## Score table (iter-1)

| Route | Perf | A11y | BP | SEO | FCP (ms) | LCP (ms) | TBT (ms) | SI (ms) | CLS | Runtime err |
|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 0.78 | 1.00 | 1.00 | 1.00 | 2161 | 3869 | 278 | 4224 | 0.000 | none |
| `/events` | 0.70 | 1.00 | 1.00 | 1.00 | 2061 | 4467 | 411 | 4672 | 0.010 | none |
| `/events/browse/melbourne` | 0.80 | 1.00 | 1.00 | 1.00 | 1965 | 4412 | 198 | 2740 | 0.010 | none |
| `/events/afrobeats-melbourne-summer-sessions` | 0.76 | 1.00 | 1.00 | 1.00 | 2144 | 4088 | 198 | 6280 | 0.000 | none |
| `/organisers` | 0.79 | 0.94 | 1.00 | 0.91 | 1796 | 3858 | 300 | 4249 | 0.000 | none |

(iter-0 was Performance=null on `/` due to NO_LCP. Pre-Task 2 structurally fixed that: every route now reports a real LCP.)

## Variance vs target

- LCP target 1000ms - all routes 3.86-4.47s (3.9x to 4.5x over).
- FCP target 1000ms - all routes 1.80-2.16s (1.8x to 2.2x over).
- TBT target 100ms - 4 of 5 routes over (198-411ms).
- CLS clean (0-0.010 well under 0.1).
- Categories: A11y/BP/SEO are 100 on 4 of 5 routes; `/organisers` regressed.

## Server response time (TTFB)

| Route | TTFB |
|---|---|
| `/organisers` | 36 ms |
| `/events/browse/melbourne` | 408 ms |
| `/` | 713 ms |
| `/events` | 1684 ms |
| `/events/afrobeats-melbourne-summer-sessions` | 2939 ms |

The detail page eats ~2.9s before a single byte of HTML lands - that alone caps LCP > 3s no matter what we do client-side. `/events` at 1.7s is similar but milder. Phase E (static generation + ISR) and Phase F (edge caching) are the levers here.

## Cross-route problem - unused JavaScript

Every route reports ~73-76 kB of unused JavaScript at evaluation time, with potential savings 450-880ms. The shared chunks are the same set on every page:

| Chunk | Transfer | Note |
|---|---|---|
| `0.~2ky53fo~10.js` | 71 kB | largest single script |
| `0tqaxpv6-tpmq.js` | 60 kB | |
| `0gyanf0v5_rzs.js` | 29 kB | |
| `0iutcn.dwsl.v.js` | 20 kB | |

Two woff2 font files load on every route (49 kB + 25 kB = 74 kB) competing with the LCP raster for early bandwidth.

## Top issues by route

### `/` (home, Perf 0.78, LCP 3869ms)
1. server-response-time: 713 ms (target < 200 ms). Dynamic SSR.
2. unused-javascript: 73.8 kB / 450 ms savings. Same shared chunks below.
3. LCP image is the priority hero raster (Pexels via `/_next/image`) - good. Optimisation here is image format + preload, not architecture.

### `/events` (listing, Perf 0.70, LCP 4467ms)
1. server-response-time: 1684 ms. Worst non-detail route. Likely fetching full event list per request.
2. TBT 411 ms - highest of all five routes. Hydration + listing logic.
3. unused-javascript: 76 kB / 450 ms savings.

### `/events/browse/melbourne` (city, Perf 0.80, LCP 4412ms)
1. unused-javascript: 76 kB / 600 ms savings.
2. LCP 4412 ms despite TTFB only 408 ms - render path is the bottleneck (image decode + hydration).
3. Speed Index 2740 ms - meaningfully better than other listing pages, suggests city tiles render faster.

### `/events/afrobeats-melbourne-summer-sessions` (detail, Perf 0.76, LCP 4088ms)
1. server-response-time: 2939 ms. Critical. SSR for one event page should not take 3s.
2. Speed Index 6280 ms - by far the worst, suggests above-fold completion stalls long after FCP.
3. unused-javascript: 74.7 kB / 500 ms savings.

Note: original Lawal-supplied slug `afrobeats-melbourne-summer-sessions-2026` 404s. Live DB has `-2026` stripped (probably a seed edit). Used the live slug.

### `/organisers` (organiser landing, Perf 0.79, LCP 3858ms)
1. unused-javascript: 76.3 kB / 880 ms savings - largest unused-JS savings of any route.
2. **A11y regression** (0.94, was 1.00 on iter-0): color-contrast and heading-order failing.
3. **SEO regression** (0.91, was 1.00 on iter-0): canonical missing.
4. TTFB 36 ms - effectively static, so LCP 3858 ms is purely render-side.

## Phase B priorities (LCP)

Top-3 fixes inferred from this baseline:
1. Hero raster: ensure AVIF/WebP, narrowest sensible `sizes`, `<link rel="preload" as="image" imagesrcset>` so the LCP image starts downloading before the JS bundle. Verify slide-0 is not opacity-faded in.
2. Font weight: 74 kB of woff2 ahead of LCP is heavy. Subset to Latin only, add `font-display: swap`, `<link rel="preload">` only the LCP-text weight.
3. Above-fold JS: hero carousel client component is downloading on first paint. Consider `loading="lazy"` for non-LCP slides and code-split the carousel logic so the first slide can render server-side and the JS arrives as a hydration patch.

## Phase C priorities (JS bundle)

73-76 kB unused on every page = a shared barrel is dragging dead code in. Suspects:
- `@/components/media` barrel re-exports five components plus three constant tables; only the components a page renders should ship.
- `framer-motion`, `lucide-react` icon barrels - notorious for over-bundling without modular imports.
- Dashboard / organiser-only client-side code potentially leaking into public pages via shared layout.

## Phase D priorities (CSS + fonts)

Two woff2 fonts (74 kB combined) load early. Likely a `Noto Sans` + a display font. Plan: confirm via `next/font` config, restrict to subset Latin, drop weights we don't actually use above the fold.

## Phase E priorities (static gen + ISR)

- Detail page TTFB 2939 ms - move to ISR with a tight `revalidate`. Target sub-100ms TTFB on cache hits.
- `/events` listing TTFB 1684 ms - same treatment. Filters can be client-side.
- `/` TTFB 713 ms - mostly static; should ISR.

## Phase F priorities (edge caching)

Once TTFB is solved by ISR, layer `Cache-Control: public, s-maxage=60, stale-while-revalidate=600` on listing routes. Detail pages need shorter SWR (event mutates).

## /organisers a11y/seo regression

Small batch fix piggybacking on Phase B:
- Add `<link rel="canonical" href="/organisers" />` via the route's metadata.
- Resolve color-contrast (likely a gold-on-light combination introduced when page was restyled).
- Fix heading-order (probably an `h3` before `h2` somewhere in the section structure).

## Iteration plan

| Iter | Phase | Target |
|---|---|---|
| iter-2 | Phase B + organisers a11y/seo | LCP <= 2000 ms across all routes; A11y/SEO=1 on organisers |
| iter-3 | Phase C | TBT <= 150 ms; main-thread JS reduced 30%+ |
| iter-4 | Phase D | FCP <= 1500 ms |
| iter-5 | Phase E | TTFB <= 200 ms on listing + detail |
| iter-6 | Phase F | TTFB <= 100 ms on cached |
| iter-7 | Phase G | All five routes Perf=1.00, all CWV under target |
| iter-8 | Phase H | Beat all four Australian competitors |

## Reports

All five HTML + JSON reports are saved at `docs/sprint1/phase-1b/iter-1/*.report.{html,json}` for diff against later iters.
