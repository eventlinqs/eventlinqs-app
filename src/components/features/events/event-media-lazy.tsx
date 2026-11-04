'use client'

/**
 * THE EVENT PAGE'S GALLERY AND VIDEO, LOADED ONLY WHERE THE NIGHT HAS THEM (car 41c, the CONTROLLER's 22:25 of
 * 4 November 2026: Vercel refused car 41 on '[initial-bundle-budget] FAIL: /e/[code] is a PUBLIC route at 200.0 KB gzip
 * of first-load JavaScript, over the Scope v5 10.3 budget of 200.0 KB by 0.0 KB').
 *
 * Most nights carry neither a gallery nor a video, yet both were imported statically by src/app/events/[slug]/page.tsx,
 * so every event page, /e/[code] and /events/[slug]/holder downloaded them. The dynamic import lives here, in a Client
 * Component, because the Next.js guide this version ships says 'When a Server Component dynamically imports a Client
 * Component, automatic code splitting is currently not supported' (node_modules/next/dist/docs/01-app/02-guides/
 * lazy-loading.md); the same reason as seat-selector-lazy.tsx and venue-map-lazy.tsx. Server rendering is unchanged:
 * the HTML is the same, and only the JavaScript waits until a night shows one.
 */
import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { EventGallery as Gallery } from './event-gallery'
import type { EventVideo as Video } from './event-video'

const EventGallery = dynamic(() => import('./event-gallery').then((m) => m.EventGallery))
const EventVideo = dynamic(() => import('./event-video').then((m) => m.EventVideo))

export function EventGalleryLazy(props: ComponentProps<typeof Gallery>) {
  return <EventGallery {...props} />
}

export function EventVideoLazy(props: ComponentProps<typeof Video>) {
  return <EventVideo {...props} />
}
