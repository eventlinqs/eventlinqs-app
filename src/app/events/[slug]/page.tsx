import { createPublicClient } from '@/lib/supabase/public-client'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import type {
  Event, TicketTier, Organisation, EventCategory, EventAddon,
} from '@/types/database'
import { jsonAsStringArray } from '@/lib/json-narrow'
import { priceLabel, lowestPaidCents } from '@/lib/events/price-label'
import {
  SeatSelector, type SeatData, type SectionData,
} from '@/components/checkout/seat-selector'
import { SocialProofBadge } from '@/components/inventory/social-proof-badge'
import { GoingProof } from '@/components/inventory/going-proof'
import { TicketPanelClient } from '@/components/features/events/ticket-panel-client'
import { getEventInventoryStatic, getTierInventoryStatic } from '@/lib/redis/inventory-cache'
import { getDynamicPriceMap } from '@/lib/pricing/dynamic-pricing'
import { SiteHeader } from '@/components/layout/site-header'
import { SiteFooter } from '@/components/layout/site-footer'
import { HeroMedia } from '@/components/media'
import { HeroPresenceMarker } from '@/components/layout/hero-presence-marker'
import { getFeaturedHeroBackground } from '@/lib/images/event-media'
import { StickyActionBar } from '@/components/features/events/sticky-action-bar'
import { RelatedEventsGrid } from '@/components/features/events/related-events-grid'
import { Reveal } from '@/components/ui/reveal'
import type { EventCardData } from '@/components/features/events/event-card'
import { projectToCardData } from '@/lib/events/event-card-projection'
import { buildEventMetaDescription } from '@/lib/events/event-meta'
import type { PublicEventRow } from '@/lib/events/types'
import nextDynamic from 'next/dynamic'
import { EventTrustSignals } from '@/components/features/event/EventTrustSignals'
import { fetchFixtureEvent } from '@/lib/dev/fixture-events'

// VenueMap pulls in @googlemaps/js-api-loader (~290KB). Loading it statically
// makes it part of the event-detail route chunk, which Next.js eagerly
// prefetches from any page linking to /events/*. next/dynamic splits it into
// its own chunk so the map code stays out of the initial bundle on every cell.
const VenueMap = nextDynamic(
  () => import('@/components/features/events/venue-map').then(m => m.VenueMap)
)
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EventSoldOut, type EventSoldOutRelated } from '@/components/features/events/event-sold-out'
import { TicketsNotOnSale } from '@/components/features/events/tickets-not-on-sale'
import { eventIsPaid, isOrganiserSellable } from '@/lib/payments/sale-status'
import { getEventFeeRates } from '@/lib/pricing/event-fee-config'
import type { FeePassType } from '@/lib/payments/fee-math'
import { EventViewTracker } from '@/components/features/events/event-view-tracker'
import { EventSchemaJsonLd } from '@/components/features/events/event-schema-jsonld'
import { BreadcrumbJsonLd } from '@/components/seo/breadcrumb-jsonld'
import { EventShareBar } from '@/components/features/events/event-share-bar'
import { EventStateBanner } from '@/components/features/events/event-state-banner'
import { SaveEventButton } from '@/components/features/events/save-event-button'
import { EventGallery } from '@/components/features/events/event-gallery'
import { EventVideo } from '@/components/features/events/event-video'
import { parseGallery } from '@/lib/media/event-media-model'
import { isVideoProvider } from '@/lib/media/video-embed'

// Why ISR: every published event detail page is the same for all anonymous
// visitors, so the shell ships as static HTML (revalidated every 5 minutes
// from Postgres). Personalisation that previously made this dynamic
// (queue gate via `searchParams.queue_token`, access-code unlock via
// `getUnlockedTierIds()` cookie) has been lifted into middleware
// (`src/middleware.ts`) and a client wrapper (`TicketPanelClient`)
// respectively. Per-tier inventory + dynamic pricing still come from
// Redis/Postgres at render time, but they go through `createPublicClient`
// which doesn't read cookies.
// No generateStaticParams: this route is rendered DYNAMICALLY on demand (see
// the headers() note in the component). The build-pool fix (985e46d) needed
// individual events kept off the build-time Supabase pool; it did that with
// `generateStaticParams -> []`, but an EMPTY gSP pins Turbopack to a STATIC
// classification (zero params to prerender, no chance to observe the chrome +
// Sentry render-time cookie read), so the first on-demand request 500'd
// ("static to dynamic at runtime, reason: cookies") on every event. Dropping
// gSP entirely (with the headers() marker in the component) makes the route
// dynamic - nothing prerenders at build (still pool-safe), and notFound()
// returns a real 404 (force-dynamic would have soft-404'd it 200). The sitemap
// still lists every event, so discovery and indexing are unaffected.
export const revalidate = 300

type Props = {
  params: Promise<{ slug: string }>
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
  // Density fixture (Preview + local only, double-guarded in fetchFixtureEvent):
  // the homepage rails and this detail path read ONE fixture, so a fixture
  // card resolves to a fully rendered detail page instead of a 404. Returns
  // null for unknown slugs and is a no-op on production, so the real-DB query
  // below stays the single path for every live event.
  const fixture = await fetchFixtureEvent(slug)
  if (fixture) return fixture as unknown as FullEvent

  const supabase = createPublicClient()
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
  const supabase = createPublicClient()
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

  // SEO format per Batch 8.1 brief: "[Event Name] - [Date] - [Venue] - EventLinqs".
  // Description: city + community/category + date packed into 155 chars for click-through.
  const dateLabel = formatShortDate(event.start_date, event.timezone)
  const venueLabel = [event.venue_name, event.venue_city].filter(Boolean).join(', ')
  const titleParts = [event.title, dateLabel, venueLabel || null].filter(Boolean) as string[]
  const title = `${titleParts.join(' - ')} - EventLinqs`

  // Always non-empty (root fix for the SEO meta-description failure on events
  // with no summary/description/venue_city - see buildEventMetaDescription).
  const description = buildEventMetaDescription({
    title: event.title,
    summary: event.summary,
    description: event.description,
    venueCity: event.venue_city,
    venueName: event.venue_name,
    dateLabel,
    categoryName: event.category?.name,
  })

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'

  return {
    title,
    description,
    keywords: [
      event.title,
      event.venue_city ?? '',
      event.category?.name ?? '',
      'tickets',
      'events',
    ].filter(Boolean) as string[],
    alternates: { canonical: `/events/${slug}` },
    // og:image and twitter:image come from the designed per-event share card
    // (opengraph-image.tsx in this route folder): the branded invitation with
    // the cover photo, scrim, title, date and venue. Setting raw cover images
    // here would override the file-convention card with an unbranded photo.
    openGraph: {
      title: event.title,
      description,
      url: `${baseUrl}/events/${slug}`,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: event.title,
      description,
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

function cheapestPrice(tiers: { price: number; currency: string }[]): string | null {
  if (!tiers.length) return null
  // The shared price-label rule: free only when EVERY tier is $0, otherwise
  // the lowest PAID price (see src/lib/events/price-label.ts).
  return priceLabel(tiers, 'Free entry')
}

export default async function EventDetailPage({ params }: Props) {
  // Render this route DYNAMICALLY. The build-pool fix (985e46d) set
  // generateStaticParams -> [] to keep individual events off the build-time
  // Supabase pool. But with no params to prerender Next classified the route
  // STATIC, so the first on-demand request hit the render-time cookie/header
  // read performed by the shared chrome + Sentry tracing instrumentation and
  // threw a hard 500 ("Page changed from static to dynamic at runtime, reason:
  // cookies") on EVERY event - the flagship surface was down. `connection()`
  // declares the dependency on the request up front so Next marks the route
  // dynamic the SAME natural way the sibling /city + /community routes already
  // are (NOT `dynamic = 'force-dynamic'`, which renders notFound() as a soft
  // 200 instead of a real 404). It never prerenders at build (pool-safe) and is
  // still edge-cached via the CDN-Cache-Control header in next.config - the
  // shell is anonymous (SiteHeader is rendered `staticSafe`, no per-user avatar
  // in the shared cache entry; only Sentry's per-request trace id varies, which
  // is not user data).
  const { slug } = await params
  const event = await fetchEvent(slug)

  // notFound() BEFORE any request-data access, so a missing event returns a
  // real 404 (the cookie-free createPublicClient fetch above keeps this guard
  // static-classifiable; accessing headers() first would commit a streaming
  // 200 and soft-404 the not-found - the bug city/[slug] avoids the same way).
  if (!event) notFound()

  // Mark the route dynamic for real events: a no-op `headers()` read. Per this
  // repo's ISR notes (app/layout.tsx + the /events page) a server `headers()`
  // call disqualifies a route from static generation, which (together with no
  // generateStaticParams) keeps this route off the static classification that
  // 500'd on the chrome + Sentry render-time cookie read.
  await headers()

  // Queue gate moved to `src/middleware.ts`. The middleware redirects
  // unauthenticated visitors to `/queue/[slug]` before this page renders,
  // so by the time we get here, the visitor either holds a valid admission
  // token or the event isn't gated at all.

  // Non-public visibility / state screens.
  // - cancelled / completed (past) / postponed: render the full event
  //   page so the URL retains SEO + archive + customer-service value,
  //   with a state banner above the hero (Batch 8.1).
  // - private / draft / scheduled: still hard-block - those events
  //   shouldn't surface to anyone without explicit access.
  const eventBannerState =
    event.status === 'cancelled' ? 'cancelled' as const :
    event.status === 'postponed' ? 'postponed' as const :
    event.status === 'completed' ? 'past' as const :
    null

  if (event.visibility === 'private') {
    return (
      <div className="min-h-screen bg-canvas">
        <SiteHeader staticSafe />
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
        <SiteHeader staticSafe />
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
        const seatSupabase = createPublicClient()
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
    dynamicPriceMap,
    eventInventory,
    media,
    related,
    seatsData,
    feeRates,
  ] = await Promise.all([
    getDynamicPriceMap(allTiers.map(t => t.id)),
    getEventInventoryStatic(event.id),
    getFeaturedHeroBackground({
      title: event.title,
      cover_image_url: event.cover_image_url,
      thumbnail_url: event.thumbnail_url,
      // gallery_urls is jsonb in the live schema; narrow Json -> string[].
      gallery_urls: jsonAsStringArray(event.gallery_urls),
      category: event.category ? { slug: event.category.slug ?? null, name: event.category.name } : null,
    }),
    fetchRelatedEvents(
      event.id,
      event.category_id,
      event.organisation_id,
      event.venue_city,
    ),
    seatsPromise,
    // ACCC all-in: resolve this event's live fee VALUES (event > org > region
    // precedence, same rows the charge resolves) so the ticket selector can show
    // the true total incl. fees before checkout.
    getEventFeeRates({
      organisationId: event.organisation_id,
      eventId: event.id,
      currency: allTiers[0]?.currency ?? 'AUD',
    }),
  ])
  const eventFeePassType = (event.fee_pass_type ?? 'pass_to_buyer') as FeePassType

  // Event Media Standard: the gallery (below the hero, lazy) and the one optional
  // allowlisted video embed. The cover raster (media.image) is the video poster so
  // the video never competes for the LCP.
  const gallery = parseGallery(event.gallery_urls)
  const videoProvider = isVideoProvider(event.video_provider) ? event.video_provider : null
  const hasVideo = !!(event.video_url && videoProvider)

  function resolvePrice(tier: TicketTier): number {
    const dynamic = dynamicPriceMap.get(tier.id)
    return (dynamic && dynamic > 0) ? dynamic : tier.price
  }

  // Server enriches every active tier (including access-code-gated ones).
  // TicketPanelClient filters by visibility + unlock state on the client so
  // unlock can reveal new tiers without a router refresh that would just
  // rehit the static HTML.
  const enrichedAllTiers: EnrichedTier[] = allTiers.map(t => ({
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
    Promise.all(enrichedAllTiers.map(async t => [t.id, await getTierInventoryStatic(t.id)] as const)),
    projectToCardData(related as unknown as PublicEventRow[]),
    getDynamicPriceMap(relatedTierIds),
  ])
  const tierInventory = Object.fromEntries(tierInventoryEntries)

  const isSoldOut =
    !event.has_reserved_seating &&
    !!eventInventory &&
    eventInventory.total_capacity > 0 &&
    eventInventory.available === 0

  // Organiser-Stripe sale guard (single source of truth in
  // @/lib/payments/sale-status). A PAID event whose organiser has no
  // connected, charges-enabled Stripe account cannot be checked out, so we
  // show the not-on-sale state and render no selection. FREE events need no
  // Stripe and stay fully sellable.
  const saleBlocked =
    eventIsPaid(allTiers) && !isOrganiserSellable(event.organisation)

  const soldOutRelated: EventSoldOutRelated[] = related.slice(0, 3).map(e => {
    const tiers = e.ticket_tiers ?? []
    // Lowest PAID price (the shared price-label rule); 0 only when the event
    // is genuinely free (every tier $0). The first tier is not the price.
    const paid = lowestPaidCents(tiers)
    return {
      id: e.id,
      slug: e.slug,
      title: e.title,
      start_date: e.start_date,
      venue_city: e.venue_city,
      venue_country: e.venue_country,
      cover_image_url: e.cover_image_url,
      category_name: e.category?.name ?? null,
      from_price_cents: tiers.length === 0 ? null : paid ?? 0,
      currency: tiers[0]?.currency ?? null,
    }
  })

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eventlinqs.com'
  const eventStateForSchema =
    eventBannerState === 'cancelled' ? 'cancelled' as const :
    eventBannerState === 'postponed' ? 'postponed' as const :
    eventBannerState === 'past' ? 'past' as const :
    isSoldOut ? 'sold-out' as const :
    'upcoming' as const

  return (
    <div className="min-h-screen bg-canvas">
      {/* Organiser-dependent structured data only renders when the organiser
          record loaded. A sellable organiser excluded from the public query
          (e.g. not yet active) must never crash the page. */}
      {event.organisation && (
        <EventSchemaJsonLd
          event={event}
          organisation={event.organisation}
          ticketTiers={allTiers}
          state={eventStateForSchema}
          baseUrl={baseUrl}
        />
      )}
      <BreadcrumbJsonLd
        items={[
          { name: 'Home', url: baseUrl },
          { name: 'Events', url: `${baseUrl}/events` },
          { name: event.title, url: `${baseUrl}/events/${event.slug}` },
        ]}
      />
      <EventViewTracker
        eventId={event.id}
        eventTitle={event.title}
        category={event.category?.name ?? 'Uncategorised'}
        venueCity={event.venue_city ?? 'Unknown'}
        priceRange={priceLabel ?? 'Free'}
      />
      <SiteHeader staticSafe />

      {eventBannerState ? (
        <EventStateBanner
          state={eventBannerState}
          organiserHandle={event.organisation?.slug ?? null}
        />
      ) : null}

      <StickyActionBar
        title={event.title}
        dateLabel={shortDate}
        venueLabel={venueLabelShort}
        priceLabel={priceLabel}
        shareUrl={`/events/${event.slug}`}
      />

      <main>
        {/* Hero at the single platform scale (.hero-marketing). Flattened from
            the retired 55-70vh content tier per the 2026 competitor mirror:
            neither TM nor Eventbrite runs a taller event-detail hero. */}
        <section
          aria-label="Event hero"
          className="hero-marketing relative flex items-end overflow-hidden bg-navy-950"
        >
          <HeroPresenceMarker />
          <div className="absolute inset-0">
            <HeroMedia
              image={media.image}
              alt={event.cover_image_alt || media.alt}
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
                <span className="inline-flex rounded-full border border-gold-500/40 bg-ink-900/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-gold-400 shadow-sm">
                  {event.category.name}
                </span>
              )}

              <h1
                className="mt-4 font-display font-extrabold leading-[1.02] tracking-tight text-white"
                /* Homepage display scale (text-3xl -> text-5xl). Capped at 3rem
                   per the hero law: never text-6xl/7xl. */
                style={{ fontSize: 'clamp(1.875rem, 5vw, 3rem)' }}
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
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <SocialProofBadge inventory={eventInventory} createdAt={event.created_at} />
                  {/* Honest social proof: real confirmed sales (total_sold,
                      paid only) drive a "N people going" pill, shown only at
                      or above the floor so a thin event never reads weak.
                      Engine 4 of the demand engine; no new query, ISR-safe. */}
                  <GoingProof totalSold={eventInventory.total_sold} />
                </div>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {eventBannerState === 'cancelled' || eventBannerState === 'past' ? (
                  <Link
                    href="/events"
                    className="inline-flex items-center rounded-lg bg-gold-500 px-6 py-3 text-base font-semibold text-ink-900 shadow-lg shadow-gold-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-gold-600"
                  >
                    Browse upcoming events
                  </Link>
                ) : (
                  <Link
                    href="#tickets"
                    className="inline-flex items-center rounded-lg bg-gold-500 px-6 py-3 text-base font-semibold text-ink-900 shadow-lg shadow-gold-500/20 transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-gold-600"
                  >
                    Get tickets
                  </Link>
                )}
                {!eventBannerState ? (
                  <span className="inline-flex items-center gap-2 text-sm text-white/80">
                    <span className="font-display font-bold text-gold-400">{priceLabel ?? 'Free entry'}</span>
                  </span>
                ) : null}
                <SaveEventButton eventId={event.id} variant="dark" />
              </div>
              {/* Batch 11.0 - Trust signals at the purchase-decision
               *  moment, the 2026 contextual pattern. The legacy
               *  sitewide trust band was removed from the homepage in
               *  this batch; trust now lives at the moment that drives
               *  the conversion. */}
              <EventTrustSignals variant="dark" />
            </div>
          </div>
        </section>

        {/* Event Media: the video (allowlisted embed, click-to-play facade so the
            cover raster stays the LCP) and the gallery (lazy, below the fold).
            Rendered directly below the hero per the Event Media Standard. */}
        {(hasVideo || gallery.length > 0) && (
          <Reveal as="section" className="bg-canvas pt-10 sm:pt-12">
            <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8">
              {hasVideo && videoProvider && event.video_url && (
                <EventVideo
                  embedUrl={event.video_url}
                  provider={videoProvider}
                  poster={media.image}
                  posterBlur={event.cover_image_blur ?? undefined}
                  title={event.title}
                />
              )}
              {gallery.length > 0 && (
                <div>
                  <SectionHeader eyebrow="Gallery" title="Event photos" size="sm" />
                  <div className="mt-5">
                    <EventGallery images={gallery} eventTitle={event.title} />
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        )}

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
                      // Organiser description is free-text from a plain textarea, not
                      // sanitised HTML. Render it as escaped text (React-escaped) with
                      // line breaks preserved, never via dangerouslySetInnerHTML, so an
                      // organiser cannot inject stored XSS into the public event page.
                      <div className="mt-5 max-w-none whitespace-pre-line text-base leading-relaxed text-ink-600">
                        {event.description}
                      </div>
                    )}
                  </div>
                )}

                {/* When + Where. Reveal each discrete block (transform+opacity,
                    no reflow) so the sticky ticket panel is untouched. */}
                <Reveal as="div" className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
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
                </Reveal>

                {/* Venue map */}
                {event.event_type !== 'virtual' && (fullAddress || event.venue_name) && (
                  <Reveal as="div" className="mt-10">
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
                  </Reveal>
                )}

                {/* Organiser card. Guarded: when the organiser record did not
                    load (e.g. a sellable organiser excluded from the public
                    query), the whole card is skipped rather than crashing. */}
                {event.organisation && (
                <Reveal as="div" className="mt-10">
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
                </Reveal>
                )}

                {/* Tags - events.tags is jsonb in the live schema; narrow
                    Json -> string[] before iterating. */}
                {(() => {
                  const tags = jsonAsStringArray(event.tags)
                  return tags.length > 0 && (
                  <div className="mt-8 flex flex-wrap gap-2">
                    {tags.map(tag => (
                      <Link
                        key={tag}
                        href={`/events?q=${encodeURIComponent(tag)}`}
                        className="rounded-full border border-ink-200 bg-white px-3 py-1 text-xs text-ink-600 transition-colors hover:border-gold-400 hover:text-gold-600"
                      >
                        #{tag}
                      </Link>
                    ))}
                  </div>
                  )
                })()}

                {/* Share - WhatsApp first per Batch 8.1 brief (community events
                 *  spread through WhatsApp more than any other channel in the
                 *  EventLinqs target communities). */}
                <div className="mt-8">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-ink-500">
                    Share this event
                  </p>
                  <EventShareBar
                    eventTitle={event.title}
                    eventDate={shortDate}
                    eventUrl={`${baseUrl}/events/${event.slug}`}
                    variant="light"
                  />
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
                    ) : saleBlocked ? (
                      <TicketsNotOnSale embedded />
                    ) : (
                      <SeatSelector
                        eventId={event.id}
                        seats={eventSeats}
                        sections={eventSections}
                        defaultPriceCents={defaultPriceCents}
                        currency={allTiers[0]?.currency ?? 'AUD'}
                        maxPerOrder={allTiers[0]?.max_per_order ?? 10}
                        tierPriceCentsMap={tierPriceCentsMap}
                      />
                    )}
                  </div>
                ) : isSoldOut && !saleBlocked ? (
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

                    <TicketPanelClient
                      eventId={event.id}
                      eventCreatedAt={event.created_at}
                      allTiers={enrichedAllTiers}
                      addons={event.event_addons ?? []}
                      isTicketingSuspended={isTicketingSuspended}
                      defaultCurrency="AUD"
                      waitlistEnabled={event.waitlist_enabled ?? false}
                      squadBookingEnabled={event.squad_booking_enabled ?? false}
                      tierInventory={tierInventory}
                      saleBlocked={saleBlocked}
                      feeRates={feeRates}
                      feePassType={eventFeePassType}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Related events - fade-rise on scroll-in (below-fold). */}
        {related.length > 0 && (
          <Reveal>
            <RelatedEventsGrid events={relatedCards} dynamicPrices={relatedPrices} />
          </Reveal>
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
