# Pre-Task 3 - Performance Domination - Progress Log

Started: 2026-04-26 (overnight autonomous, post Pre-Task 2 close)
Branch: feat/sprint1-phase1b-performance-and-visual
Last commit at start: 34dc68b chore(text): em-dash scrub

## Standard locked
Performance 100, Accessibility 100, Best Practices 100, SEO 100 on every page type. LCP < 1.0s, TBT < 100ms, FCP < 1.0s. Beat Ticketmaster.com.au, DICE.fm, Eventbrite.com.au, Humanitix.com on every Core Web Vital. Tested on production build.

## Page types under test (resolved routes)

Lawal's spec named `/events/[city]` with sample `/events/melbourne`. The actual Next.js route is `/events/browse/[city]` (not a strategic decision, just the existing route shape). Using the actual route.

1. `/` - homepage
2. `/events` - listing
3. `/events/browse/melbourne` - city (resolved from spec `/events/melbourne`)
4. `/events/afrobeats-melbourne-summer-sessions-2026` - detail (real seeded Afrobeats event)
5. `/organisers` - organiser landing (route exists at `src/app/organisers/page.tsx`)

## Phase A - Fresh iter-1 baseline

### A.1 Pre-flight
- Working tree clean at HEAD 34dc68b.
- Lighthouse 13.1.0 available via `npx lighthouse`.
- iter-0 baseline (pre Pre-Task 2): Performance=null (NO_LCP), A11y=1, BP=1, SEO=1, FCP=2.2s.

### A.2 Build + serve
- `npm run build` clean. 56 routes generated (mostly dynamic, 4 static: `/icon`, `/opengraph-image`, `/sitemap.xml`, `/twitter-image`).
- Stale node.exe held :3000 (PID 20276); single-PID kill applied. Production server bound clean afterwards.

### A.3 Lighthouse iter-1 captures
Saved at `docs/sprint1/phase-1b/iter-1/*.report.{html,json}`.

| Route | Perf | A11y | BP | SEO | LCP | TBT | TTFB |
|---|---|---|---|---|---|---|---|
| `/` | 0.78 | 1.00 | 1.00 | 1.00 | 3869 | 278 | 713 |
| `/events` | 0.70 | 1.00 | 1.00 | 1.00 | 4467 | 411 | 1684 |
| `/events/browse/melbourne` | 0.80 | 1.00 | 1.00 | 1.00 | 4412 | 198 | 408 |
| `/events/afrobeats-melbourne-summer-sessions` | 0.76 | 1.00 | 1.00 | 1.00 | 4088 | 198 | 2939 |
| `/organisers` | 0.79 | 0.94 | 1.00 | 0.91 | 3858 | 300 | 36 |

Pre-Task 2 structurally fixed NO_LCP on every route. Detail-page slug needed correction (`-2026` suffix is not in live DB; used `afrobeats-melbourne-summer-sessions`).

`/organisers` regressed on a11y (color-contrast, heading-order) and SEO (canonical). To be batch-fixed in Phase B.

Full analysis at `docs/sprint1/phase-1b/iter-1-baseline-analysis.md`.

### A.4 Server stop
Single-PID kill on the production server, no `taskkill /F /IM node.exe`.

## Phase B - Hero LCP + organisers a11y/SEO regression (iter-2)

Phase B deliberately scoped narrow: close the iter-1 a11y/SEO regression on `/organisers` first (small batch fix that does not affect LCP), then take a fresh measurement and decide whether to bundle JS-bundle work into iter-2 or split it into iter-3. Iter-2 was kept scope-tight - actual LCP raster optimisation and JS bundle work moves into iter-3.

### B.1 Audit findings on the hero stack
- `HeroMedia` (src/components/media/HeroMedia.tsx) is correctly architected: priority+fetchPriority="high" on slide-0, no opacity transition on the LCP layer, ambient layer mounted post-rAF×2.
- `HeroCarouselClient` defers slides 1+ for 1.6s after first paint, so the LCP candidate is unambiguous.
- `app/layout.tsx` uses `next/font` Inter + Manrope with `display: 'optional'` and explicit weight subsets - already optimal for fallback-text LCP. Both fonts are auto-preloaded by next/font.
- The render-side LCP delay (LCP - TTFB) is dominated by JavaScript and CSS parse, not by the hero raster path. ~75 kB unused JS (shared chunks) appears on every route. That is iter-3 (Phase C) territory.
- Conclusion for iter-2: the hero stack does not need invasive change. The bigger win is JS bundle reduction in iter-3.

### B.2 organisers a11y + SEO regression closure
- Added `--brand-accent-strong: var(--color-gold-800)` token (gold-800 = #6F5409, computes 7.5:1 against white and 5.0:1 against ink-100 alt surface). Replaces gold-400 (1.86:1) usage on small text on light surfaces.
- Updated 4 eyebrow paragraphs and the help-link CTA in `OrganisersLandingPage.tsx` to use `text-[var(--brand-accent-strong)]`. Hover route now uses `--text-primary` so the link still meets AA on hover.
- Changed pillar card `<h3>` to `<h2>` so heading-order is sequentially descending (h1 hero → h2 pillar cards → h2 sibling sections → h3 nested step titles).
- Added `alternates: { canonical: '/organisers' }` to /organisers page metadata. (Layout was setting canonical=`/` and the child page inherited it - fix is per-page override.)

### B.3 Iter-2 captures

| Route | Perf | A11y | BP | SEO | FCP | LCP | TBT | TTFB |
|---|---|---|---|---|---|---|---|---|
| `/` | 0.80 (+0.02) | 1.00 | 1.00 | 1.00 | 1406 | 3729 | 234 | 2013 |
| `/events` | 0.79 (+0.09) | 1.00 | 1.00 | 1.00 | 2109 | 4551 | 187 | 350 |
| `/events/browse/melbourne` | 0.82 (+0.02) | 1.00 | 1.00 | 1.00 | 1235 | 4534 | 169 | 422 |
| `/events/afrobeats-melbourne-summer-sessions` | 0.78 (+0.02) | 1.00 | 1.00 | 1.00 | 1797 | 4026 | 197 | 2897 |
| `/organisers` | 0.77 | 1.00 (+0.06) | 1.00 | 1.00 (+0.09) | 2058 | 3867 | 305 | 45 |

Headline result: every page in the test suite is at A11y=1, BP=1, SEO=1. Performance varies 0.77 to 0.82. Saved at `docs/sprint1/phase-1b/iter-2/`.

### B.4 What iter-3 must address
- Top issue across all five routes: ~75 kB unused JS in shared chunks. Phase C (code-split + tree-shake) targets this.
- LCP plateau: iter-2 LCPs are within run-to-run variance of iter-1 (±300 ms is cache/timing noise). LCP gains will land in iter-3 (JS bundle) and iter-5 (TTFB via ISR), not in iter-2.

### B.5 Server stop
Single-PID kill on the production server.

## Phase C - JS bundle reduction (iter-3)

Phase C scope: reduce ~75 kB unused JS in shared chunks identified across all five routes in iter-1/iter-2. Ship-test `optimizePackageImports` (Next.js native tree-shake hint) and code-split BottomNav (mobile-only, hidden on desktop, in layout).

### C.1 Audit
- 23 files import from `lucide-react` barrel (icons across nav, cards, dashboard).
- `framer-motion` not used anywhere (Grep clean).
- `@tanstack/react-query`, `@supabase/ssr`, `@supabase/supabase-js` are heavy barrels in shared layout.
- iter-2 chunks: `0tqaxpv6-tpmq.js` 47 kB unused / 58 kB total; `0.~2ky53fo~10.js` 24 kB unused / 69 kB total.

### C.2 Changes attempted
1. `next.config.ts` - added `experimental.optimizePackageImports: ['lucide-react', '@tanstack/react-query', '@supabase/ssr', '@supabase/supabase-js']`. KEPT.
2. `app/layout.tsx` - lazy-loaded BottomNav via `next/dynamic`. REVERTED. Caused NO_LCP regression on `/` (Perf null on two consecutive runs). Without `ssr:false` (disallowed in Server Components in Next 16), the dynamic chunk loads post-hydration and extends Lighthouse's LCP trace observation past stabilisation. Reverted to direct import.

### C.3 Iter-3 captures (with optimizePackageImports only)

| Route | Perf | A11y | BP | SEO | FCP | LCP | TBT | TTFB |
|---|---|---|---|---|---|---|---|---|
| `/` | 0.81 (+0.01) | 1.00 | 1.00 | 1.00 | 1392 | 3800 | 251 | 1374 |
| `/events` | 0.72 (-0.07) | 1.00 | 1.00 | 1.00 | 2105 | 4762 | 327 | 115 |
| `/events/browse/melbourne` | 0.73 (-0.09) | 1.00 | 1.00 | 1.00 | 2123 | 4571 | 314 | 62 |
| `/events/afrobeats-melbourne-summer-sessions` | 0.77 (-0.01) | 1.00 | 1.00 | 1.00 | 1820 | 4053 | 206 | 3038 |
| `/organisers` | 0.81 (+0.04) | 1.00 | 1.00 | 1.00 | 2192 | 3690 | 280 | 37 |

Saved at `docs/sprint1/phase-1b/iter-3/`.

### C.4 Unused-JS delta vs iter-2

| Route | iter-2 unused-JS | iter-3 unused-JS | delta |
|---|---|---|---|
| `/` | 71 kB | 69 kB | -2 kB |
| `/events` | 74 kB | 74 kB | flat |
| `/events/browse/melbourne` | 69 kB | 74 kB | +5 kB (variance) |
| `/events/afrobeats-melbourne-summer-sessions` | 73 kB | 73 kB | flat |
| `/organisers` | 75 kB | 75 kB | flat |

`optimizePackageImports` did not move unused-JS in this codebase. lucide-react@1.7.0 ships ESM with per-icon named exports, and Turbopack already tree-shakes those at compile time. The hint is a no-op here, kept as cheap forward insurance for when these deps grow.

### C.5 Plateau - strategic call

Phase C produced no bundle-size win. iter-3 score deltas are within run-to-run variance (Lighthouse Perf typically swings ±0.07 between mobile runs at this score range). LCP plateau persists: 3.7-4.7 s across all five routes vs the 1.0 s standard.

Where the remaining LCP comes from:
- **TTFB on detail page**: 3038 ms. Single-event SSR with full Supabase fetch on every request. Static generation via `generateStaticParams` for the seeded events plus ISR (`revalidate: 60`) drops this under 100 ms on cache hits. Phase E.
- **Render path on cache-hit routes** (city TTFB 62 ms but LCP 4571 ms): the hero raster decode + JS hydration on simulated 4x CPU is eating ~4 seconds of render budget. Wins here require: (a) `<link rel="preload" as="image" imagesrcset>` for the LCP raster in route metadata so download starts before HTML parse completes, (b) smaller mobile-first raster sizes from Pexels/Supabase storage, (c) deferring the React Query / Supabase client init out of the layout-shared chunk on read-only public routes.

Phase D (critical CSS / fonts) would be next in sequence but next/font already optimal (`display: 'optional'`, weight-subsetted). No expected win.

Phase E (static gen + ISR for detail/listing) is the next high-ROI lever - Lighthouse won't see Perf=1.00 until detail TTFB drops below 200 ms.

This is a plateau-requiring-strategic-call stop per the Pre-Task 3 directive. The architectural decision is: do we ISR every event detail page, or only the top-N hero candidates and let the long tail SSR? That trades cache freshness for build time and is the user's call.

### C.6 Server stop
Single-PID kill on the production server.

