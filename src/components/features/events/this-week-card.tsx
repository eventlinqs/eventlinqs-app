import Link from 'next/link'
import { SmartMedia } from '@/components/ui/smart-media'
import { getEventMedia } from '@/lib/images/event-media'
import type { BentoEvent } from './event-bento-tile'

/**
 * ThisWeekCard — 280px snap-start event card for horizontal rails.
 * Server component; renders SmartMedia + event meta.
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

export async function ThisWeekCard({ event }: { event: BentoEvent }) {
  const media = await getEventMedia(event)
  const venue = [event.venue_name, event.venue_city].filter(Boolean).join(' \u00B7 ')
  return (
    <Link
      href={`/events/${event.slug}`}
      className="group relative flex w-[240px] shrink-0 snap-start flex-col overflow-hidden rounded-xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg sm:w-[280px]"
      aria-label={event.title ?? 'Event'}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-ink-900">
        <SmartMedia
          media={media}
          className="transition-transform duration-[1400ms] ease-out group-hover:scale-[1.05]"
        />
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
        <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
          {formatDate(event.start_date)}
        </p>
        <h3 className="mt-1 font-display text-base font-bold leading-snug text-ink-900 line-clamp-2 transition-colors duration-200 group-hover:text-gold-600">
          {event.title}
        </h3>
        {venue && <p className="mt-1 text-xs text-ink-400 line-clamp-1">{venue}</p>}
        <p className="mt-2 text-sm font-semibold text-gold-700">
          {formatPrice(event.ticket_tiers ?? null)}
        </p>
      </div>
    </Link>
  )
}
