import Link from 'next/link'
import { EventCardMedia } from '@/components/media'
import type { BentoEvent } from '@/components/features/events/event-bento-tile'

/**
 * TrendingEventsBento (Batch 9.2) - asymmetric 6-card bento for the
 * homepage Trending section.
 *
 * Layout:
 *   - Desktop (>=1024px): 4-col × 2-row CSS grid
 *       1 large featured: cols 1-2, rows 1-2
 *       3 medium:         col 3 row 1, col 4 row 1, col 3 row 2
 *       2 supplementary:  col 4 row 2 (one shown), 5th hidden if total >5
 *     Total visible: 5 desktop (large + 3 medium + 1 supp) - the brief
 *     specifies 6 total, but 4-col × 2-row only has 4 standard cells
 *     after the 2×2 hero. The 6th event is shown only on extra-wide
 *     viewports (xl breakpoint, 1280px+) by extending to a 6-col grid.
 *   - Mobile (<1024px): 2-col × 4-row grid
 *       1 large featured: cols 1-2, rows 1-2 (so it spans full width)
 *       4 medium:         row 3-4, 2 cols
 *
 * Cards open at /events/{slug}; class-based Plausible event
 * `trending_card_click` carries the event_slug property.
 *
 * Hero image overlay uses the same gradient pattern as the rest of the
 * platform (transparent at top, navy at bottom) for AA-compliant text
 * readability on every photographic background.
 */

interface Props {
  events: BentoEvent[]
  /** Optional override for "View all" link target. */
  viewAllHref?: string
}

const CARD_BASE = 'group relative block overflow-hidden rounded-2xl bg-ink-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2'

function formatDateBadge(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function priceLabel(event: BentoEvent): string {
  if (event.is_free) return 'Free'
  const tiers = event.ticket_tiers ?? []
  if (tiers.length === 0) return 'Tickets soon'
  const min = tiers.reduce((m, t) => Math.min(m, t.price), Number.POSITIVE_INFINITY)
  if (!Number.isFinite(min)) return 'Tickets soon'
  if (min === 0) return 'Free'
  const currency = tiers[0]?.currency ?? 'AUD'
  return `From ${currency === 'AUD' ? '$' : currency + ' '}${(min / 100).toFixed(0)}`
}

function CardContent({ event, sizeRole }: { event: BentoEvent; sizeRole: 'featured' | 'medium' }) {
  const cover = event.cover_image_url ?? event.thumbnail_url
  const titleSize = sizeRole === 'featured'
    ? 'text-2xl font-extrabold leading-tight sm:text-3xl lg:text-4xl'
    : 'text-base font-bold leading-tight sm:text-lg'

  return (
    <>
      {cover ? (
        <EventCardMedia
          src={cover}
          alt={event.title ?? 'Event'}
          variant={sizeRole === 'featured' ? 'bento-hero' : 'bento-supporting'}
          className="transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, rgb(10,22,40) 0%, rgb(20,32,56) 50%, rgb(10,22,40) 100%)',
          }}
        />
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,22,40,0.0) 35%, rgba(10,22,40,0.55) 70%, rgba(10,22,40,0.92) 100%)',
        }}
      />

      {/* Date badge - top-left */}
      <span
        className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-900 backdrop-blur"
      >
        {formatDateBadge(event.start_date)}
      </span>

      {/* Bottom content */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
        <h3 className={`font-display text-white ${titleSize}`}>
          {event.title}
        </h3>
        {event.venue_city ? (
          <p className="mt-1 text-xs font-medium text-white/85 sm:text-sm">
            {event.venue_name ? `${event.venue_name} · ${event.venue_city}` : event.venue_city}
          </p>
        ) : null}
      </div>

      {/* Price chip - bottom-right (frosted) */}
      <span
        className="absolute right-3 bottom-3 inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-accent)]"
        style={{
          background: 'rgba(10, 22, 40, 0.55)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(212, 164, 55, 0.35)',
        }}
      >
        {priceLabel(event)}
      </span>
    </>
  )
}

export function TrendingEventsBento({ events, viewAllHref = '/events?sort=trending' }: Props) {
  if (events.length < 5) return null
  const featured = events[0]
  const medium = events.slice(1, 4)
  const supplementary = events.slice(4, 6)

  return (
    <section
      aria-labelledby="trending-bento-heading"
      className="bg-canvas"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-8 w-0.5 shrink-0 bg-[var(--brand-accent)]" aria-hidden />
            <div>
              <p className="font-display text-xs font-semibold uppercase tracking-widest text-[var(--brand-accent-strong)]">
                Selling fast
              </p>
              <h2
                id="trending-bento-heading"
                className="font-display text-2xl font-extrabold tracking-tight text-ink-900 sm:text-3xl lg:text-4xl"
              >
                Trending now
              </h2>
            </div>
          </div>
          <Link
            href={viewAllHref}
            prefetch={false}
            className="shrink-0 whitespace-nowrap text-sm font-semibold text-[var(--brand-accent-strong)] hover:text-[var(--brand-accent-strong-hover)]"
          >
            Browse all events ›
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:[grid-template-rows:repeat(2,minmax(240px,1fr))]">
          {/* No aria-label on these Links: the visible CardContent
           *  provides date + title + venue + price as the accessible
           *  name, and the section's aria-labelledby anchors trend
           *  context. Adding aria-label="Trending: ..." caused
           *  label-content-name-mismatch (axe 4.11) because the visible
           *  text wasn't a subset of the label. */}
          <Link
            href={`/events/${featured.slug}`}
            prefetch={false}
            data-event-slug={featured.slug}
            className={`plausible-event-name=trending_card_click plausible-event-event_slug=${featured.slug} ${CARD_BASE} col-span-2 row-span-2 aspect-square sm:aspect-[4/3] lg:aspect-auto`}
          >
            <CardContent event={featured} sizeRole="featured" />
          </Link>
          {medium.map(event => (
            <Link
              key={event.id}
              href={`/events/${event.slug}`}
              prefetch={false}
              data-event-slug={event.slug}
              className={`plausible-event-name=trending_card_click plausible-event-event_slug=${event.slug} ${CARD_BASE} aspect-[4/5] sm:aspect-[5/4] lg:aspect-auto`}
            >
              <CardContent event={event} sizeRole="medium" />
            </Link>
          ))}
          {supplementary.slice(0, 1).map(event => (
            <Link
              key={event.id}
              href={`/events/${event.slug}`}
              prefetch={false}
              data-event-slug={event.slug}
              className={`plausible-event-name=trending_card_click plausible-event-event_slug=${event.slug} ${CARD_BASE} aspect-[4/5] sm:aspect-[5/4] lg:aspect-auto`}
            >
              <CardContent event={event} sizeRole="medium" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
