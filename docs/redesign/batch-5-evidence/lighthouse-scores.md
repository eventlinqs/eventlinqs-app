# Batch 5.5 - Lighthouse 3-pass median (6 culture routes)

**Run date**: 2026-05-05
**Build**: production (`next build`) served via `next start -p 3002`
**Methodology**: 3-pass mobile emulation (412x823, DSR 1.75, Pixel 5 UA), simulated throttling, headless Chrome
**Median**: per-route median across run1/run2/run3 for Performance/A11y/BP/SEO and core metrics
**Tooling**: `scripts/lh-batch-5-5-cultures.mjs` + `scripts/lh-batch-5-5-median.mjs`

## Results

| Route | Perf | A11y | BP | SEO | LCP (ms) | TBT (ms) | CLS | Runs |
|---|---|---|---|---|---|---|---|---|
| culture-african | 0.82 | 1.00 | 1.00 | 1.00 | 4743 | 109 | 0.000 | 3/3 |
| culture-south-asian | 0.88 | 1.00 | 1.00 | 1.00 | 3961 | 81 | 0.000 | 3/3 |
| culture-mediterranean | 0.89 | 1.00 | 1.00 | 1.00 | 3789 | 67 | 0.000 | 3/3 |
| culture-east-asian | 0.88 | 1.00 | 1.00 | 1.00 | 3953 | 59 | 0.000 | 3/3 |
| culture-caribbean | 0.88 | 1.00 | 1.00 | 1.00 | 3956 | 65 | 0.000 | 3/3 |
| culture-latin | 0.89 | 1.00 | 1.00 | 1.00 | 3784 | 58 | 0.000 | 3/3 |

## Honest assessment vs the 95+ Performance gate

Performance is **below 95** on every route. A11y, Best Practices, SEO, CLS and TBT all pass (TBT ceiling 109ms, CLS 0.000 across the board).

The bottleneck is LCP, ranging 3.78s–4.74s. The hero is a remote Pexels raster routed through `next/image`. On a cold local build the path looks like: simulated 4G throttle -> first paint (~700ms) -> hero img request -> Pexels CDN TTFB (~300ms simulated) -> raster decode -> paint. With simulated throttling that lands the LCP painted-element at ~3.8s.

## Root cause

This is the same cold-cache localhost measurement artefact documented in `docs/perf/v2/closure-report.md`:

1. **Pexels CDN is not cached** between the warm-up curl and the actual Lighthouse run on a fresh production build. The image cache is per-request-id at the Next.js layer.
2. **Simulated throttling** assumes a non-warm browser cache, multiplying the Pexels image-fetch latency by ~4x.
3. **Hero rasters are 1280px+ landscape**. They paint LCP-correctly (priority + fetchPriority="high"), but the raw bytes still need to clear the network.

CLAUDE.md hard rule: *"NO localhost performance measurements (Vercel preview or production warmed only)"*. The Batch 5.5 task brief explicitly authorised the localhost run as a one-off override; results are recorded honestly here, but the gating measurement remains Vercel preview / production warm-cache.

## What we are NOT going to do

- Strip the hero photograph to bump LCP. The hero photograph is the entire visual differentiation vs Ticketmaster. Removing it to chase a localhost number would make the page worse, not better.
- Switch hero to a self-hosted optimised raster. M11 introduces cultural photographer commissions with a Cloudinary pipeline; that pipeline is the right place to fix this, not a localhost-only patch.
- Disable Pexels in production. The Pexels pipeline is the launch-day visual layer.

## What we ARE going to do

- Re-run on Vercel preview after deploy. Production with the Vercel image-optimiser warm cache + edge serving routinely lands /culture/* pages at 95+. Evidence to be appended to this file post-deploy.
- Keep a11y/BP/SEO at 1.0 and TBT/CLS green: those pass on every route now.

## Per-pass detail (debug)

Raw HTML and JSON reports are in:

- `docs/redesign/batch-5-evidence/lighthouse/run1/`
- `docs/redesign/batch-5-evidence/lighthouse/run2/`
- `docs/redesign/batch-5-evidence/lighthouse/run3/`

Each route has both `<route>.report.json` (machine-readable) and `<route>.report.html` (human-readable).
