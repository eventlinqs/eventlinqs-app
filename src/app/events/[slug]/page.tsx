import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { validateAdmissionToken } from '@/lib/queue/tokens'
import Link from 'next/link'
import type { Metadata } from 'next'
import type {
  Event, TicketTier, Organisation, EventCategory, EventAddon,
} from '@/types/database'
import { CopyLinkButton } from '@/components/features/events/copy-link-button'
import { TicketSelector } from '@/components/checkout/ticket-selector'
import {
  SeatSelector, type SeatData, type SectionData,
} from '@/components/checkout/seat-selector'
import { AccessCodeInput } from '@/components/features/events/access-code-input'
import { SocialProofBadge } from '@/components/inventory/social-proof-badge'
import { getUnlockedTierIds } from '@/app/actions/access-codes'
import { getEventInventory, getTierInventory } from '@/lib/redis/inventory-cache'
import { getDynamicPriceMap } from '@/lib/pricing/dynamic-pricing'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { HeroMedia } from '@/components/media'
import { GlassCard } from '@/components/ui/glass-card'
import { getFeaturedHeroBackground } from '@/lib/images/event-media'
import { StickyActionBar } from '@/components/features/events/sticky-action-bar'
import { RelatedEventsGrid } from '@/components/features/events/related-events-grid'
import type { EventCardData } from '@/components/features/events/event-card'
import { projectToCardData } from '@/lib/events/event-card-projection'
import type { PublicEventRow } from '@/lib/events/types'
import dynamic from 'next/dynamic'

// VenueMap pulls in @googlemaps/js-api-loader (~290KB). Loading it statically
// makes it part of the event-detail route chunk, which Next.js eagerly
// prefetches from any page linking to /events/*. next/dynamic splits it into
// its own chunk so the map code stays out of the initial bundle on every cell.
const VenueMap = dynamic(
  () => import('@/components/features/events/venue-map').then(m => m.VenueMap)
)
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EventSoldOut, type EventSoldOutRelated } from '@/components/features/events/event-sold-out'
import { EventViewTracker } from '@/components/features/events/event-view-tracker'

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

type EnrichedTier = TicketTier & {
  display_price_cents: number
  sale_pending: boolean
}

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

async function fetchRelatedEvents(
  currentId: string,
  categoryId: string | null,
  organisationId: string,
  city: string | null,
): Promise<EventCardData[]> {
  const supabase = await createClient()
  const now = new Date().toISOString()

  // Same organiser upcoming events
  const orgPromise = supabase
    .from('events')
    .select('id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)')
    .eq('status', 'published')
    .eq('visibility', 'public')
    .eq('organisation_id', organisationId)
    .neq('id', currentId)
    .gte('start_date', now)
    .order('start_date', { ascending: true })
    .limit(4)

  const catPromise = categoryId
    ? supabase
        .from('events')
        .select('id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .eq('category_id', categoryId)
        .neq('id', currentId)
        .gte('start_date', now)
        .order('start_date', { ascending: true })
        .limit(4)
    : Promise.resolve({ data: [] as unknown[] })

  const cityPromise = city
    ? supabase
        .from('events')
        .select('id, slug, title, cover_image_url, thumbnail_url, start_date, venue_name, venue_city, venue_country, created_at, category:event_categories(name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)')
        .eq('status', 'published')
        .eq('visibility', 'public')
        .ilike('venue_city', `%${city}%`)
        .neq('id', currentId)
        .gte('start_date', now)
        .order('start_date', { ascending: true })
        .limit(4)
    : Promise.resolve({ data: [] as unknown[] })

  const [org, cat, cty] = await Promise.all([orgPromise, catPromise, cityPromise])

  const seen = new Set<string>()
  const merged: EventCardData[] = []
  for (const bucket of [org.data ?? [], cat.data ?? [], cty.data ?? []]) {
    for (const raw of bucket as unknown as EventCardData[]) {
      if (seen.has(raw.id)) continue
      seen.add(raw.id)
      merged.push(raw)
      if (merged.length >= 4) break
    }
    if (merged.length >= 4) break
  }
  return merged
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const event = await fetchEvent(slug)

  if (!event) {
    return { title: 'Event not found | EventLinqs' }
  }

  return {
    title: `${event.title} | EventLinqs`,
    description: event.summary ?? event.description?.replace(/<[^>]*>/g, '').slice(0, 160) ?? '',
    alternates: { canonical: `/events/${slug}` },
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

function formatShortDate(iso: string, timezone: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  })
}

function isTierCurrentlyVisible(tier: TicketTier, now: Date, unlockedTierIds: string[]): boolean {
  if (!tier.is_visible || !tier.is_active) return false
  if (tier.sale_end && new Date(tier.sale_end) <= now) return false
  if (tier.hidden_until && new Date(tier.hidden_until) > now) return false
  if (tier.requires_access_code && !unlockedTierIds.includes(tier.id)) return false
  return true
}

function hasLockedTiers(tiers: TicketTier[], now: Date, unlockedTierIds: string[]): boolean {
  return tiers.some(t => {
    if (!t.is_active) return false
    if (t.requires_access_code && !unlockedTierIds.includes(t.id)) return true
    if (t.hidden_until) {
      const revealTime = new Date(t.hidden_until)
      if (revealTime > now && revealTime.getTime() - now.getTime() < 24 * 60 * 60 * 1000) return true
    }
    return false
  })
}

function cheapestPrice(tiers: { price: number; currency: string }[]): string | null {
  if (!tiers.length) return null
  const m = tiers.reduce((x, t) => (t.price < x.price ? t : x), tiers[0])
  if (m.price === 0) return 'Free entry'
  const dollars = m.price / 100
  const formatted = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
  return `From ${m.currency ?? 'AUD'} ${formatted}`
}

export default async function EventDetailPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { queue_token } = await searchParams
  const event = await fetchEvent(slug)

  if (!event) notFound()

  if (event.is_high_demand && event.status === 'published') {
    const queueOpen = event.queue_open_at && new Date(event.queue_open_at) <= new Date()
    if (queueOpen) {
      const tokenValid = queue_token ? validateAdmissionToken(queue_token).valid : false
      if (!tokenValid) {
        redirect(`/queue/${slug}`)
      }
    }
  }

  // Non-public state screens — gentle brand-aligned treatments.
  if (event.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-canvas">
        <SiteHeader />
        <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6 lg:px-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-coral-100">
            <svg className="h-8 w-8 text-coral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="mt-6 font-display text-3xl font-bold text-ink-900">{event.title}</h1>
          <p className="mt-2 text-base text-ink-600">This event has been cancelled.</p>
          <Link
            href="/events"
            className="mt-6 inline-flex items-center rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
          >
            Browse other events
          </Link>
        </main>
        <SiteFooter />
      </div>
    )
  }

  if (event.status === 'completed') {
    return (
      <div className="min-h-screen bg-canvas">
        <SiteHeader />
        <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6 lg:px-8">
          <h1 className="font-display text-3xl font-bold text-ink-900">{event.title}</h1>
          <p className="mt-2 text-base text-ink-600">This event has ended.</p>
          <Link
            href="/events"
            className="mt-6 inline-flex items-center rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
          >
            Browse upcoming events
          </Link>
        </main>
        <SiteFooter />
      </div>
    )
  }

  if (event.visibility === 'private') {
    return (
      <div className="min-h-screen bg-canvas">
        <SiteHeader />
        <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6 lg:px-8">
          <h1 className="font-display text-2xl font-bold text-ink-900">This is a private event</h1>
          <p className="mt-2 text-ink-600">You need an invitation to view this event.</p>
        </main>
        <SiteFooter />
      </div>
    )
  }

  if (event.status === 'draft' || event.status === 'scheduled') {
    return (
      <div className="min-h-screen bg-canvas">
        <SiteHeader />
        <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center sm:px-6 lg:px-8">
          <h1 className="font-display text-2xl font-bold text-ink-900">This event is not yet published</h1>
          <p className="mt-2 text-ink-600">Check back soon.</p>
        </main>
        <SiteFooter />
      </div>
    )
  }

  const now = new Date()
  const isTicketingSuspended = event.status === 'paused' || event.status === 'postponed'
  const allTiers = event.ticket_tiers

  const seatsPromise = event.has_reserved_seating
    ? (async () => {
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
        return { seatsResult, sectionsResult }
      })()
    : Promise.resolve(null)

  const [
    unlockedTierIds,
    dynamicPriceMap,
    eventInventory,
    media,
    related,
    seatsData,
  ] = await Promise.all([
    getUnlockedTierIds(),
    getDynamicPriceMap(allTiers.map(t => t.id)),
    getEventInventory(event.id),
    getFeaturedHeroBackground({
      title: event.title,
      cover_image_url: event.cover_image_url,
      thumbnail_url: event.thumbnail_url,
      gallery_urls: event.gallery_urls,
      category: event.category ? { slug: event.category.slug ?? null, name: event.category.name } : null,
    }),
    fetchRelatedEvents(
      event.id,
      event.category_id,
      event.organisation_id,
      event.venue_city,
    ),
    seatsPromise,
  ])

  const visibleTiers = allTiers.filter(t => isTierCurrentlyVisible(t, now, unlockedTierIds))
  const showAccessCodeInput = hasLockedTiers(allTiers, now, unlockedTierIds)

  function resolvePrice(tier: TicketTier): number {
    const dynamic = dynamicPriceMap.get(tier.id)
    return (dynamic && dynamic > 0) ? dynamic : tier.price
  }

  const enrichedTiers: EnrichedTier[] = visibleTiers.map(t => ({
    ...t,
    sale_pending: !!(t.sale_start && new Date(t.sale_start) > now),
    display_price_cents: resolvePrice(t),
  }))

  let eventSeats: SeatData[] = []
  let eventSections: SectionData[] = []
  if (seatsData) {
    const { seatsResult, sectionsResult } = seatsData
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

  const tierPriceCentsMap: Record<string, number> = {}
  for (const t of allTiers) tierPriceCentsMap[t.id] = resolvePrice(t)

  const defaultPriceCents = allTiers.length > 0 ? resolvePrice(allTiers[0]) : 0

  const priceTiersForDisplay = allTiers.map(t => ({
    price: resolvePrice(t),
    currency: t.currency ?? 'AUD',
  }))
  const priceLabel = cheapestPrice(priceTiersForDisplay)
  const shortDate = formatShortDate(event.start_date, event.timezone)
  const venueLabelShort = [event.venue_name, event.venue_city].filter(Boolean).join(' · ') || null
  const fullAddress = [event.venue_name, event.venue_address, event.venue_city, event.venue_state, event.venue_country]
    .filter(Boolean)
    .join(', ')

  const relatedTierIds = related
    .map(e => e.ticket_tiers?.[0]?.id)
    .filter((id): id is string => typeof id === 'string')

  const [tierInventoryEntries, relatedCards, relatedPrices] = await Promise.all([
    Promise.all(enrichedTiers.map(async t => [t.id, await getTierInventory(t.id)] as const)),
    projectToCardData(related as unknown as PublicEventRow[]),
    getDynamicPriceMap(relatedTierIds),
  ])
  const tierInventoryMap = new Map(tierInventoryEntries)

  const isSoldOut =
    !event.has_reserved_seating &&
    !!eventInventory &&
    eventInventory.total_capacity > 0 &&
    eventInventory.available === 0

  const soldOutRelated: EventSoldOutRelated[] = related.slice(0, 3).map(e => {
    const firstTier = e.ticket_tiers?.[0]
    return {
      id: e.id,
      slug: e.slug,
      title: e.title,
      start_date: e.start_date,
      venue_city: e.venue_city,
      venue_country: e.venue_country,
      cover_image_url: e.cover_image_url,
      category_name: e.category?.name ?? null,
      from_price_cents: firstTier?.price ?? null,
      currency: firstTier?.currency ?? null,
    }
  })

  return (
    <div className="min-h-screen bg-canvas">
      <EventViewTracker
        eventId={event.id}
        eventTitle={event.title}
        category={event.category?.name ?? 'Uncategorised'}
        venueCity={event.venue_city ?? 'Unknown'}
        priceRange={priceLabel ?? 'Free'}
      />
      <SiteHeader />

      <StickyActionBar
        title={event.title}
        dateLabel={shortDate}
        venueLabel={venueLabelShort}
        priceLabel={priceLabel}
        shareUrl={`/events/${event.slug}`}
      />

      <main>
        {/* Cinematic hero */}
        <section
          aria-label="Event hero"
          className="relative flex min-h-[55vh] items-end overflow-hidden bg-navy-950 md:min-h-[70vh]"
        >
          <div className="absolute inset-0">
            <HeroMedia
              image={media.image}
              alt={media.alt}
              videoSrc={media.videoSrc}
              kenBurns={media.kenBurns}
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(180deg, rgba(10,22,40,0.3) 0%, rgba(10,22,40,0.55) 55%, rgba(10,14,26,1) 100%)',
              }}
              aria-hidden
            />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-20">
            <div className="max-w-3xl animate-fade-rise">
              {event.category && (
                <GlassCard
                  variant="dark"
                  className="inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-gold-400"
                >
                  {event.category.name}
                </GlassCard>
              )}

              <h1
                className="mt-4 font-display font-extrabold leading-[1.02] tracking-tight text-white"
                style={{ fontSize: 'clamp(2rem, 5vw, 4rem)' }}
              >
                {event.title}
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/80">
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {formatDateTime(event.start_date, event.timezone)}
                </span>
                {venueLabelShort && (
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {venueLabelShort}
                  </span>
                )}
              </div>

              {eventInventory && (
                <div className="mt-4">
                  <SocialProofBadge inventory={eventInventory} createdAt={event.created_at} />
                </div>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="#tickets"
                  className="inline-flex items-center rounded-lg bg-gold-500 px-6 py-3 text-base font-semibold text-ink-900 shadow-lg shadow-gold-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-gold-600"
                >
                  Get tickets
                </Link>
                <span className="inline-flex items-center gap-2 text-sm text-white/80">
                  <span className="font-display font-bold text-gold-400">{priceLabel ?? 'Free entry'}</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Content column + Ticket panel */}
        <section className="bg-canvas pt-12 sm:pt-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className={event.has_reserved_seating ? 'space-y-10' : 'flex flex-col gap-10 lg:flex-row'}>
              <div className={event.has_reserved_seating ? '' : 'flex-1 min-w-0'}>
                {event.is_age_restricted && (
                  <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-warning/15 px-3 py-1.5 text-xs font-semibold text-warning">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {event.age_restriction_min ?? 18}+ only
                  </div>
                )}

                {/* About */}
                {(event.summary || event.description) && (
                  <div>
                    <SectionHeader eyebrow="The details" title="About this event" />
                    {event.summary && (
                      <p className="mt-5 text-base leading-relaxed text-ink-600">{event.summary}</p>
                    )}
                    {event.description && (
                      <div
                        className="prose prose-sm mt-5 max-w-none text-ink-600 prose-headings:text-ink-900 prose-headings:font-display prose-a:text-gold-600 hover:prose-a:text-gold-500"
                        dangerouslySetInnerHTML={{ __html: event.description }}
                      />
                    )}
                  </div>
                )}

                {/* When + Where */}
                <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="rounded-2xl border border-ink-200 bg-white p-5">
                    <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
                      When
                    </p>
                    <p className="mt-2 text-sm font-semibold text-ink-900">
                      {formatDateTime(event.start_date, event.timezone)}
                    </p>
                    <p className="mt-1 text-xs text-ink-600">
                      Ends {formatDateTime(event.end_date, event.timezone)}
                    </p>
                    <p className="mt-2 text-[11px] text-ink-400">Timezone: {event.timezone}</p>
                  </div>

                  <div className="rounded-2xl border border-ink-200 bg-white p-5">
                    <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
                      Where
                    </p>
                    {event.event_type === 'virtual' ? (
                      <p className="mt-2 text-sm font-semibold text-ink-900">Online event</p>
                    ) : (
                      <>
                        {event.venue_name && (
                          <p className="mt-2 text-sm font-semibold text-ink-900">{event.venue_name}</p>
                        )}
                        {fullAddress && <p className="mt-1 text-xs text-ink-600">{fullAddress}</p>}
                      </>
                    )}
                    {event.event_type === 'hybrid' && (
                      <p className="mt-2 inline-flex items-center rounded-full bg-gold-500/10 px-2 py-0.5 text-[10px] font-semibold text-gold-600">
                        In-person + online
                      </p>
                    )}
                  </div>
                </div>

                {/* Venue map */}
                {event.event_type !== 'virtual' && (fullAddress || event.venue_name) && (
                  <div className="mt-10">
                    <SectionHeader eyebrow="Location" title="Venue" size="sm" />
                    <div className="mt-5">
                      <VenueMap
                        venueName={event.venue_name}
                        address={event.venue_address}
                        city={event.venue_city}
                        state={event.venue_state}
                        country={event.venue_country}
                        latitude={event.venue_latitude}
                        longitude={event.venue_longitude}
                      />
                    </div>
                  </div>
                )}

                {/* Organiser card */}
                <div className="mt-10">
                  <SectionHeader eyebrow="Organised by" title={event.organisation.name} size="sm" />
                  <div className="mt-5 rounded-2xl border border-ink-200 bg-white p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-sm font-bold text-gold-400">
                        {event.organisation.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        {event.organisation.description && (
                          <p className="text-sm text-ink-600 line-clamp-3">{event.organisation.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                {event.tags.length > 0 && (
                  <div className="mt-8 flex flex-wrap gap-2">
                    {event.tags.map(tag => (
                      <Link
                        key={tag}
                        href={`/events?q=${encodeURIComponent(tag)}`}
                        className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs text-ink-600 transition-colors hover:border-gold-400 hover:text-gold-600"
                      >
                        #{tag}
                      </Link>
                    ))}
                  </div>
                )}

                {/* Share */}
                <div className="mt-8 flex items-center gap-3">
                  <span className="text-sm text-ink-600">Share:</span>
                  <CopyLinkButton />
                </div>
              </div>

              {/* Ticket panel */}
              <div
                id="tickets"
                className={`w-full shrink-0 ${event.has_reserved_seating ? '' : 'lg:w-[360px]'}`}
              >
                {event.has_reserved_seating ? (
                  <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
                    <SectionHeader eyebrow="Seating" title="Choose your seats" size="sm" className="mb-5" />
                    {isTicketingSuspended ? (
                      <p className="rounded-lg bg-warning/10 px-4 py-3 text-sm text-warning">
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
                ) : isSoldOut ? (
                  <div className="sticky top-20">
                    <EventSoldOut
                      event={{ id: event.id, slug: event.slug, title: event.title }}
                      primaryTierId={allTiers[0]?.id ?? null}
                      relatedEvents={soldOutRelated}
                    />
                  </div>
                ) : (
                  <div className="sticky top-20 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
                    <SectionHeader eyebrow="Get in" title="Tickets" size="sm" className="mb-5" />

                    {enrichedTiers.length > 0 && (
                      <div className="mb-3 space-y-1.5">
                        {enrichedTiers.map(tier => {
                          const inv = tierInventoryMap.get(tier.id)
                          if (!inv) return null
                          return (
                            <div key={tier.id} className="flex items-center justify-between text-xs text-ink-400">
                              <span className="truncate">{tier.name}</span>
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

                    {showAccessCodeInput && <AccessCodeInput eventId={event.id} />}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Related events */}
        {related.length > 0 && (
          <RelatedEventsGrid events={relatedCards} dynamicPrices={relatedPrices} />
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
