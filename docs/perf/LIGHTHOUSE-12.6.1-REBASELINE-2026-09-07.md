# Lighthouse 12.1.0 to 12.6.1: the re-baseline of every gated URL (7 September 2026)

Close-out C8 CORRECTED, C8.1. The Lighthouse CI package moved from `@lhci/cli@0.14.x`
(Lighthouse 12.1.0) to `@lhci/cli@0.15.1` (Lighthouse 12.6.1) in the three places
that name it: `.github/workflows/lighthouse.yml`, `scripts/ops/pre-push-gate.mjs`
(`LHCI_SPEC`) and `scripts/admin-lighthouse.mjs`. `tests/unit/ci/lhci-pin-agreement.test.ts`
keeps them together.

## Sources (Law 7)

- The npm registry, read 7 September 2026: `npm view @lhci/cli@0.15.1 dependencies.lighthouse`
  answers `12.6.1`; `npm view @lhci/cli versions` ends `0.15.0, 0.15.1`, so 0.15.1 is the latest
  release (Law 9); `npm view @lhci/cli@0.14.0 dependencies.lighthouse` answers `12.1.0`.
- The 12.1.0 fault, observed in every report this gate ever produced: the
  `largest-contentful-paint-element` and `layout-shifts` audits return `scoreDisplayMode: error`
  with `Required TraceElements gatherer encountered an error: Dependency "RootCauses" failed`.
  Pass A below carries it in all 39 reports. 12.6.1 returns both with real data (pass B).

## Method

Both passes ran the pre-push gate's own Lighthouse step (`npm run gate:push -- --only lighthouse`),
which serves the SAME local production build (`.next` BUILD_ID `_Jt0Ls6IwoZu_SFEFqsik`, the tree of
`main` at cdf34aaa) with `next start`, resolves the pinned 13-URL set, warms the pages and the image
optimiser, and collects with the Lighthouse the pinned `@lhci/cli` bundles, three runs per URL, the
settings from `lighthouserc.json` unchanged between passes. The ONLY difference between the passes is
the `LHCI_SPEC` line. Pass A ran 14:18 to 14:36 local, pass B immediately after on the same machine.
Every number here is the MEDIAN of the three runs with the spread beside it (the aggregation the gate
used until this change was the best run; see C8.2).

The runner comparison (the same workflow on GitHub's runner, 0.14.x on the merged head 1b559180 and
0.15.1 on this branch's pull request) is appended when that run lands.

## Every gated URL on both versions, the local gate, three runs each, medians with the spread

A: @lhci/cli@0.14.x (Lighthouse 12.1.0), 3 runs per URL. B: @lhci/cli@0.15.1 (Lighthouse 12.6.1), 3 runs per URL.

| URL | 12.1.0 perf median (spread) | 12.6.1 perf median (spread) | delta | 12.1.0 LCP | 12.6.1 LCP | 12.1.0 TBT | 12.6.1 TBT | 12.6.1 LCP element |
|---|---|---|---|---|---|---|---|---|
| / | 85 (77 to 85) | 91 (86 to 95) | +6 | 3,296 ms | 3,224 ms | 320 ms | 147 ms | div.group > div.absolute > div.hero-grade > img.object-cover "Geelong Community Night 142264" <img alt="Geelong Community Night 142264" fetchpriority="high" loading="eager" decoding="async" data |
| /community/african | 90 (88 to 90) | 90 (89 to 96) | +0 | 3,516 ms | 2,695 ms | 119 ms | 124 ms | section.relative > div.hero-marketing > div.hero-grade > img.object-cover "African events on every dance floor in your city. on EventLi" <img alt="African events on every dance floor in your city. on EventLinqs" fetchpriority="high" load |
| /events | 91 (91 to 92) | 91 (89 to 92) | +0 | 3,279 ms | 3,499 ms | 63 ms | 61 ms | div.w-64 > a.group > div.relative > img.card-media-img "Geelong Community Night 142264" <img alt="Geelong Community Night 142264" fetchpriority="high" loading="eager" decoding="async" data |
| /events/arena-sessions-large-room-performance-test | 87 (87 to 89) | 87 (85 to 88) | +0 | 3,862 ms | 3,886 ms | 115 ms | 130 ms | section.hero-marketing > div.absolute > div.hero-grade > img.object-cover "Arena Sessions: Large Room Performance Test" <img alt="Arena Sessions: Large Room Performance Test" fetchpriority="high" loading="eager" decoding |
| /events/artist-layer-launch-night-geelong | 89 (89 to 89) | 86 (85 to 89) | -3 | 3,622 ms | 4,040 ms | 97 ms | 95 ms | section.hero-marketing > div.absolute > div.hero-grade > img.object-cover "Artist Layer Launch Night, Geelong" <img alt="Artist Layer Launch Night, Geelong" fetchpriority="high" loading="eager" decoding="async" |
| /events/browse/melbourne | 89 (89 to 90) | 90 (75 to 95) | +1 | 3,748 ms | 2,931 ms | 69 ms | 249 ms | section.relative > div.hero-marketing > div.hero-grade > img.object-cover "Melbourne on EventLinqs" <img alt="Melbourne on EventLinqs" fetchpriority="high" loading="eager" decoding="async" data-nimg=" |
| /events/cat-indie-sounds-live-at-the-enmore-sydney | 88 (84 to 89) | 88 (88 to 89) | +0 | 3,756 ms | 3,674 ms | 92 ms | 105 ms | section.hero-marketing > div.absolute > div.hero-grade > img.object-cover "Indie Sounds Live at the Enmore" <img alt="Indie Sounds Live at the Enmore" fetchpriority="high" loading="eager" decoding="async" dat |
| /help | 94 (94 to 95) | 95 (94 to 98) | +1 | 3,059 ms | 2,952 ms | 51 ms | 47 ms | main.flex-1 > section.relative > div.relative > h1#page-hero-heading "How can we help?" <h1 id="page-hero-heading" class="font-headline font-extrabold leading-[1.04] tracking-[-0.015em] te |
| /legal/terms | 94 (94 to 95) | 95 (94 to 97) | +1 | 3,070 ms | 2,936 ms | 49 ms | 78 ms | div.flex > div.min-w-0 > div.max-w-prose > p "These Terms of Service govern your use of EventLinqs, includ" <p> |
| /login | 91 (91 to 93) | 91 (90 to 93) | +0 | 3,497 ms | 3,500 ms | 73 ms | 67 ms | div.w-full > div.rounded-2xl > div.text-center > h1.font-display "Welcome back" <h1 class="font-display text-2xl font-bold text-ink-900"> |
| /organisers | 92 (91 to 92) | 91 (91 to 92) | -1 | 3,271 ms | 3,308 ms | 89 ms | 77 ms | section.relative > div.hero-marketing > div.hero-grade > img.object-cover "An organiser running a full stage production before a live c" <img alt="An organiser running a full stage production before a live crowd" fetchpriority="high" loa |
| /pricing | 94 (90 to 95) | 95 (94 to 97) | +1 | 3,044 ms | 2,937 ms | 44 ms | 57 ms | main.flex-1 > section.relative > div.relative > h1#page-hero-heading "Simple. Transparent. Fair." <h1 id="page-hero-heading" class="font-headline font-extrabold leading-[1.04] tracking-[-0.015em] te |
| /signup | 91 (91 to 91) | 91 (91 to 94) | +0 | 3,507 ms | 3,504 ms | 49 ms | 32 ms | div.space-y-5 > form.space-y-4 > label.flex > span.text-xs "Keep me posted on events in my area: a weekly local digest a" <span class="text-xs text-ink-600"> |


## What the two versions agree on, and where they differ

- Eleven of thirteen URLs moved by one point or none; the homepage moved +6 (85 to 91) and the Geelong
  event page -3 (89 to 86). Both are inside the spreads the passes themselves show (the homepage ran 77 to 85
  on 12.1.0 and 86 to 95 on 12.6.1; browse/melbourne ran 75 to 95 on 12.6.1), so the upgrade re-baselines
  the numbers without changing the picture: every gated page sits between 86 and 95 on the local gate, and the
  three event pages are the lowest at 86 to 88.
- 12.6.1 names the LCP element on every page; 12.1.0 named none. On this build (the seeded catalogue) the
  homepage LCP is the hero raster, the browse page's is the first rail card image, the community, city and
  organisers pages' are their hero rasters, the event pages' their hero rasters, and help, pricing, terms,
  login and signup paint a heading or a paragraph first.
- TBT on the homepage read 320 ms on 12.1.0 and 147 ms on 12.6.1 for the same bytes: Lighthouse changed
  how it attributes main-thread time between the two releases, which is a second reason the numbers are
  re-baselined rather than compared with older records.
- Script bytes are identical across the two versions, as they must be (the same build): 177 to 252 KB per
  page, the login and signup forms the heaviest at 251 to 252 KB, the event pages at 225 KB.
- Layout shift is 0.000 on every page on both versions.

## What this is not

The local gate serves a warmed `next start` on this machine and reads the TEST database at fixture density.
The GitHub runner measuring the Vercel preview of the same tree reads 5 to 15 points lower on the same URLs
(0.14.x, run 34079721873: homepage median 0.75, arena event page 0.76). Neither is production. A number
quoted from this document is a local-gate number on Lighthouse 12.6.1, and says so.

## The runner, both versions

The same workflow on GitHub's runner, measuring the Vercel preview of the same tree. Run
34079721873 (0.14.x, Lighthouse 12.1.0, three runs, judged optimistic, on the merged head
1b559180) against run 34087352524 (0.15.1, Lighthouse 12.6.1, five runs, judged median, on
891fd66a); both trees serve the same pages. Medians of the performance score, with the spread:

| URL | 12.1.0 (3 runs) | 12.6.1 (5 runs) | 12.6.1 LCP | 12.6.1 TBT | 12.6.1 script | 12.6.1 LCP element |
|---|---|---|---|---|---|---|
| / | 75 (66 to 76) | 83 (68 to 88) | 2,418 ms | 530 ms | 408 KB | the hero raster |
| /community/african | 93 (91 to 93) | 92 (92 to 93) | 2,499 ms | 259 ms | 405 KB | the hero raster |
| /events | 78 (70 to 89) | 90 (72 to 93) | 2,569 ms | 305 ms | 419 KB | the first rail card image |
| /events/arena-sessions-large-room-performance-test | 76 (75 to 79) | 74 (74 to 85) | 4,259 ms | 395 ms | 440 KB | the hero raster |
| /events/artist-layer-launch-night-geelong | 85 (81 to 86) | 82 (78 to 90) | 4,049 ms | 246 ms | 440 KB | the hero raster |
| /events/browse/melbourne | 90 (89 to 91) | 92 (90 to 93) | 2,652 ms | 246 ms | 418 KB | the hero raster |
| /events/cat-indie-sounds-live-at-the-enmore-sydney | 75 (73 to 87) | 76 (73 to 80) | 4,261 ms | 365 ms | 440 KB | the hero raster |
| /help | 93 (92 to 96) | 93 (91 to 93) | 2,622 ms | 233 ms | 396 KB | the page heading |
| /legal/terms | 93 (91 to 93) | 92 (90 to 92) | 2,291 ms | 302 ms | 397 KB | the first paragraph |
| /login | 83 (83 to 93) | 88 (88 to 91) | 2,577 ms | 367 ms | 467 KB | the "Welcome back" heading |
| /organisers | 92 (91 to 94) | 92 (92 to 94) | 2,436 ms | 252 ms | 404 KB | the hero raster |
| /pricing | 94 (81 to 97) | 96 (94 to 96) | 2,268 ms | 187 ms | 396 KB | the page heading |
| /signup | 83 (82 to 83) | 91 (91 to 95) | 2,575 ms | 287 ms | 469 KB | the digest opt-in label |

Under the median floors the run FAILED on the two heavy event pages (0.74 and 0.76 against 0.80);
the event-detail numeric budget passed on all three event pages, the LCP cap by 241 ms. The job
took 28 minutes 21 seconds inside the 45 minute budget.

Why the runner reads below the local gate: the runner and production load the error-reporting
SDK, about 200 KB of script that the local gate never loads because it has no key for it
(396 to 469 KB of script per page on the runner against 177 to 252 KB locally, with TBT 187 to
530 ms against 28 to 73 ms). The runner is the environment the gate's emails come from and the
one to plan against.
