'use client'

/**
 * Client boundary that code-splits the seating engine.
 *
 * Why this file exists. `SeatSelector` pulls in the whole Canvas 2D seating
 * stack: the scene graph, the chair glyphs, the LOD tables, the palette sets,
 * the key plan and the best-available search. The event detail page renders it
 * only when the event is seated, but it was imported STATICALLY by
 * `src/app/events/[slug]/page.tsx`, so every event detail page downloaded it -
 * including general admission events that can never display a seat map.
 * Measured on the gated GA event: 61KB transferred across three chunks
 * (selector UI, canvas renderer, palette) for a page showing none of it.
 *
 * Why the wrapper, rather than calling next/dynamic in the page. The Next.js
 * documentation states that when a Server Component dynamically imports a
 * Client Component, automatic code splitting is NOT supported. `page.tsx` is a
 * Server Component, so a `next/dynamic` call made there splits nothing at all.
 * That trap had already caught this codebase once: VenueMap sat behind
 * next/dynamic in the same Server Component and its Google Maps loader still
 * shipped in the initial chunk set. The dynamic import has to be owned by a
 * Client Component, which is what this file is. Same pattern as the existing
 * `m5-events-map-lazy.tsx`.
 *
 * `ssr` is deliberately left at its default (true). The seating chart is still
 * server-rendered on seated events, so the HTML those buyers receive is byte
 * for byte what it was before. This changes WHERE the code is chunked, never
 * what is rendered.
 */

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { SeatSelector as SeatSelectorType } from './seat-selector'

const SeatSelector = dynamic(() => import('./seat-selector').then(m => m.SeatSelector))

type Props = ComponentProps<typeof SeatSelectorType>

export function SeatSelectorLazy(props: Props) {
  return <SeatSelector {...props} />
}
