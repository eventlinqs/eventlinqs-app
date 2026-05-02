# iter-6 measurement (post E5 + E6)

After /events/[slug] (E5) and /categories/[slug] (E6) refactors.
Same Lighthouse mobile preset, same simulated throttling, same prod
build (`next start`) on localhost:3000.

## Public-route mobile sweep

| Route | Status | Perf | A11y | BP | SEO | FCP | LCP | TBT | CLS | SI | TTFB |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | `○ Static` | n/a* | 1.00 | 1.00 | 1.00 | 2237 | n/a* | n/a* | 0.000 | 6144 | 32 |
| `/events` | `ƒ Dynamic` | 0.68 | 1.00 | 1.00 | 1.00 | 1249 | 5550 | 409 | 0.010 | 3393 | 77 |
| `/events/browse/melbourne` | `ƒ Dynamic` | 0.69 | 1.00 | 1.00 | 1.00 | 1234 | 5536 | 391 | 0.010 | 3584 | 75 |
| `/events/afrobeats-...` | `● SSG` | 0.71 | 1.00 | 1.00 | 1.00 | 1245 | 5113 | 399 | 0.000 | 3360 | 208 |
| `/categories/afrobeats` | `● SSG` | 0.76 | 0.96 | 1.00 | 0.91 | 1231 | 5222 | 246 | 0.000 | 2916 | 13 |

*Homepage LCP/TBT audits did not fire — likely because the LCP element
is video-driven for that run; needs follow-up.

## TTFB breakdown

| Route | TTFB (ms) | Source |
|---|---|---|
| `/categories/afrobeats` | 13 | warm SSG cache (5m) |
| `/` | 32 | warm Static (2m) |
| `/events/browse/melbourne` | 75 | unstable_cache hit (canUseCached) |
| `/events` | 77 | unstable_cache hit (canUseCached) |
| `/events/afrobeats-...` | 208 | proxy queue-gate Supabase query + warm SSG |

The proxy hop on `/events/[slug]` is the cost of moving the queue gate
out of the page. Net positive: page renders are now fully static.

## What's clean

- A11y at 1.00 on every public route except `/categories/afrobeats`
  at 0.96 (single colour-contrast finding; cosmetic).
- BP at 1.00 across the board.
- SEO at 1.00 on all routes except `/categories/afrobeats` at 0.91
  (canonical / meta variant) - tracked for follow-up.
- CLS at 0 on hero-led routes (`/`, `/events/[slug]`,
  `/categories/[slug]`) and 0.010 on the listing routes (within budget).

## What's not yet 100

LCP is the consistent ceiling: 5113-5550 ms across the four routes
that report it. FCP is fast (1.2-1.3s); TBT is moderate (246-409 ms);
SI is reasonable (2.9-3.6s). The image gap between FCP and LCP is
where Phase F (edge caching headers) and any remaining hero-image
optimisation needs to focus.

Hypothesis: the simulated 4G throttle plus the hero raster's
~150-200 KB transfer is what's eating the 4-second LCP delta. Even
with `priority` + `fetchPriority="high"`, the simulator models the
network-bound critical path and the asset arrives just slightly after
FCP. Phase F should test:

1. Vercel `images: { qualities: [70, 75, 85] }` actually being honoured
   (already in `next.config.ts`).
2. `Cache-Control: public, max-age=31536000, immutable` on image
   variants returned by `/_next/image`.
3. Whether the hero LCP element is the optimised raster
   (`HeroMedia.image`) or a fallback path that bypasses the variant
   tree.

## Files
- Lighthouse reports: `home.report.{html,json}`,
  `events.report.{html,json}`, `city.report.{html,json}`,
  `event-detail.report.{html,json}`, `category.report.{html,json}`.
- 7-viewport screenshots for the new SSG route at
  `screenshots-category-after/`.
