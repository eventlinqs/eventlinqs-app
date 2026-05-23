import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { EventCardMedia, type EventCardMediaVariant } from '@/components/media'
import { SocialProofBadge } from '@/components/inventory/social-proof-badge'
import { SaveEventButton } from './save-event-button'
import type { EventInventory } from '@/lib/redis/inventory-cache'
import type { SocialProofBadge as M5Badge } from '@/lib/events/types'
import { BADGE_LABELS, BADGE_STYLES } from '@/lib/events/badges'

/**
 * EventCard - spec §6.2
 *
 * Layout:
 *   - Image: 16:9 mobile (edge-to-edge in grid), 4:3 on md+ (desktop grid)
 *   - Category pill: absolute top-left overlay on image
 *   - Heart/save button: absolute bottom-right of image
 *   - Card body: date (gold), title (Manrope), location, price + social proof
 *
 * Price: "From AUD $X" - Manrope 700, no decimal for round cents
 *
 * M5 mode: when `event.badge` is explicitly provided (non-undefined),
 * the card shows the M5 single-priority social-proof badge top-left
 * (replacing the category pill) and renders the organisation name above
 * the title instead of the bottom inventory chip.
 */

export type EventCardTier = {
  id: string
  price: number
  currency: string
  sold_count: number
  reserved_count: number
  total_capacity: number
}

export type EventCardData = {
  id: string
  slug: string
  title: string
  cover_image_url: string | null
  thumbnail_url: string | null
  start_date: string
  venue_name: string | null
  venue_city: string | null
  venue_country: string | null
  created_at: string
  category: { name: string; slug: string } | null
  ticket_tiers: EventCardTier[]
  is_free?: boolean | null
  organisation?: { name: string; slug?: string } | null
  badge?: M5Badge | null
}

type Props = {
  event: EventCardData
  dynamicPrices?: Map<string, number>
  initiallySaved?: boolean
  priority?: boolean
  /**
   * Layout context. Drives the underlying EventCardMedia variant so the
   * srcset hint matches the actual rendered width. Pass `"rail"` when the
   * card sits in a horizontal rail (fixed ~256-288px tile) so the browser
   * does not download a 750w image for a 254 CSS px slot.
   */
  variant?: Extract<EventCardMediaVariant, 'card' | 'rail'>
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatPrice(
  tiers: EventCardTier[],
  dynamicPrices: Map<string, number>,
  isFree: boolean | null = null,
): string {
  if (isFree === true) return 'Free'
  if (!tiers || tiers.length === 0) return 'Free'
  const effectivePrices = tiers.map(t => dynamicPrices.get(t.id) ?? t.price)
  const min = Math.min(...effectivePrices)
  if (min === 0) return 'Free'
  const currency = tiers[0].currency ?? 'AUD'
  const dollars = min / 100
  const formatted = Number.isInteger(dollars)
    ? `$${dollars}`
    : `$${dollars.toFixed(2)}`
  return `From ${currency} ${formatted}`
}

function buildInventory(tiers: EventCardTier[]): EventInventory {
  const total_sold      = tiers.reduce((s, t) => s + t.sold_count, 0)
  const total_reserved  = tiers.reduce((s, t) => s + t.reserved_count, 0)
  const total_capacity  = tiers.reduce((s, t) => s + t.total_capacity, 0)
  const available       = Math.max(0, total_capacity - total_sold - total_reserved)
  const percent_sold    = total_capacity > 0
    ? Math.round((total_sold / total_capacity) * 100)
    : 0
  return { total_sold, total_reserved, total_capacity, available, percent_sold }
}

export function EventCard({ event, dynamicPrices = new Map(), initiallySaved = false, priority = false, variant = 'card' }: Props) {
  const {
    id, slug, title, cover_image_url, start_date,
    venue_city, venue_country, created_at, category, ticket_tiers,
    organisation, badge,
  } = event

  // M5 mode: caller explicitly attached a pre-computed `badge` (including
  // `null`, meaning "no badge for this event"). Disables the inventory
  // badge at the bottom and swaps the top-left pill.
  const m5Mode = 'badge' in event

  const priceLabel = formatPrice(ticket_tiers, dynamicPrices, event.is_free ?? null)
  const inventory  = ticket_tiers.length > 0 ? buildInventory(ticket_tiers) : null

  // Location display: city if available, else country
  const location = venue_city
    ? venue_city
    : venue_country ?? null

  return (
    <Link
      href={`/events/${slug}`}
      // M5 card hover per docs/M5-DESIGN-SPEC.md / Card design:
      //   200ms ease-out (--motion-quick), 0 -> 4px navy/8% shadow on hover.
      //   `transition-all` is explicitly forbidden by the spec; we declare
      //   transform + box-shadow explicitly on transition via globals.css
      //   .card-hover-transition utility. Aspect ratio (1:1 per spec) is
      //   deferred to a follow-up because event-card.tsx ships site-wide;
      //   see SUMMARY.md.
      className="group card-hover-transition flex flex-col rounded-lg overflow-hidden bg-[var(--surface-0)] border border-[var(--surface-2)] hover:shadow-[0_4px_12px_rgba(10,22,40,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 motion-reduce:transition-none"
    >
      <div className="relative aspect-video md:aspect-[4/3] overflow-hidden bg-[var(--surface-1)]">
        {cover_image_url ? (
          <EventCardMedia
            src={cover_image_url}
            alt={title}
            variant={variant}
            priority={priority}
            // Image scale-up per spec card hover: subtle 1.02 (2%).
            // Previous 1.05 / 700ms ease-out replaced with .card-hover-img
            // utility (transform: scale 1.02 under --motion-quick).
            className="card-hover-img group-hover:scale-[1.02] motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--text-muted)]">
            <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {m5Mode
          ? badge && (
              <span
                data-m5-badge={badge}
                className={`absolute left-3 top-3 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest shadow-sm ${BADGE_STYLES[badge]}`}
              >
                {BADGE_LABELS[badge]}
              </span>
            )
          : category && (
              <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-[var(--surface-0)]/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-primary)] shadow-sm">
                {category.name}
              </span>
            )}

        <SaveEventButton
          eventId={id}
          initiallySaved={initiallySaved}
          variant="light"
          className="absolute right-3 top-3 shadow-sm"
        />
      </div>

      {/* Card body per docs/M5-DESIGN-SPEC.md / Card design:
       *   20px top padding, left-aligned (never centred), title at
       *   --type-h4, date/venue at --type-small, price at --type-body
       *   (17/600). Price kept prominent at the bottom-right of the
       *   metadata row. */}
      <div
        className="flex flex-1 flex-col"
        style={{
          paddingTop: 'var(--space-card-padding-y)',
          paddingBottom: 'var(--space-card-padding-y)',
          paddingLeft: 'var(--space-card-padding-x)',
          paddingRight: 'var(--space-card-padding-x)',
        }}
      >
        {m5Mode && organisation ? (
          <p className="type-small text-[var(--text-secondary)]">{organisation.name}</p>
        ) : (
          <p
            className="type-micro font-display uppercase tracking-widest text-[var(--brand-accent-strong)]"
            style={{ fontWeight: 600 }}
          >
            {formatDate(start_date)}
          </p>
        )}

        {/* Title - --type-h4 (22/600/1.3 desktop, 18/600/1.35 mobile).
         *  Hover: navy stays, gold underline added (spec). */}
        <h3
          className="type-h4 mt-1 text-[var(--text-primary)] line-clamp-2 underline-offset-4 decoration-[var(--brand-accent)] decoration-2 group-hover:underline"
          style={{ transition: 'text-decoration-color var(--motion-quick)' }}
        >
          {title}
        </h3>

        {m5Mode ? (
          <p
            className="type-small mt-1.5 flex items-center gap-1.5 text-[var(--text-secondary)]"
            style={{ gap: 'var(--space-tight-gap)' }}
          >
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{formatDate(start_date)}</span>
            {location && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{location}</span>
              </>
            )}
          </p>
        ) : (
          location && (
            <p
              className="type-small mt-1.5 flex items-center gap-1 text-[var(--text-secondary)]"
              style={{ gap: 'var(--space-tight-gap)' }}
            >
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              {location}
            </p>
          )
        )}

        {/* Price row - --type-body 17/600 per spec. mt-auto pushes to
         *  bottom of the card. */}
        <div
          className="mt-auto flex items-center justify-between"
          style={{ gap: 'var(--space-tight-gap)', paddingTop: 'var(--space-tight-gap)' }}
        >
          <p
            className="font-display text-[var(--text-primary)]"
            style={{ fontSize: 'var(--type-body)', fontWeight: 600 }}
          >
            {priceLabel}
          </p>
          {!m5Mode && inventory && (
            <SocialProofBadge
              inventory={inventory}
              createdAt={created_at}
              compact
            />
          )}
        </div>
      </div>
    </Link>
  )
}
