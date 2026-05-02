# HeroMedia + LCP path audit

Date: 2026-05-02
Files audited: `src/components/media/HeroMedia.tsx`, `src/components/media/EventCardMedia.tsx`, `src/components/features/events/featured-event-hero.tsx`, `src/components/features/events/hero-carousel-client.tsx`

## HeroMedia.tsx contract

- Renders `<Image fill priority={priority} fetchPriority={priority?'high':'auto'} loading={priority?'eager':'lazy'} sizes={MEDIA_SIZES.fullBleed} quality={MEDIA_QUALITY.hero} className="object-cover" />`.
- Asserts that `image` is a raster URL (rejects SVG in dev).
- For `priority` slides only, mounts an ambient layer (ken-burns or video) AFTER first paint.
- `MEDIA_QUALITY.hero` is currently `80`. Config `qualities` allowlist is `[70, 75, 85]`. **Mismatch: 80 is silently rejected by Next 16.** Will be addressed in Iteration 3.

## Next.js 16 priority/preload migration

Per partner CTO research (verified via Next.js 16 release docs): `priority` is deprecated in Next 16 in favor of `preload` for the actual LCP element only. The migration guidance is to keep `loading="eager"` and `fetchPriority="high"` and explicitly call out the LCP element with `preload={true}`.

Current state: HeroMedia uses `priority={priority}` which still works (deprecated but functional). The deprecation warning may appear in Next dev mode; production behavior is unchanged.

Decision: migrate in Iteration 4 only on the SINGLE confirmed LCP element to avoid noise. Skip migration on EventCardMedia/CityTileImage/etc - their `priority` prop is a layout-level convenience, not a per-call LCP designation.

## LCP element on `/`

Per the brand-sweep verification (2026-05-02, mobile median): home LCP = 2468ms, hero raster image. Element selector traced in iter-14 close report: the hero image inside `featured-event-hero.tsx` slide 0.

LCP delay breakdown (from iter-14 close report, home, mobile median):
- TTFB ~ 600ms
- resource-load-delay ~ 572ms
- resource-load-duration ~ TBD
- element-render-delay ~ 0-2058ms (depending on hydration cost)

The element-render-delay is the lever. Yesterday's iter 3 reduced it from 2058ms to 84ms by removing `'use client'` from `event-card.tsx` and `site-footer.tsx`. The next big lever is **moving the first slide of the hero out of the client-component boundary** so it paints from initial HTML without waiting on `HeroCarouselClient` hydration.

## LCP element on `/events`

Per iter-14 close report: events LCP = 3601ms (mobile median, but newer brand-sweep run measured 5617ms). Element = first card image in the popular rail (`li.w-64 > a > div > img.object-cover`).

LCP delay breakdown:
- TTFB ~ 700ms
- resource-load-delay ~ 1060ms (Pexels round-trip through `/_next/image`)
- resource-load-duration ~ TBD
- element-render-delay ~ TBD

The dominant problem here is **resource-load-delay 1060ms** from Pexels cold-encoding. The card image goes `getCategoryPhoto` → Pexels URL → `/_next/image` → re-encode AVIF → serve. That ~1s is unavoidable on a cold cache.

Mitigation strategies:
1. Switch the rail's first card to a local raster (same trick that home does for hero). Would require either pre-bucketing card cover images, or rewriting the popular-rail to render its first card with a local AVIF backdrop while keeping the data-driven cover for cards 2-N.
2. Reduce hydration cost so element-render-delay drops, partially compensating for the Pexels delay.
3. Pre-warm Pexels routes via a build step that hits `/_next/image?url=<pexels>&w=384&q=70` for known category photos.

Decision: pursue (2) first via the hydration iterations. If `/events` does not clear 95 with hydration alone, pursue (1) - replace the rail's LCP candidate with a local raster.

## Forbidden pattern checks (per docs/MEDIA-ARCHITECTURE.md §11)

- Above-fold media without `priority`/`fetchPriority="high"`: NONE detected on `/` (HeroMedia priority=true on slide 0). NONE detected on `/events` (rail card 0 priority=true).
- `<video>` with SVG poster on LCP path: NONE.
- Hardcoded `quality={N}` outside `MEDIA_QUALITY.*`: NONE in feature code (verified by ESLint rule).
- Raw `<img>` for content imagery: NONE in feature code.
- `unoptimized={true}` on remote rasters: NONE.
- `loading="lazy"` combined with `priority`: NONE.

The architecture is compliant. The performance ceiling is hydration cost on `/` and Pexels round-trip on `/events`.
