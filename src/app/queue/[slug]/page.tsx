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

  return (
    <QueueRoom
      eventId={event.id}
      eventSlug={event.slug}
      eventTitle={event.title}
      coverImageUrl={event.cover_image_url}
      queueOpenAt={event.queue_open_at}
      saleStartAt={saleStartAt}
      admissionRate={event.queue_admission_rate}
      admissionWindowMinutes={event.queue_admission_window_minutes}
    />
  )
}
