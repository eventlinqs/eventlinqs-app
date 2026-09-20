'use client'

import { preload } from 'react-dom'

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
 * THIS FILE IMPORTS NOTHING BUT react-dom, AND THAT IS THE POINT
 * ============================================================================
 *
 * It used to call `getImageProps` from `next/image` here. Moving that call to
 * the server module saved 178 bytes gzip, and the FIRST VERSION OF THIS COMMENT
 * CLAIMED IT SAVED 5,819, which was a guess written before the rebuild that
 * measured it. The guess is left on the record because the real answer is more
 * useful than the tidy one.
 *
 * WHAT ACTUALLY COSTS THE 5.6 KB, measured on the build of 20 September 2026.
 * `initial-bundle-budget --built` refused `/events/[slug]/with/[artist]` at
 * +5,819 bytes against its mark. The cause is CHUNK MEMBERSHIP, not this import:
 * `next/image` is itself a client-component module, so importing it ANYWHERE in
 * `/events/[slug]/layout.tsx`'s graph creates a client reference, and turbopack
 * puts next/image's whole client Image component and this 120-byte function in
 * ONE chunk (`2n9toxq3bsuh2.js`, 15,284 bytes raw / 5,830 gzip on that build).
 * Every route under that layout is served the chunk to obtain this component.
 * Verified by reading the chunk: it carries `ImageConfigContext`,
 * `__next_img_default`, `findClosestQuality` and the cloudinary/akamai loaders
 * beside the one `preload()` call, and only `/events/[slug]`, `/holder` and the
 * artist variant include it. `/events` does not.
 *
 * SO THE IMPORT MOVED ANYWAY, for two reasons that survive the measurement.
 * next/image is already in the graph of `/events/[slug]` and `/holder` because
 * they render `HeroMedia`, so the chunk is not waste there; the artist variant is
 * a redirect page that renders no image, is not in the Lighthouse gate set, and
 * sits at 158.3 KB against a 200 KB budget. And a client component that imports
 * only `react-dom` cannot be the thing that drags a framework module into a
 * route, whoever renders it next.
 *
 * A DEFERRED `await import('next/image')` IN THE SERVER MODULE WAS BUILT AND
 * ABANDONED, and not on byte grounds: it was never measured, because it puts an
 * `await` on the server render of the slowest route on the platform, which is the
 * route this whole mechanism exists to speed up. Trading latency on the page that
 * matters for 5.6 KB on a redirect page is the wrong side of the trade. If
 * somebody wants those bytes back, the honest way is for the artist route to stop
 * sharing a layout with the hero, not to make the hero's preload asynchronous.
 *
 * THE RULE THE SECTION BELOW STATES STILL STANDS and is why this file imports
 * one module: a client component takes VALUES as props and does not import the
 * module that can compute them. `MEDIA_SIZES` was kept out for exactly that
 * reason, with the 21,005 bytes it once cost every dashboard route recorded
 * beside it, and then `next/image` was imported one line above it anyway.
 */
export interface HeroPreloadLinkProps {
  /** `props.src` from the server's `heroRasterProps`. */
  src: string
  /** `props.srcSet`: React keys the image resource on this plus `sizes`. */
  srcSet?: string
  /** `props.sizes`: the other half of that key. */
  sizes?: string
}

export function HeroPreloadLink({ src, srcSet, sizes }: HeroPreloadLinkProps) {
  preload(src, {
    as: 'image',
    imageSrcSet: srcSet,
    imageSizes: sizes,
    fetchPriority: 'high',
  })

  return null
}
