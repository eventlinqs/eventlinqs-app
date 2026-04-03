import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { Event, TicketTier, Organisation, EventCategory } from '@/types/database'

type Props = {
  params: Promise<{ slug: string }>
}

type FullEvent = Event & {
  ticket_tiers: TicketTier[]
  organisation: Organisation
  category: EventCategory | null
}

async function fetchEvent(slug: string): Promise<FullEvent | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('events')
    .select('*, ticket_tiers(*), organisation:organisations(*), category:event_categories(*)')
    .eq('slug', slug)
    .single() as { data: FullEvent | null }
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const event = await fetchEvent(slug)

  if (!event) {
    return { title: 'Event Not Found — EventLinqs' }
  }

  return {
    title: `${event.title} — EventLinqs`,
    description: event.summary ?? event.description?.replace(/<[^>]*>/g, '').slice(0, 160) ?? '',
    openGraph: {
      title: event.title,
      description: event.summary ?? '',
      images: event.cover_image_url ? [{ url: event.cover_image_url }] : [],
    },
  }
}

function formatDateTime(iso: string, timezone: string) {
  return new Date(iso).toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  })
}

function formatPrice(tier: TicketTier) {
  if (tier.price === 0) return 'Free'
  return `${tier.currency} ${(tier.price / 100).toFixed(2)}`
}

function isSoldOut(tier: TicketTier) {
  return tier.sold_count >= tier.total_capacity
}

export default async function EventDetailPage({ params }: Props) {
  const { slug } = await params
  const event = await fetchEvent(slug)

  if (!event) notFound()

  // Handle non-public states
  if (event.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
          <p className="mt-2 text-gray-600">This event has been cancelled.</p>
          <Link href="/events" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
            Browse other events
          </Link>
        </div>
      </div>
    )
  }

  if (event.status === 'completed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
          <p className="mt-2 text-gray-600">This event has ended.</p>
          <Link href="/events" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
            Browse upcoming events
          </Link>
        </div>
      </div>
    )
  }

  if (event.visibility === 'private') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">This is a private event</h1>
          <p className="mt-2 text-gray-500">You need an invitation to view this event.</p>
        </div>
      </div>
    )
  }

  if (event.status === 'draft' || event.status === 'scheduled') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">This event is not yet published</h1>
          <p className="mt-2 text-gray-500">Check back soon.</p>
        </div>
      </div>
    )
  }

  const isTicketingSuspended = event.status === 'paused' || event.status === 'postponed'
  const visibleTiers = event.ticket_tiers.filter(t => t.is_visible && t.is_active)
  const location = [event.venue_name, event.venue_address, event.venue_city, event.venue_state, event.venue_country]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">EVENTLINQS</Link>
          <Link href="/events" className="text-sm text-gray-600 hover:text-gray-900">← All Events</Link>
        </div>
      </nav>

      {/* Cover image hero */}
      {event.cover_image_url && (
        <div className="relative aspect-[3/1] w-full overflow-hidden bg-gray-200">
          <Image
            src={event.cover_image_url}
            alt={event.title}
            fill
            priority
            className="object-cover"
          />
        </div>
      )}

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {event.category && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-700">
                {event.category.name}
              </span>
            )}

            <h1 className="mt-3 text-3xl font-bold text-gray-900">{event.title}</h1>

            {event.is_age_restricted && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-100 px-3 py-1.5 text-sm text-amber-800">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {event.age_restriction_min}+ only
              </div>
            )}

            {/* Date & Time */}
            <div className="mt-6 flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{formatDateTime(event.start_date, event.timezone)}</p>
                <p className="text-sm text-gray-500">Ends {formatDateTime(event.end_date, event.timezone)}</p>
              </div>
            </div>

            {/* Location */}
            {(location || event.event_type !== 'in_person') && (
              <div className="mt-4 flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  {event.event_type === 'virtual' ? (
                    <p className="text-sm font-medium text-gray-900">Online Event</p>
                  ) : (
                    <>
                      {event.venue_name && <p className="text-sm font-medium text-gray-900">{event.venue_name}</p>}
                      {location && <p className="text-sm text-gray-500">{location}</p>}
                    </>
                  )}
                  {event.event_type === 'hybrid' && <p className="text-xs text-gray-400 mt-0.5">In-person + Online</p>}
                </div>
              </div>
            )}

            {/* Organiser */}
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-sm text-gray-700">
                Organised by <span className="font-medium">{event.organisation.name}</span>
              </p>
            </div>

            {/* Description */}
            {event.description && (
              <div className="mt-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">About this event</h2>
                <div
                  className="prose prose-sm max-w-none text-gray-600"
                  dangerouslySetInnerHTML={{ __html: event.description }}
                />
              </div>
            )}

            {/* Tags */}
            {event.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {event.tags.map(tag => (
                  <span key={tag} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Share */}
            <div className="mt-8 flex items-center gap-3">
              <span className="text-sm text-gray-500">Share:</span>
              <button
                onClick={() => typeof navigator !== 'undefined' && navigator.clipboard?.writeText(window.location.href)}
                className="text-sm text-blue-600 hover:underline"
              >
                Copy link
              </button>
            </div>
          </div>

          {/* Ticket panel */}
          <div className="w-full lg:w-80 shrink-0">
            <div className="sticky top-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Tickets</h2>

              {isTicketingSuspended && (
                <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  Ticket sales are temporarily paused.
                </div>
              )}

              {visibleTiers.length === 0 ? (
                <p className="text-sm text-gray-500">No tickets available.</p>
              ) : (
                <div className="space-y-3">
                  {visibleTiers.map(tier => {
                    const soldOut = isSoldOut(tier)
                    const remaining = tier.total_capacity - tier.sold_count
                    return (
                      <div
                        key={tier.id}
                        className={`rounded-lg border p-4 ${soldOut ? 'border-gray-100 bg-gray-50 opacity-60' : 'border-gray-200'}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900">{tier.name}</p>
                            {tier.description && (
                              <p className="mt-0.5 text-xs text-gray-500">{tier.description}</p>
                            )}
                            {!soldOut && remaining <= 20 && (
                              <p className="mt-1 text-xs text-amber-600">Only {remaining} left</p>
                            )}
                          </div>
                          <div className="ml-3 text-right">
                            <p className="text-sm font-bold text-gray-900">{formatPrice(tier)}</p>
                            {soldOut && (
                              <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600">
                                Sold out
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {visibleTiers.some(t => !isSoldOut(t)) && !isTicketingSuspended && (
                <button
                  disabled
                  title="Checkout coming in Module 3"
                  className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white opacity-70 cursor-not-allowed"
                >
                  Select Tickets
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
