import Link from 'next/link'
import { SmartMedia } from '@/components/ui/smart-media'
import { GlassCard } from '@/components/ui/glass-card'
import { getFeaturedHeroBackground, type EventMediaInput } from '@/lib/images/event-media'
import type { CategoryHighlightSlide } from '@/lib/content/category-highlight-slides'
import {
  HeroCarouselClient,
  type HeroCarouselSlide,
} from './hero-carousel-client'

/**
 * FeaturedEventHero — full-viewport cinematic hero carousel.
 *
 * Accepts a mix of real event slides + curated category highlight slides.
 * Pre-resolves each slide's background media in parallel on the server,
 * then hands pre-rendered JSX to the client carousel component.
 *
 * The H1 is always the brand promise ("Where the culture gathers.") — event
 * identity lives in the ribbon card on the right. The eyebrow rotates based
 * on the active slide's signal (soon, trending, or brand default).
 */

export interface FeaturedHeroEvent extends EventMediaInput {
  id: string
  slug: string
  start_date: string
  venue_name?: string | null
  venue_city?: string | null
  organisation?: { name?: string | null } | null
  ticket_tiers?: { price: number; currency: string }[] | null
  summary?: string | null
  sold_today?: number | null
  percent_sold?: number | null
}

export interface FeaturedHeroEventSlide {
  event: FeaturedHeroEvent
  ticketsSoldToday: number
}

const HERO_SUBCOPY =
  'Tickets for events that move you. Afrobeats, Gospel, Amapiano, Owambe, Comedy. No hidden fees, ever.'

function heroEyebrow(event: FeaturedHeroEvent): string {
  const daysToStart = Math.ceil(
    (new Date(event.start_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )
  if (daysToStart >= 0 && daysToStart <= 2) return 'Happening this weekend'
  if ((event.percent_sold ?? 0) > 70) return 'Trending now'
  return 'Made for the diaspora'
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatFromPrice(tiers: FeaturedHeroEvent['ticket_tiers']): string | null {
  if (!tiers || tiers.length === 0) return null
  const cheapest = tiers.reduce((m, t) => (t.price < m.price ? t : m), tiers[0])
  if (cheapest.price === 0) return 'Free entry'
  const dollars = cheapest.price / 100
  const formatted = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
  return `From ${cheapest.currency ?? 'AUD'} ${formatted}`
}

function renderBackground(media: Awaited<ReturnType<typeof getFeaturedHeroBackground>>) {
  return (
    <>
      <SmartMedia media={media} autoplay priority />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,22,40,0.45) 0%, rgba(10,22,40,0.75) 65%, rgba(10,14,26,1) 100%)',
        }}
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 10% 40%, rgba(10,22,40,0.1) 0%, rgba(10,22,40,0.7) 70%)',
        }}
        aria-hidden
      />
    </>
  )
}

function renderEventCard(event: FeaturedHeroEvent, ticketsSoldToday: number) {
  const price = formatFromPrice(event.ticket_tiers ?? null)
  return (
    <GlassCard variant="dark" as="aside" className="rounded-2xl p-5">
      <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gold-400">
        Happening soon
      </p>
      <h2 className="mt-2 font-display text-xl font-bold leading-tight text-white line-clamp-2">
        {event.title}
      </h2>
      <div className="mt-3 space-y-1 text-sm text-white/75">
        <p>{formatLongDate(event.start_date)}</p>
        {event.venue_name && (
          <p className="line-clamp-1">
            {event.venue_name}
            {event.venue_city ? ` \u00B7 ${event.venue_city}` : ''}
          </p>
        )}
        {event.organisation?.name && (
          <p className="text-white/55">by {event.organisation.name}</p>
        )}
        {price && <p className="font-semibold text-gold-300">{price}</p>}
      </div>
      {ticketsSoldToday > 0 && (
        <div className="mt-3.5 flex items-center gap-2 text-[11px] font-semibold text-white/85">
          <span className="relative h-2 w-2 rounded-full bg-coral-500">
            <span className="absolute inset-0 rounded-full bg-coral-500 opacity-70 animate-ping" />
          </span>
          {ticketsSoldToday} tickets sold today
        </div>
      )}
      <Link
        href={`/events/${event.slug}`}
        className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-gold-400/60 bg-gold-500/15 px-4 py-2.5 text-sm font-semibold text-gold-300 transition-colors duration-200 hover:bg-gold-500/25"
      >
        View event <span aria-hidden className="ml-1.5">&rarr;</span>
      </Link>
    </GlassCard>
  )
}

function renderHighlightCard(slide: CategoryHighlightSlide) {
  return (
    <GlassCard variant="dark" as="aside" className="rounded-2xl p-5">
      <p className="font-display text-[10px] font-semibold uppercase tracking-widest text-gold-400">
        {slide.cardEyebrow}
      </p>
      <h2 className="mt-2 font-display text-xl font-bold leading-tight text-white">
        {slide.cardTitle}
      </h2>
      <p className="mt-3 text-sm text-white/75">{slide.cardCopy}</p>
      <Link
        href={slide.ctaHref}
        className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-gold-400/60 bg-gold-500/15 px-4 py-2.5 text-sm font-semibold text-gold-300 transition-colors duration-200 hover:bg-gold-500/25"
      >
        {slide.ctaLabel} <span aria-hidden className="ml-1.5">&rarr;</span>
      </Link>
    </GlassCard>
  )
}

interface Props {
  eventSlides: FeaturedHeroEventSlide[]
  highlightSlides: CategoryHighlightSlide[]
  liveEventCount?: number
  uniqueCitiesCount?: number
}

export async function FeaturedEventHero({
  eventSlides,
  highlightSlides,
  liveEventCount = 0,
  uniqueCitiesCount = 0,
}: Props) {
  // Resolve all slide backgrounds in parallel
  const [eventMedia, highlightMedia] = await Promise.all([
    Promise.all(eventSlides.map(s => getFeaturedHeroBackground(s.event))),
    Promise.all(highlightSlides.map(s => getFeaturedHeroBackground(s.media))),
  ])

  const slides: HeroCarouselSlide[] = [
    ...eventSlides.map((s, i) => ({
      key: `event-${s.event.id}`,
      eyebrow: heroEyebrow(s.event),
      background: renderBackground(eventMedia[i]),
      card: renderEventCard(s.event, s.ticketsSoldToday),
      primaryHref: `/events/${s.event.slug}`,
      primaryLabel: 'Get tickets',
    })),
    ...highlightSlides.map((s, i) => ({
      key: `highlight-${s.key}`,
      eyebrow: s.eyebrow,
      background: renderBackground(highlightMedia[i]),
      card: renderHighlightCard(s),
      primaryHref: s.ctaHref,
      primaryLabel: s.ctaLabel,
    })),
  ]

  // Fallback: empty-state single slide if somehow we got nothing
  if (slides.length === 0) {
    const fallbackMedia = await getFeaturedHeroBackground({
      title: 'Where the culture gathers',
      category: { slug: 'festival', name: 'Festival' },
    })
    slides.push({
      key: 'fallback',
      eyebrow: 'Made for the diaspora',
      background: renderBackground(fallbackMedia),
      card: null,
      primaryHref: '/events',
      primaryLabel: 'Browse events',
    })
  }

  return (
    <HeroCarouselClient
      slides={slides}
      liveEventCount={liveEventCount}
      uniqueCitiesCount={uniqueCitiesCount}
      subcopy={HERO_SUBCOPY}
    />
  )
}
