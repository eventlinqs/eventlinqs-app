'use client'

import { preload } from 'react-dom'
import { getImageProps } from 'next/image'

/**
 * ASK FOR THE HERO RASTER FROM THE SHELL, USING REACT'S OWN RESOURCE KEY.
 *
 * ============================================================================
 * WHY THIS COMPONENT EXISTS AT ALL
 * ============================================================================
 *
 * `/events/[slug]` is the only public route on the platform with a route-level
 * `loading.tsx`. That boundary closes the `<head>` with the SKELETON, so the
 * preload next/image emits when the hero finally renders lands in the BODY.
 * Measured on this tree's production build, 20 September 2026, the byte offset
 * of `as="image"` per gated route: 241 on `/`, `/events`, `/events/browse/melbourne`,
 * `/community/african`, `/organisers`, `/login` and `/signup`; 85,041 on
 * `/events/cat-indie-sounds-live-at-the-enmore-sydney`. The browser could not
 * ask for the LCP image until it had parsed 41 per cent of the page, and
 * Lighthouse charged it as `Resource load delay`: a 331ms median on that route
 * and 533ms on the arena page, against a `Resource load duration` of 6ms.
 *
 * The route's `layout.tsx` renders ABOVE that boundary, so it renders this, and
 * the ask happens in the shell.
 *
 * ============================================================================
 * WHY A CLIENT COMPONENT CALLING preload(), AND NOT A <link> ELEMENT
 * ============================================================================
 *
 * Both were built and both were measured. The `<link rel="preload" href=...>`
 * element DOES reach the head (byte 1,716), and it is the wrong answer, because
 * React hoists a link element through `renderState.hoistableChunks` keyed on
 * `href` while `preload()` registers an IMAGE resource keyed on
 * `imageSrcSet + "\n" + imageSizes` (react-dom-server.node.production.js, the
 * `preload` implementation). The two registries do not know about each other,
 * so the document came back carrying TWO `as="image"` preloads for one
 * photograph, one at byte 1,716 and next/image's own at byte 88,034. A preload
 * that races the element it is preloading is not a saving.
 *
 * Calling `preload()` is what next/image itself does (`ImagePreload` in
 * next/dist/client/image-component.js), from a client component, for exactly
 * this reason: during the SSR render React's dispatcher is live. Registering
 * the same key first means next/image's later call finds it already present and
 * returns, so ONE link is emitted, in the head, and there is no second request
 * by construction rather than by hoping two URLs match.
 *
 * `preload()` imported into a SERVER component resolves to the `react-server`
 * build and did nothing at all here: no link, no hint row in the flight
 * payload, no `Link:` response header. That attempt is recorded so it is not
 * repeated.
 *
 * ============================================================================
 * WHY THE ARGUMENTS ARE PROPS AND NOT IMPORTS
 * ============================================================================
 *
 * `sizes` and `quality` arrive as props from the server exactly as `HeroMedia`
 * hands them to `HeroRaster`, rather than being imported here. Importing
 * `MEDIA_SIZES` into a client component ships the whole hint table: that table's
 * own header records 21,005 bytes added to every dashboard route's first load
 * for one 32px circle. Two short strings in the flight payload cost less than
 * one byte of that.
 */
export interface HeroPreloadLinkProps {
  /** The already-resolved raster src (what `resolveImageSrc` returned). */
  src: string
  /** The `sizes` hint `HeroMedia` will give the element. */
  sizes: string
  /** The quality tier `HeroMedia` will give the element. */
  quality: number
}

/**
 * The next/image props the hero raster will be rendered with, resolved without
 * rendering it. Exported so the test compares the preload against the element's
 * own output rather than against a second copy of these arguments.
 */
export function heroRasterProps({ src, sizes, quality }: HeroPreloadLinkProps) {
  return getImageProps({
    // The preload carries no alt text; the element that paints does.
    src, alt: '', fill: true, priority: true, sizes, quality,
  })
}

export function HeroPreloadLink(hero: HeroPreloadLinkProps) {
  const { props } = heroRasterProps(hero)

  preload(props.src, {
    as: 'image',
    imageSrcSet: props.srcSet,
    imageSizes: props.sizes,
    fetchPriority: 'high',
  })

  return null
}
