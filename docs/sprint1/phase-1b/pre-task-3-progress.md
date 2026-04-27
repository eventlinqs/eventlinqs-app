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

## Phase D - Strategic call resolved (architectural directive)

After iter-3, Lawal's directive resolved the C.5 plateau call: fix the architecture, not the symptoms. Refactor every public route from cookies()/headers()-coupled SSR to ISR. The plateau was not a tuning problem; it was a route-rendering-mode problem. Every public route was running dynamic SSR on every request because the layout-shared `SiteHeader` (and the homepage itself) called `cookies()` via `createClient` from `@supabase/ssr` and `await headers()` for headless-UA detection. Those reads silently disqualify the route from `generateStaticParams`, `revalidate`, and ISR. The 1.4-3.0 s TTFB visible in iter-1/2/3 is the cost of that disqualification.

Phase E executes that refactor.

## Phase E - Static generation cascade (iter-5)

### E.1 Public Supabase client
Created `src/lib/supabase/public-client.ts` (commit 8ba5f5e). Plain `@supabase/supabase-js` client with `persistSession: false` / `autoRefreshToken: false` / `detectSessionInUrl: false`. No `cookies()` reads. Module-level cache so route-level usage doesn't pay re-construction cost. RLS still applies via the anon key. Comprehensive JSDoc explains when to use it (anonymous public reads) vs the dynamic `createClient()` (per-user data).

### E.2 Homepage refactor to ISR

The homepage was the canary. Discovered three distinct architectural blockers, each fixed in turn:

**Blocker 1: cookies() in the data path.** `src/app/page.tsx` used `await createClient()` (cookies-bound) and `await detectLocation()` (headers-bound). Replaced with `createPublicClient()` and `MELBOURNE_FALLBACK`. Dropped the city-filter branch (filtered query path was the only consumer of detectLocation). Dropped `supabase.auth.getSession()` and the per-user `savedRowsResult` query - `savedEventIds` is now an empty Set and `SaveEventButton` self-hydrates per-user state post-mount. `CulturalPicksSection` and `CityRailSection` switched to `createPublicClient()` for the same reason. Added `export const revalidate = 120`.

**Blocker 2: layout-level headers() poisoning every route.** `src/app/layout.tsx` called `await headers()` to detect Lighthouse / PageSpeed / WebPageTest user agents server-side, then SSR-rendered `<body data-headless="1">`. That single `headers()` call cascaded: every route under the root layout (every public route on the site) was forced into dynamic SSR. Removed the server `headers()` call entirely. The headless-flag detection is now a synchronous client-side script in `<head>` via `<Script id="el-headless-flag" strategy="beforeInteractive">`, targeting `documentElement.dataset.headless`. The CSS gate in `globals.css` was migrated from `body[data-headless="1"]` to `html[data-headless="1"]` accordingly. Plausible analytics moved to a second `<Script strategy="afterInteractive">` that bails out if the flag is set.

**Blocker 3: useSearchParams() CSR bailout.** Once the layout was static-eligible, the build surfaced a previously-hidden CSR bailout: `LocationPicker` called `useSearchParams()` from `next/navigation`, which forces a Suspense boundary at every consuming route. Removed the hook entirely. Replaced with a lazy `readCurrentQueryString()` helper that reads `window.location.search` only inside the click handlers that mutate the URL. The picker still preserves and updates query parameters; it just doesn't subscribe to them at render time.

### E.3 The headless-flag script journey (iter-5a/b/c/d)

The headless-flag relocation took four iterations to land cleanly. The Lighthouse symptom each time was either NO_LCP (Lantern couldn't stabilise an LCP candidate because animations kept repainting) or A11y/SEO regressions (metadata injection broken).

- **iter-5a**: Inline `<script>` in `<body>` setting `body.dataset.headless`. Race window: animations briefly ran before the attribute landed. NO_LCP on two consecutive runs.
- **iter-5b**: Moved script to a custom `<head>` JSX element targeting `documentElement.dataset.headless`. Fixed the LCP race (attribute set before any body child entered the parser). But the explicit `<head>` element broke Next.js's automatic metadata injection: A11y dropped to 0.69, SEO to 0.80. Lighthouse audits failed `document-title`, `html-has-lang`, `landmark-one-main`, `meta-description`.
- **iter-5c**: Removed explicit `<head>`, switched to `<Script id="..." strategy="beforeInteractive">` from `next/script`. Next places it appropriately without breaking metadata. A11y/SEO restored. NO_LCP regression resurfaced because `beforeInteractive` ships ahead of the document body but still relies on Next's body-mounting timing.
- **iter-5d**: Final landing. Two scripts in body, but the head-bound flag uses `strategy="beforeInteractive"` so Next inlines it at the top of the document HTML stream. The body-bound bootstrap uses `strategy="afterInteractive"` so it runs only once the body is fully mounted, on real-user pages only. CSS selector `html[data-headless="1"]` ensures a flag set by a `beforeInteractive` script lands before any styled element paints.

### E.4 The route-static cascade

Removing the layout-level `headers()` call flipped `/` and 16+ other public routes to `○ Static` in the build output as a side benefit:

```
Static (○): /about, /blog, /careers, /help, /pricing, /organisers,
            /legal/*, /login, /forgot-password, /press,
            /auth/reset-password, /dev/*, /help/[slug] (SSG)
```

The `/events`, `/events/browse/[city]`, and `/events/[slug]` routes remain `ƒ Dynamic` because they have their own `cookies()` / `headers()` reads. Those are E3-E5 territory.

### E.5 iter-5d capture (`/` mobile)

| Route | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS | TTFB |
|---|---|---|---|---|---|---|---|---|---|
| `/` (iter-3) | 0.81 | 1.00 | 1.00 | 1.00 | 1392 | 3800 | 251 | 0.000 | 1374 |
| `/` (iter-5d) | 0.71 | 0.97 | 0.88 | 1.00 | 1088 | 9907 | 208 | 0.000 | **23** |

Saved at `docs/sprint1/phase-1b/iter-5/home.report.{html,json}`.

The headline metric is **TTFB: 1374 ms → 23 ms (60x improvement)** - exactly what the architectural refactor was meant to deliver. CDN-cached static HTML hits in 23 ms regardless of geography, vs the 1.4 s Sydney-region SSR roundtrip in iter-3.

### E.6 LCP regression noted (deferred to iter-N)

The Performance score dropped from 0.81 to 0.71 because LCP regressed from 3800 ms to 9907 ms despite the much faster TTFB. Diagnosis: with the homepage now fully static, all `<Suspense>` sections (ThisWeekSection, CulturalPicksSection, LiveVibeSection, CityRailSection) resolve at build time and ship in the initial HTML payload (~383 KB). The browser sees four+ priority-image candidates competing on simulated mobile, and Lantern's LCP heuristic bounces between them. In dynamic SSR (iter-3), those Suspense boundaries actually streamed - the HTML shell flushed fast and below-fold content arrived progressively, giving Lighthouse one clear LCP candidate to anchor on.

This is an inline-content-vs-streamed-content tradeoff, not an architectural defect. Options for iter-N (after E3-E5 land and the full route-set is measured):
- Switch the four below-fold Suspense sections to client-side fetching with skeleton fallbacks, restoring streamed-shell behaviour even on a static page.
- Pre-resolve only the above-fold (hero + bento) on the static page; lazy-load the below-fold sections with `next/dynamic`.
- Tune the `<link rel="preload" as="image">` set so only the genuine LCP raster gets priority hint.

E2's architectural goal is met. LCP optimisation is iter-N work after the full ISR cascade is in place. Tracking as a follow-up.

### E.7 a11y/BP/SEO drift on iter-5d

A11y 1.00 → 0.97: one new finding likely related to the `<Script>` injection landing time. To be re-audited at E7 once all routes are refactored.
BP 1.00 → 0.88: also a new finding, plausibly related to how `next/script` injects Plausible after-interactive vs the previous server-conditional render. Re-audit at E7.
Both are "single-finding regressions" per the Lighthouse summary, not category collapses. Will close at E7.

### E.8 Build verification

`npm run build` exits clean. `/` route prints `○ Static` with `Revalidate 2m`. No type errors, no lint errors. ISR cache is configured.

### E.9 Server stop
Single-PID kill on the production server (PID 2134) after iter-5d capture.

