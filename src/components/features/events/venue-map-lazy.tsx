'use client'

/**
 * Client boundary that code-splits the venue map.
 *
 * `venue-map.tsx` already defers the Google Maps JS API itself correctly: it
 * waits for an IntersectionObserver hit and skips auto-load entirely in audit
 * mode, so `maps.googleapis.com` is never requested on load. That part was
 * right and is untouched.
 *
 * What was still wrong: the next/dynamic call lived in
 * `src/app/events/[slug]/page.tsx`, a SERVER Component, and Next.js does not
 * code-split a Client Component dynamically imported from a Server Component.
 * The result was a dynamic import that looked deferred and was not - the
 * module carrying the loader and the brand map style shipped in the initial
 * chunk set on every event detail page (measured: the `maps.googleapis.com`
 * string sat inside a chunk Lighthouse actually fetched).
 *
 * Owning the dynamic import from a Client Component is what makes the split
 * real. Mirrors `m5-events-map-lazy.tsx`.
 */

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { VenueMap as VenueMapType } from './venue-map'

const VenueMap = dynamic(() => import('./venue-map').then(m => m.VenueMap))

type Props = ComponentProps<typeof VenueMapType>

export function VenueMapLazy(props: Props) {
  return <VenueMap {...props} />
}
