'use client'

/**
 * THE EVENT PAGE'S SHARE BAR AND SOLD-OUT PANEL, THEIR JAVASCRIPT LOADED AFTER THE FIRST PAINT (WINDOW 5A, 10 November 2026).
 *
 * Main went red on PR #256's merge: CI's build measured '[initial-bundle-budget] FAIL: /events/[slug] is a PUBLIC route
 * at 198.0 KB gzip on this local build, inside the 2.0 KB margin under the 200.0 KB budget' (and /events/[slug]/holder
 * the same); a local Turbopack build read the route at 197.4 KB. The share bar sits below the fold under 'Share this
 * event', and the sold-out panel renders only for a night that has sold out, yet both were imported statically by
 * src/app/events/[slug]/page.tsx, so every event page downloaded them before its first paint.
 *
 * The same move as event-media-lazy.tsx (car 41c) and for the same reason: the Next.js guide this version ships says
 * 'When a Server Component dynamically imports a Client Component, automatic code splitting is currently not supported'
 * (node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md), so the dynamic import lives here, in a Client Component.
 * Server rendering is unchanged: the HTML is the same, and only the JavaScript waits.
 */
import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { EventShareBar as ShareBar } from './event-share-bar'
import type { EventSoldOut as SoldOut } from './event-sold-out'

const EventShareBar = dynamic(() => import('./event-share-bar').then((m) => m.EventShareBar))
const EventSoldOut = dynamic(() => import('./event-sold-out').then((m) => m.EventSoldOut))

export function EventShareBarLazy(props: ComponentProps<typeof ShareBar>) {
  return <EventShareBar {...props} />
}

export function EventSoldOutLazy(props: ComponentProps<typeof SoldOut>) {
  return <EventSoldOut {...props} />
}
