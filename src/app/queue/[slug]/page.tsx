import { createClient } from '@/lib/supabase/server'
import { readOrThrow, type Read } from '@/lib/supabase/read-or-throw'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { cache } from 'react'
import type { Event, TicketTier } from '@/types/database'
import { QueueRoom } from './queue-room'

type Props = { params: Promise<{ slug: string }> }

type QueueEvent = Event & { ticket_tiers: TicketTier[] }

/**
 * READ ONCE PER REQUEST. `generateMetadata` renders the head and the default
 * export renders the body, from the same request, and both need this row.
 * Next's own reference expects the second to be free ("React `cache` can be
 * used if `fetch` is unavailable", node_modules/next/dist/docs/01-app/
 * 03-api-reference/04-functions/generate-metadata.md, Next 16.3.0) and on this
 * platform it is not: every Supabase request carries its own AbortSignal so a
 * retry inside a render is a real second request, which is the framework
 * deduplicator's documented opt-OUT (src/lib/supabase/undeduped-fetch.ts).
 * Close-out C8, 21 September 2026.
 */
const fetchEvent = cache(async function fetchEvent(slug: string): Promise<QueueEvent | null> {
  // A failed read is not an absent event: readOrThrow retries a blink and throws
  // a real fault, so the caller's notFound() stands only on "no row" (PGRST116).
  const supabase = await createClient()
  return readOrThrow(
    'queue event',
    () => supabase.from('events').select('*, ticket_tiers(*)').eq('slug', slug).single() as unknown as Read<QueueEvent>,
  )
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const event = await fetchEvent(slug)
  if (!event) return { title: 'Queue | EventLinqs' }
  return { title: `Queue for ${event.title} | EventLinqs` }
}

export default async function QueuePage({ params }: Props) {
  const { slug } = await params
  const event = await fetchEvent(slug)

  if (!event) notFound()

  // Non-high-demand events have no queue - send directly to event page
  if (!event.is_high_demand) {
    redirect(`/events/${slug}`)
  }

  // Cancelled / completed events: no point queuing
  if (event.status === 'cancelled' || event.status === 'completed') {
    redirect(`/events/${slug}`)
  }

  // Earliest ticket tier sale_start for pre-sale countdown
  const saleDates = event.ticket_tiers
    .map((t) => t.sale_start)
    .filter((d): d is string => !!d)
    .sort()
  const saleStartAt = saleDates[0] ?? null

  // events.queue_open_at and events.queue_admission_rate are NOT in the
  // live schema (verified against information_schema.columns 2026-05-29).
  // The virtual-queue feature was scaffolded with these props in
  // QueueRoom but the schema columns to source them from were never
  // added. Until that migration ships, pass:
  //   - queueOpenAt = null  (no pre-queue countdown, QueueRoom handles null)
  //   - admissionRate = DEFAULT_ADMISSION_RATE_PER_MIN (10/min, sensible
  //     default for a v1 high-demand event; configurable per-event when
  //     the schema lands).
  // events.queue_admission_window_minutes DOES exist and is used as-is.
  const DEFAULT_ADMISSION_RATE_PER_MIN = 10
  return (
    <QueueRoom
      eventId={event.id}
      eventSlug={event.slug}
      eventTitle={event.title}
      coverImageUrl={event.cover_image_url}
      queueOpenAt={null}
      saleStartAt={saleStartAt}
      admissionRate={DEFAULT_ADMISSION_RATE_PER_MIN}
      admissionWindowMinutes={event.queue_admission_window_minutes}
    />
  )
}
