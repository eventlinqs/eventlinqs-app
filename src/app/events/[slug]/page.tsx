import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { validateAdmissionToken } from '@/lib/queue/tokens'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { Event, TicketTier, Organisation, EventCategory, EventAddon } from '@/types/database'
import { CopyLinkButton } from '@/components/features/events/copy-link-button'
import { TicketSelector } from '@/components/checkout/ticket-selector'
import { SeatSelector, type SeatData, type SectionData } from '@/components/checkout/seat-selector'
import { AccessCodeInput } from '@/components/features/events/access-code-input'
import { SocialProofBadge } from '@/components/inventory/social-proof-badge'
import { getUnlockedTierIds } from '@/app/actions/access-codes'
import { getEventInventory, getTierInventory } from '@/lib/redis/inventory-cache'
import { getDynamicPriceMap } from '@/lib/pricing/dynamic-pricing'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ queue_token?: string }>
}

type FullEvent = Event & {
  ticket_tiers: TicketTier[]
  organisation: Organisation
  category: EventCategory | null
  event_addons?: EventAddon[]
}

type EnrichedTier = TicketTier & { display_price_cents: number; sale_pending: boolean }

async function fetchEvent(slug: string): Promise<FullEvent | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('events')
    .select('*, ticket_tiers(*), organisation:organisations(*), category:event_categories(*), event_addons(*)')
    .eq('slug', slug)
    .single() as { data: FullEvent | null; error: unknown }

  if (error) {
    console.error('[event-detail] fetchEvent failed:', error)
    return null
  }
  return data
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  // searchParams unused in metadata
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

/**
 * Determine if a tier is currently purchasable, applying M4 rules:
 * - sale_start / sale_end windows
 * - hidden_until reveals
 * - requires_access_code gating
 */
function isTierCurrentlyVisible(tier: TicketTier, now: Date, unlockedTierIds: string[]): boolean {
  if (!tier.is_visible || !tier.is_active) return false

  // Sale window: hide after sale_end (only when the sale has fully closed AND capacity exhausted)
  if (tier.sale_end && new Date(tier.sale_end) <= now) return false
  // Hidden until reveal time
  if (tier.hidden_until && new Date(tier.hidden_until) > now) return false
  // Access-code gated: only show if unlocked
  if (tier.requires_access_code && !unlockedTierIds.includes(tier.id)) return false

  // NOTE: sale_start is intentionally NOT checked here. Tiers with a future sale_start
  // are shown as "Sale starts soon" so buyers can see prices before the sale opens.
  return true
}

/**
 * Determine if ANY tiers have access-code-gated content that is still locked.
 * We show the access code input when this is true.
 */
function hasLockedTiers(tiers: TicketTier[], now: Date, unlockedTierIds: string[]): boolean {
  return tiers.some(t => {
    if (!t.is_active) return false
    if (t.requires_access_code && !unlockedTierIds.includes(t.id)) return true
    // Also show input for hidden_until tiers if within 24h of reveal
    if (t.hidden_until) {
      const revealTime = new Date(t.hidden_until)
      if (revealTime > now && revealTime.getTime() - now.getTime() < 24 * 60 * 60 * 1000) return true
    }
    return false
  })
}

export default async function EventDetailPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { queue_token } = await searchParams
  const event = await fetchEvent(slug)

  if (!event) notFound()

  // Queue gate: high-demand events require a valid admission token
  if (event.is_high_demand && event.status === 'published') {
    const queueOpen = event.queue_open_at && new Date(event.queue_open_at) <= new Date()
    if (queueOpen) {
      const tokenValid = queue_token
        ? validateAdmissionToken(queue_token).valid
        : false
      if (!tokenValid) {
        redirect(`/queue/${slug}`)
      }
    }
  }

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

  const now = new Date()
  const isTicketingSuspended = event.status === 'paused' || event.status === 'postponed'

  // Read session-unlocked tier IDs from cookie (server-side)
  const unlockedTierIds = await getUnlockedTierIds()

  // Apply M4 visibility rules to tiers
  const visibleTiers = event.ticket_tiers.filter(t => isTierCurrentlyVisible(t, now, unlockedTierIds))
  const showAccessCodeInput = hasLockedTiers(event.ticket_tiers, now, unlockedTierIds)

  // Fetch dynamic prices for ALL tiers so tierPriceCentsMap is complete for seat price lookup
  const allTiers = event.ticket_tiers
  const dynamicPriceMap = await getDynamicPriceMap(allTiers.map(t => t.id))

  function resolvePrice(tier: TicketTier): number {
    const dynamic = dynamicPriceMap.get(tier.id)
    return (dynamic && dynamic > 0) ? dynamic : tier.price
  }

  const enrichedTiers: EnrichedTier[] = visibleTiers.map(t => ({
    ...t,
    sale_pending: !!(t.sale_start && new Date(t.sale_start) > now),
    display_price_cents: resolvePrice(t),
  }))

  // Load inventory from Redis cache (with DB fallback) for badges
  const eventInventory = await getEventInventory(event.id)

  const tierInventoryMap = new Map(
    await Promise.all(
      enrichedTiers.map(async t => {
        const inv = await getTierInventory(t.id)
        return [t.id, inv] as const
      })
    )
  )

  // Fetch seats + sections when reserved seating is enabled
  let eventSeats: SeatData[] = []
  let eventSections: SectionData[] = []

  if (event.has_reserved_seating) {
    const seatSupabase = await createClient()
    const [seatsResult, sectionsResult] = await Promise.all([
      seatSupabase
        .from('seats')
        .select('id, row_label, seat_number, seat_type, status, x, y, price_cents, seat_map_section_id, ticket_tier_id')
        .eq('event_id', event.id)
        .order('row_label')
        .order('seat_number'),
      event.seat_map_id
        ? seatSupabase
            .from('seat_map_sections')
            .select('id, name, color')
            .eq('seat_map_id', event.seat_map_id)
            .order('sort_order')
        : Promise.resolve({ data: [] as { id: string; name: string; color: string }[], error: null }),
    ])

    if (seatsResult.error) {
      console.error('[event-detail] failed to load seats:', seatsResult.error)
    }

    eventSeats = (seatsResult.data ?? []).map(s => ({
      ...s,
      x: typeof s.x === 'number' ? s.x : parseFloat(s.x as unknown as string) || 0,
      y: typeof s.y === 'number' ? s.y : parseFloat(s.y as unknown as string) || 0,
      ticket_tier_id: s.ticket_tier_id ?? null,
    }))

    eventSections = (sectionsResult.data ?? []) as SectionData[]
  }

  // Build tier price map from ALL tiers (not just visibleTiers) so every seat linked to any
  // tier — including upcoming-sale tiers — shows the correct price on the seat map.
  const tierPriceCentsMap: Record<string, number> = {}
  for (const t of allTiers) {
    tierPriceCentsMap[t.id] = resolvePrice(t)
  }

  // defaultPriceCents for SeatSelector uses first raw tier so it is never 0 when enrichedTiers
  // is empty (e.g. all tiers have a future sale_start).
  const defaultPriceCents = allTiers.length > 0 ? resolvePrice(allTiers[0]) : 0

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
        <div className="w-full bg-gray-100 flex items-center justify-center max-h-96 overflow-hidden">
          <Image
            src={event.cover_image_url}
            alt={event.title}
            width={1200}
            height={630}
            priority
            className="w-full max-h-96 object-contain"
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

            {/* Event-level social proof badge */}
            {eventInventory && (
              <div className="mt-2">
                <SocialProofBadge inventory={eventInventory} createdAt={event.created_at} />
              </div>
            )}

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
              <CopyLinkButton />
            </div>
          </div>

          {/* Ticket panel */}
          <div className={`w-full shrink-0 ${event.has_reserved_seating ? 'lg:w-full' : 'lg:w-80'}`}>
            {event.has_reserved_seating ? (
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Choose Your Seats</h2>
                {isTicketingSuspended ? (
                  <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-3">
                    Ticketing is temporarily paused for this event.
                  </p>
                ) : (
                  <SeatSelector
                    eventId={event.id}
                    seats={eventSeats}
                    sections={eventSections}
                    defaultPriceCents={defaultPriceCents}
                    currency={allTiers[0]?.currency ?? enrichedTiers[0]?.currency ?? 'AUD'}
                    maxPerOrder={allTiers[0]?.max_per_order ?? enrichedTiers[0]?.max_per_order ?? 10}
                    tierPriceCentsMap={tierPriceCentsMap}
                  />
                )}
              </div>
            ) : (
              <div className="sticky top-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Tickets</h2>

                {/* Per-tier social proof badges */}
                {enrichedTiers.length > 0 && (
                  <div className="mb-3 space-y-1.5">
                    {enrichedTiers.map(tier => {
                      const inv = tierInventoryMap.get(tier.id)
                      if (!inv) return null
                      return (
                        <div key={tier.id} className="flex items-center justify-between text-xs text-gray-500">
                          <span>{tier.name}</span>
                          <SocialProofBadge inventory={inv} createdAt={event.created_at} compact />
                        </div>
                      )
                    })}
                  </div>
                )}

                <TicketSelector
                  eventId={event.id}
                  tiers={enrichedTiers}
                  addons={(event.event_addons ?? []).filter(a => a.is_active)}
                  isTicketingSuspended={isTicketingSuspended}
                  currency={enrichedTiers[0]?.currency ?? 'AUD'}
                  waitlistEnabled={event.waitlist_enabled ?? false}
                  squadBookingEnabled={event.squad_booking_enabled ?? false}
                />

                {/* Access code input — shown when gated tiers exist */}
                {showAccessCodeInput && (
                  <AccessCodeInput eventId={event.id} />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
