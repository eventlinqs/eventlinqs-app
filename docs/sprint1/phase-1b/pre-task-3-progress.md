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



