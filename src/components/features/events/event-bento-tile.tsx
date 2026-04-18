import Link from 'next/link'
import { SmartMedia } from '@/components/ui/smart-media'
import { GlassCard } from '@/components/ui/glass-card'
import { getEventMedia, getFeaturedEventMedia, type EventMediaInput } from '@/lib/images/event-media'
import { SaveEventButton } from './save-event-button'
import type { BentoSize } from './bento-grid'

/**
 * EventBentoTile — renders a single event tile with SmartMedia background.
 *
 * Server component. Fetches media via the orchestrator. Every tile is a
 * link to the event page, with hover lift + gold border on interaction.
 */

export interface BentoEvent extends EventMediaInput {
  id: string
  slug: string
  start_date: string
  venue_name?: string | null
  venue_city?: string | null
  ticket_tiers?: { price: number; currency: string }[] | null
  summary?: string | null
  is_free?: boolean | null
  percent_sold?: number | null
  sold_today?: number | null
}

interface Props {
  event: BentoEvent
  size: BentoSize
  useVideoFallback?: boolean
  featured?: boolean
  pillLabel?: string
  initiallySaved?: boolean
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatCheapestPrice(tiers: BentoEvent['ticket_tiers']): string | null {
  if (!tiers || tiers.length === 0) return 'Free'
  const cheapest = tiers.reduce((m, t) => (t.price < m.price ? t : m), tiers[0])
  if (cheapest.price === 0) return 'Free'
  const dollars = cheapest.price / 100
  const formatted = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
  return `From ${cheapest.currency ?? 'AUD'} ${formatted}`
}

function liveSignal(event: BentoEvent): string | null {
  const now = new Date()
  const start = new Date(event.start_date)
  const daysTo = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (event.sold_today && event.sold_today > 0) {
    return `${event.sold_today} sold today`
  }
  if (event.percent_sold !== null && event.percent_sold !== undefined && event.percent_sold >= 70) {
    return `${event.percent_sold}% sold`
  }
  if (daysTo >= 0 && daysTo <= 3) {
    return daysTo === 0 ? 'Tonight' : daysTo === 1 ? 'Tomorrow' : `${daysTo} days to go`
  }
  return null
}

function titleSize(size: BentoSize): string {
  switch (size) {
    case 'hero':     return 'text-2xl md:text-3xl lg:text-4xl'
    case 'wide':     return 'text-xl md:text-2xl'
    case 'standard': return 'text-lg md:text-xl'
    case 'compact':  return 'text-base'
    case 'tall':     return 'text-xl md:text-2xl'
  }
}

export async function EventBentoTile({
  event,
  size,
  useVideoFallback = false,
  featured = false,
  pillLabel,
  initiallySaved = false,
}: Props) {
  const media = useVideoFallback
    ? await getFeaturedEventMedia(event)
    : await getEventMedia(event)

  const autoplayVideo = size === 'hero' && media.kind === 'video'
  const price = formatCheapestPrice(event.ticket_tiers ?? null)
  const signal = liveSignal(event)
  const venue = [event.venue_name, event.venue_city].filter(Boolean).join(' · ')
  const category = pillLabel ?? event.category?.name ?? null

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group relative flex h-full w-full flex-col overflow-hidden rounded-2xl bg-ink-900 tile-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
      aria-label={event.title ?? 'Event'}
    >
      <div className="absolute inset-0">
        <SmartMedia
          media={media}
          autoplay={autoplayVideo}
          carouselInterval={size === 'hero' ? 4000 : 6000}
          priority={size === 'hero'}
          className="transition-transform duration-[1400ms] ease-out group-hover:scale-[1.04]"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0) 0%, rgba(10,22,40,0.15) 45%, rgba(10,22,40,0.85) 100%)',
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-transparent transition-colors duration-300 group-hover:border-gold-400/70"
          aria-hidden
        />
      </div>

      <div className="relative z-10 flex items-start justify-between gap-2 p-4 md:p-5">
        {category ? (
          <GlassCard
            variant="dark"
            className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white"
          >
            {category}
          </GlassCard>
        ) : <span />}

        <div className="flex items-start gap-2">
          <div className="flex flex-col items-end gap-2">
            {featured && (
              <span className="rounded-full bg-gold-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-sm">
                Featured
              </span>
            )}
            {signal && (
              <GlassCard
                variant="dark"
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold text-white"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral-500 opacity-80" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-coral-500" />
                </span>
                {signal}
              </GlassCard>
            )}
          </div>
          <SaveEventButton eventId={event.id} initiallySaved={initiallySaved} variant="dark" />
        </div>
      </div>

      <div className="flex-1" />

      <div className="relative z-10 p-4 md:p-5 text-white transition-transform duration-300 group-hover:-translate-y-1">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-400">
          {formatDate(event.start_date)}
        </p>
        <h3 className={`mt-1 font-display font-extrabold leading-tight ${titleSize(size)} line-clamp-2`}>
          {event.title}
        </h3>
        {size !== 'compact' && venue && (
          <p className="mt-1.5 text-xs text-white/75 line-clamp-1">{venue}</p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          {price && (
            <p className="text-sm font-semibold text-gold-300">{price}</p>
          )}
          {(size === 'hero' || size === 'wide') && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-white transition-transform duration-300 group-hover:translate-x-1">
              Get tickets <span aria-hidden>&rarr;</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
