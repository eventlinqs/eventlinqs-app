import Link from 'next/link'
import { HeroMedia } from '@/components/media'
import { GlassCard } from '@/components/ui/glass-card'
import { getFeaturedHeroBackground, type EventMediaInput } from '@/lib/images/event-media'
import type { CategoryHighlightSlide } from '@/lib/content/category-highlight-slides'
import { type HeroCarouselSlide } from './hero-carousel-client'
import { HeroCarouselEnhancer } from './hero-carousel-enhancer'
import { FeaturedHeroStaticShell } from './featured-hero-static-shell'

/**
 * FeaturedEventHero - full-viewport cinematic hero carousel.
 *
 * Accepts a mix of real event slides + curated category highlight slides.
 * Pre-resolves each slide's background media in parallel on the server,
 * then hands pre-rendered JSX to the client carousel component.
 *
 * The H1 is always the locked brand promise ("Every culture. Every event.
 * One platform."). Event identity lives in the ribbon card on the right.
 * The eyebrow rotates based on the active slide's signal: happening soon,
 * trending, or the brand default.
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
  'The ticketing platform built for every culture. Afrobeats, Caribbean, Bollywood, Latin, Italian, Filipino, Lunar, Gospel, Amapiano, Comedy, Spanish, K-Pop, Reggae and more. All-in pricing, no surprise fees.'

function heroEyebrow(event: FeaturedHeroEvent): string {
  const daysToStart = Math.ceil(
    (new Date(event.start_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  )
  if (daysToStart >= 0 && daysToStart <= 2) return 'Happening this weekend'
  if ((event.percent_sold ?? 0) > 70) return 'Trending now'
  return 'Made for every culture'
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
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

function renderBackground(
  media: Awaited<ReturnType<typeof getFeaturedHeroBackground>>,
  priority: boolean,
) {
  return (
    <>
      <HeroMedia
        image={media.image}
        alt={media.alt}
        videoSrc={priority ? media.videoSrc : undefined}
        kenBurns={priority && media.kenBurns}
        priority={priority}
      />
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
    <GlassCard variant="light-on-dark" as="aside" className="rounded-xl p-5">
      <p className="font-display text-[10px] font-bold uppercase tracking-widest text-gold-700">
        Happening soon
      </p>
      <h2 className="mt-2 font-display text-xl font-bold leading-tight text-ink-900 line-clamp-2">
        {event.title}
      </h2>
      <div className="mt-3 space-y-1 text-sm text-ink-700">
        <p>{formatLongDate(event.start_date)}</p>
        {event.venue_name && (
          <p className="line-clamp-1">
            {event.venue_name}
            {event.venue_city ? ` \u00B7 ${event.venue_city}` : ''}
          </p>
        )}
        {event.organisation?.name && (
          <p className="text-ink-600">by {event.organisation.name}</p>
        )}
        {price && (
          <p className="font-display text-[18px] font-extrabold text-ink-900">
            {price}
          </p>
        )}
      </div>
      {ticketsSoldToday > 0 && (
        <div className="mt-3.5 flex items-center gap-2 text-[11px] font-semibold text-ink-700">
          <span className="relative h-2 w-2 rounded-full bg-coral-500">
            <span className="absolute inset-0 rounded-full bg-coral-500 opacity-70 animate-ping" />
          </span>
          {ticketsSoldToday} tickets sold today
        </div>
      )}
      <Link
        href={`/events/${event.slug}`}
        className="mt-4 flex w-full items-center justify-center rounded-lg bg-gold-500 py-3 font-bold text-ink-900 transition-colors hover:bg-gold-400"
      >
        View event <span aria-hidden className="ml-1.5">&rarr;</span>
      </Link>
    </GlassCard>
  )
}

function renderHighlightCard(slide: CategoryHighlightSlide) {
  return (
    <GlassCard variant="light-on-dark" as="aside" className="rounded-xl p-5">
      <p className="font-display text-[10px] font-bold uppercase tracking-widest text-gold-700">
        {slide.cardEyebrow}
      </p>
      <h2 className="mt-2 font-display text-xl font-bold leading-tight text-ink-900">
        {slide.cardTitle}
      </h2>
      <p className="mt-3 text-sm text-ink-700">{slide.cardCopy}</p>
      <Link
        href={slide.ctaHref}
        className="mt-5 flex w-full items-center justify-center rounded-lg bg-gold-500 py-3 font-bold text-ink-900 transition-colors hover:bg-gold-400"
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

  // Only the first slide's background gets priority+preload so the browser
  // commits to a single LCP candidate instead of thrashing between 3-6 hero
  // images racing for fetchpriority=high in parallel.
  const slides: HeroCarouselSlide[] = [
    ...eventSlides.map((s, i) => ({
      key: `event-${s.event.id}`,
      eyebrow: heroEyebrow(s.event),
      background: renderBackground(eventMedia[i], i === 0),
      card: renderEventCard(s.event, s.ticketsSoldToday),
      primaryHref: `/events/${s.event.slug}`,
      primaryLabel: 'Get tickets',
    })),
    ...highlightSlides.map((s, i) => ({
      key: `highlight-${s.key}`,
      eyebrow: s.eyebrow,
      background: renderBackground(highlightMedia[i], eventSlides.length === 0 && i === 0),
      card: renderHighlightCard(s),
      primaryHref: s.ctaHref,
      primaryLabel: s.ctaLabel,
    })),
  ]

  // Fallback: empty-state single slide if somehow we got nothing
  if (slides.length === 0) {
    const fallbackMedia = await getFeaturedHeroBackground({
      title: 'Every culture, every event',
      category: { slug: 'festival', name: 'Festival' },
    })
    slides.push({
      key: 'fallback',
      eyebrow: 'Made for every culture',
      background: renderBackground(fallbackMedia, true),
      card: null,
      primaryHref: '/events',
      primaryLabel: 'Browse events',
    })
  }

  return (
    <>
      <FeaturedHeroStaticShell
        slide={slides[0]}
        liveEventCount={liveEventCount}
        uniqueCitiesCount={uniqueCitiesCount}
        subcopy={HERO_SUBCOPY}
        showIndicators={slides.length > 1}
        totalSlides={slides.length}
      />
      <HeroCarouselEnhancer
        slides={slides}
        liveEventCount={liveEventCount}
        uniqueCitiesCount={uniqueCitiesCount}
        subcopy={HERO_SUBCOPY}
      />
    </>
  )
}
