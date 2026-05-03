import Link from 'next/link'
import { EventCardMedia, BrandedPlaceholder } from '@/components/media'
import { getEventMedia } from '@/lib/images/event-media'
import type { BentoEvent } from './event-bento-tile'

/**
 * ThisWeekCard: 280px snap-start event card for horizontal rails.
 * Server component; renders EventCardMedia (rail variant) + event meta,
 * with BrandedPlaceholder fallback when no real photography exists.
 */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
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

export async function ThisWeekCard({ event }: { event: BentoEvent }) {
  const media = await getEventMedia(event)
  const { imageSrc, imageAlt, placeholderCategory } = resolveTileMedia(event, media)
  const venue = [event.venue_name, event.venue_city].filter(Boolean).join(' \u00B7 ')
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group flex w-[240px] shrink-0 snap-start flex-col overflow-hidden rounded-lg border border-[var(--surface-2)] bg-[var(--surface-0)] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 sm:w-[280px]"
    >
      <div className="relative aspect-[3/2] overflow-hidden bg-[var(--surface-1)]">
        <div className="absolute inset-0 overflow-hidden transition-transform duration-700 ease-out group-hover:scale-105">
          {imageSrc ? (
            <EventCardMedia src={imageSrc} alt={imageAlt} variant="rail" />
          ) : (
            <BrandedPlaceholder category={placeholderCategory} />
          )}
        </div>
        {event.category?.name && (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-[var(--surface-0)]/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)] shadow-sm">
            {event.category.name}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]">
          {formatDate(event.start_date)}
        </p>
        <h3 className="mt-1 font-display text-base font-bold leading-snug text-[var(--text-primary)] line-clamp-2 transition-colors duration-200 group-hover:text-[var(--brand-accent-strong)]">
          {event.title}
        </h3>
        {venue && <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-1">{venue}</p>}
        <p className="mt-auto pt-3 font-display text-sm font-bold text-[var(--text-primary)]">
          {formatPrice(event.ticket_tiers ?? null)}
        </p>
      </div>
    </Link>
  )
}
