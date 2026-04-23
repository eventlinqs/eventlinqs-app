'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { EventsMap as EventsMapType } from './m5-events-map'

const EventsMap = dynamic(
  () => import('./m5-events-map').then(m => m.EventsMap),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-ink-600">Loading map...</div>
    ),
  },
)

type Props = ComponentProps<typeof EventsMapType>

export function EventsMapLazy(props: Props) {
  return <EventsMap {...props} />
}
