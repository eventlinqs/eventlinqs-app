# Home-page gates

The standing checks a homepage-touching change must pass before it ships,
beside the platform-wide gates (link crawler, affordance scan, Lighthouse).

## 1. Hero slide integrity (added 2026-07-12)

INVARIANT: every featured hero slide carries its OWN event's image - image
and text travel together, always. Five slides means five distinct photos,
and each slide's photo also fronts that slide's event detail page.

Why it exists: the 2026-07-12 audit found the carousel rotating five event
texts over ONE static-looking photo - all five fixture events were coverless
and every unmapped category slug fell through to the same default raster.
Root fixes: curated covers for the hero-reaching fixture events
(scripts/seed-events-catalogue.mjs CURATED_COVERS), and a deterministic
per-event variety fallback in heroRasterFor (src/lib/images/event-media.ts).

The gate, both halves:
- Unit (CI, always on): tests/unit/home/featured-hero-media.test.ts pins the
  resolver behaviour (own cover wins; coverless siblings never share one
  fallback; mapped community slugs keep their curated raster).
- Live (run per homepage pass): `node scripts/verify/hero-slide-integrity.mjs
  <deployedUrl>` asserts N slides -> N distinct images on the real page and
  cross-checks each slide's image against its own event page.

## 2. Hero tempo and pause (2026-07-12)

Rotation ~4.8s with the 700ms crossfade (founder tempo ruling), pausing on
hover, touch and keyboard focus; no rotation without html[data-motion="1"]
(reduced motion, no-JS, headless audits). Measure with a HEADED browser -
headless never arms the motion flag by design.

## 3. LCP integrity (standing law)

The first slide is the server-rendered priority raster and the only slide in
layout until rotation arms post-paint; the hero image itself never animates.
See CLAUDE.md "Hero and LCP integrity".
