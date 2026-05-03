import Link from 'next/link'
import { EventCardMedia, BrandedPlaceholder } from '@/components/media'
import { getEventMedia } from '@/lib/images/event-media'
import type { BentoEvent } from './event-bento-tile'

/**
 * ThisWeekStrip: horizontal scroll strip of events in the next 7 days.
 * CSS scroll-snap on the container, 280px cards.
 *
 * Server component. Each card renders EventCardMedia (rail variant) with
 * BrandedPlaceholder fallback when no real photography exists.
 */

interface Props {
  events: BentoEvent[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatPrice(tiers: BentoEvent['ticket_tiers']): string {
  if (!tiers || tiers.length === 0) return 'Free'
  const cheapest = tiers.reduce((m, t) => (t.price < m.price ? t : m), tiers[0])
  if (cheapest.price === 0) return 'Free'
  const dollars = cheapest.price / 100
  const formatted = Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`
  return `${cheapest.currency ?? 'AUD'} ${formatted}`
}

interface ResolvedTileMedia {
  imageSrc: string | null
  imageAlt: string
  placeholderCategory: string | null
}

function resolveTileMedia(
  event: BentoEvent,
  media: Awaited<ReturnType<typeof getEventMedia>>,
): ResolvedTileMedia {
  const fallbackAlt = event.title ?? 'Event'
  if (media.kind === 'video') {
    return { imageSrc: media.poster, imageAlt: fallbackAlt, placeholderCategory: null }
  }
  if (media.kind === 'carousel') {
    return {
      imageSrc: media.images[0] ?? null,
      imageAlt: media.alts[0] ?? fallbackAlt,
      placeholderCategory: null,
    }
  }
  if (media.kind === 'still-kenburns') {
    return { imageSrc: media.src, imageAlt: media.alt ?? fallbackAlt, placeholderCategory: null }
  }
  return { imageSrc: null, imageAlt: fallbackAlt, placeholderCategory: media.category }
}

async function ThisWeekCard({ event }: { event: BentoEvent }) {
  const media = await getEventMedia(event)
  const { imageSrc, imageAlt, placeholderCategory } = resolveTileMedia(event, media)
  const venue = [event.venue_name, event.venue_city].filter(Boolean).join(' \u00B7 ')
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group relative flex w-[280px] shrink-0 snap-start flex-col overflow-hidden rounded-xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-ink-900">
        <div className="absolute inset-0 overflow-hidden transition-transform duration-[1400ms] ease-out group-hover:scale-[1.05]">
          {imageSrc ? (
            <EventCardMedia src={imageSrc} alt={imageAlt} variant="rail" />
          ) : (
            <BrandedPlaceholder category={placeholderCategory} />
          )}
        </div>
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(10,22,40,0) 60%, rgba(10,22,40,0.7) 100%)',
          }}
          aria-hidden
        />
        {event.category?.name && (
          <span className="absolute left-3 top-3 rounded-full bg-ink-900/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-white backdrop-blur-md">
            {event.category.name}
          </span>
        )}
      </div>
      <div className="flex flex-col p-4">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-500">
          {formatDate(event.start_date)}
        </p>
        <h3 className="mt-1 font-display text-base font-bold leading-snug text-ink-900 line-clamp-2 transition-colors duration-200 group-hover:text-gold-600">
          {event.title}
        </h3>
        {venue && <p className="mt-1 text-xs text-ink-400 line-clamp-1">{venue}</p>}
        <p className="mt-2 text-sm font-semibold text-gold-600">
          {formatPrice(event.ticket_tiers ?? null)}
        </p>
      </div>
    </Link>
  )
}

export async function ThisWeekStrip({ events }: Props) {
  if (!events.length) return null
  const cards = await Promise.all(events.map(e => ThisWeekCard({ event: e })))

  return (
    <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Right-edge gradient fade hints at more content */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-canvas to-transparent"
      />
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 pt-1 scrollbar-none sm:px-6 lg:px-8">
        {cards}
      </div>
    </div>
  )
}
