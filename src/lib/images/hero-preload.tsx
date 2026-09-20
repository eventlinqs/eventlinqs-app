import 'server-only'
import { heroRasterProps as resolveHeroRaster } from '@/components/media/hero-raster-props'
import { MEDIA_QUALITY } from '@/components/media/quality'
import { MEDIA_SIZES } from '@/components/media/sizes'
import { resolveImageSrc } from '@/components/media/safe-image-src'
import { HeroPreloadLink } from '@/components/media/hero-preload-link'
import { eventHeroMediaInput, getFeaturedHeroBackground, type EventHeroFields } from './event-media'

/**
 * PUT THE HERO'S PRELOAD IN THE HEAD, WHERE THE PRELOAD SCANNER CAN SEE IT.
 *
 * ============================================================================
 * THE MEASUREMENT THAT PRODUCED THIS FILE
 * ============================================================================
 *
 * READ THIS FIRST: THE CONDITION THAT MADE THIS NECESSARY NO LONGER HOLDS.
 * `src/app/events/[slug]/loading.tsx` was deleted on 20 September 2026 under
 * close-out C8, because a loading boundary in front of a hero costs far more
 * than the preload it breaks (the ELEMENT sat at byte 102,160; see
 * scripts/guards/no-loading-boundary-in-front-of-a-hero.mjs). With the head no
 * longer closing early, next/image's own registration reaches it unaided, as it
 * does on every other public route, and this module is now belt and braces
 * rather than the only way. It is kept for this pass and its removal is named,
 * with the byte prize, in C:\dev\REVIEW-QUEUE-C.md. Everything below is the
 * reasoning that produced it and is kept because it explains the measurement.
 *
 * `HeroMedia` already renders `<Image priority fetchPriority="high">`, and
 * next/image already registers that raster for preload. React emits the link
 * where the registration happens, and it hoists into `<head>` only while the
 * head is still open. On a streamed App Router response the head closes with
 * the FIRST flush, and while `/events/[slug]` carried the platform's only
 * public route-level `loading.tsx`, that first flush was the SKELETON and the
 * hero rendered long afterwards.
 *
 * Driven on this tree's production build, 20 September 2026, served by the
 * gate's own server. Byte offset of `as="image"` per gated route:
 *
 *     /                              241   in head
 *     /events                        241   in head
 *     /events/browse/melbourne       241   in head
 *     /community/african             241   in head
 *     /organisers                    241   in head
 *     /login, /signup                241   in head
 *     /pricing, /help, /legal/terms    -   no hero, no image preload
 *     /events/arena-...           85,169   IN THE BODY
 *     /events/cat-indie-...       85,041   IN THE BODY
 *     /events/artist-layer-...    84,897   IN THE BODY
 *
 * So the browser could not ask for the LCP image on an event page until it had
 * parsed 41 per cent of a 205 KB document. Lighthouse charged it and named it:
 * across five gate runs each, the observed LCP breakdown carried a
 * `Resource load delay` MEDIAN of 331ms on cat-indie and 533ms on the arena
 * page, against a `Resource load duration` of 6ms. The image was not slow.
 * Asking for it was late.
 *
 * ============================================================================
 * WHERE THE ASK MOVED TO, AND THE TWO PLACES THAT DO NOT WORK
 * ============================================================================
 *
 * It moved to `src/app/events/[slug]/layout.tsx`, which renders ABOVE the
 * loading boundary. Both other candidates were built and measured, and both
 * failed, so they are recorded rather than left for the next reader to retry:
 *
 *   1. `generateMetadata`. Its `<title>` does reach the head at byte 1,716, so
 *      it looked like the natural home. A `preload()` registered there produced
 *      NOTHING: the link stayed at byte 85,038, the flight payload gained no
 *      hint row, and the `Link:` response header still carried only two fonts
 *      and two stylesheets. Next resolves metadata through its own boundary.
 *
 *   2. `preload()` imported from `react-dom` inside the SERVER layout. Same
 *      result, and for a different reason: in a server component that specifier
 *      resolves to the `react-server` build, where the call has no dispatcher
 *      to reach. next/image does not use that path either.
 *
 * What works is a CLIENT component rendered from the layout, calling
 * `preload()` during the SSR render, which is precisely what next/image's own
 * `ImagePreload` does. `src/components/media/hero-preload-link.tsx` carries the
 * rest of that reasoning, including why a plain `<link>` element - which DOES
 * reach the head - is the wrong answer here.
 *
 * ============================================================================
 * WHY getImageProps AND NOT A HAND-WRITTEN URL
 * ============================================================================
 *
 * A preload whose arguments differ by one character from the ones the `<img>`
 * picks is not a saving, it is a SECOND DOWNLOAD of the same photograph on the
 * LCP path. next/image builds its `srcSet` from the configured device ladder,
 * the quality and the `sizes` string; reproducing that arithmetic would be a
 * second copy of framework internals that drifts the first time the ladder in
 * next.config.ts moves. `getImageProps` is the framework's own answer to this
 * question (node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md,
 * "getImageProps"), so the preload is built by the code that builds the element.
 *
 * THE INPUTS ARE THE ONES `HeroMedia` PASSES AND THEY ARE READ FROM ITS OWN
 * CONSTANTS, never retyped: `MEDIA_SIZES.fullBleed`, `MEDIA_QUALITY.hero`, and
 * `resolveImageSrc`, which is what decides whether `HeroMedia` renders the
 * raster at all or falls through to the branded placeholder. A src that
 * component would refuse preloads nothing, because preloading an image that
 * never paints is pure cost.
 *
 * `tests/unit/media/hero-preload-matches-the-raster.test.ts` renders `HeroMedia`
 * and asserts its `<img>` carries exactly the srcset and sizes this asks for, so
 * a second download can never arrive unnoticed.
 */
/**
 * THE HINT AND THE TIER THE PRELOAD ASKS WITH, in one place so a test can read
 * them and so the two call sites below cannot drift apart. They are the values
 * `HeroMedia` gives `HeroRaster`, read from its own constants rather than
 * retyped, because a preload whose arguments differ from the element's by one
 * character is a SECOND download of the same photograph on the LCP path.
 */
export const HERO_PRELOAD_ARGS = {
  sizes: MEDIA_SIZES.fullBleed,
  quality: MEDIA_QUALITY.hero,
} as const

/**
 * The next/image props the hero raster will be rendered with, resolved without
 * rendering it.
 *
 * IT RUNS ON THE SERVER, and the move here saved 178 bytes gzip, not the 5,819
 * the first version of this comment predicted. The resource key is unchanged by
 * the move: the same framework call on the same inputs.
 *
 * WHAT THE 5,819 ACTUALLY IS, since this file is where somebody will come
 * looking. `initial-bundle-budget --built` refuses
 * `/events/[slug]/with/[artist]` because `next/image` is a client-component
 * module, so importing it anywhere in `/events/[slug]/layout.tsx`'s graph
 * creates a client reference and turbopack ships next/image's whole client Image
 * component in one chunk with the 120-byte `HeroPreloadLink`. Moving the import
 * from the client file to this one does not leave that graph, because this file
 * is what the layout imports. `src/components/media/hero-preload-link.tsx`
 * carries the measurement, the chunk id, and why the growth is accepted on that
 * one redirect route rather than paid for with an `await` on the LCP path.
 *
 * getImageProps HAS NO SERVER-ONLY ENTRY POINT. The documented import is
 * `from 'next/image'` and nothing else
 * (node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md,
 * "getImageProps"), so there is no supported way to reach the framework's own
 * srcset arithmetic without putting next/image in the graph. Hand-rolling that
 * arithmetic is the alternative and is refused above, under WHY getImageProps
 * AND NOT A HAND-WRITTEN URL.
 *
 * Exported so the test compares the preload against the element's own output
 * rather than against a second copy of these arguments.
 */
export function heroRasterProps({
  src,
  sizes,
  quality,
}: {
  src: string
  sizes: string
  quality: number
}) {
  /*
   * THE GRANT IS WRITTEN HERE, IN FEATURE CODE, ON PURPOSE. `next/image` itself
   * may only be imported under src/components/media/ (the media architecture,
   * eslint-enforced), and `one-priority-image` EXCLUDES that directory, so a
   * `priority: true` written on the other side of this call would be invisible to
   * the guard. That is precisely how this grant went unreviewed for a day. The
   * import sits in the exempt directory; the decision sits here, where it is
   * scanned and declared. `src/components/media/hero-raster-props.ts` carries the
   * full reasoning.
   */
  return resolveHeroRaster({
    // The preload carries no alt text; the element that paints does.
    src, alt: '', fill: true, priority: true, sizes, quality,
  })
}

export function heroPreloadLink(image: string | null | undefined) {
  const safeSrc = resolveImageSrc(image)
  if (!safeSrc) return null

  const { props } = heroRasterProps({ src: safeSrc, ...HERO_PRELOAD_ARGS })

  return <HeroPreloadLink src={props.src} srcSet={props.srcSet} sizes={props.sizes} />
}

/**
 * The columns an event's hero is decided from, so a caller that only needs the
 * hero can read exactly those and nothing else.
 *
 * It is a NARROW select rather than `*` on purpose: the route layout that uses
 * it already runs one existence query per request and this widens that query
 * instead of adding a second one. `eventHeroMediaInput` is the function that
 * says which fields matter, and this string is the same list expressed for
 * PostgREST, so the two are read together in review.
 */
export const EVENT_HERO_SELECT =
  'id, title, cover_image_url, thumbnail_url, gallery_urls, category:event_categories(slug, name)'

/**
 * The preload for an event's hero raster, resolved from the event row.
 *
 * Returns an ELEMENT the caller renders, rather than performing a side effect,
 * because the mechanism only works during a render. The caller must be code
 * that renders ABOVE this route's loading boundary; the module header says why
 * and records the two placements that do not work.
 */
export async function eventHeroPreloadLink(event: EventHeroFields) {
  const media = await getFeaturedHeroBackground(eventHeroMediaInput(event))
  return heroPreloadLink(media.image)
}
