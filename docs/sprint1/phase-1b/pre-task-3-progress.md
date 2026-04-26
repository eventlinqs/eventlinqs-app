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

