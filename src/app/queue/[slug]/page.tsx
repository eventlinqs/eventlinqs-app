import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import type { Event, TicketTier } from '@/types/database'
import { QueueRoom } from './queue-room'

type Props = { params: Promise<{ slug: string }> }

type QueueEvent = Event & { ticket_tiers: TicketTier[] }

async function fetchEvent(slug: string): Promise<QueueEvent | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('events')
    .select('*, ticket_tiers(*)')
    .eq('slug', slug)
    .single() as { data: QueueEvent | null; error: unknown }
  return data
}

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
