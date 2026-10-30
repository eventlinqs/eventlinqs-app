import Link from 'next/link'
import { formatEventDateShort } from '@/lib/dates/event-time'
import { MapPin } from 'lucide-react'
import { EventCardMedia } from '@/components/media/EventCardMedia'
import type { EventCardMediaVariant } from '@/components/media/EventCardMedia'
import { SocialProofBadge } from '@/components/inventory/social-proof-badge'
import { SaveEventButton } from './save-event-button'
import type { EventInventory } from '@/lib/redis/inventory-cache'
import type { SocialProofBadge as M5Badge } from '@/lib/events/types'
import { BADGE_LABELS, BADGE_STYLES } from '@/lib/events/badges'
import { broadcastPriceLabel } from '@/lib/broadcast/price-line'
import { isWalkIn } from '@/lib/events/entry-mode'
import { freeEntryLabel } from '@/lib/listings/free-week'

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
  /**
   * The EVENT own IANA zone, so the date on this card is the day the event
   * happens rather than the day it happens in UTC. REQUIRED rather than
   * optional: an optional field would have let every existing caller keep
   * printing the wrong day in silence, and the compiler naming each one is
   * the only way to be sure they were all found.
   */
  timezone: string | null
  venue_name: string | null
  venue_city: string | null
  venue_country: string | null
  created_at: string
  category: { name: string; slug: string } | null
  ticket_tiers: EventCardTier[]
  is_free?: boolean | null
  /** WI1. A walk-in event says "Free entry" where the price goes. */
  entry_mode?: string | null
  /** A night sold on another site: the card's price line names the site ("Tickets on ..."), never "Free". */
  external_ticket_url?: string | null
  organisation?: { name: string; slug?: string } | null
  badge?: M5Badge | null
}

type Props = {
  event: EventCardData
  dynamicPrices?: Map<string, number>
  initiallySaved?: boolean
  priority?: boolean
  /**
   * Layout context. Drives the underlying EventCardMedia variant so the srcset
   * hint matches the width this card actually renders at.
   *
   * The default is the ladder eight templates render
   * (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`), so those callers say nothing.
   * Every other caller names its own ladder or cell, because until 18 September
   * 2026 they all shared one hint and it was wrong for all of them: two-up was
   * claimed to begin at 640 where it begins at 768, so every card between those
   * two widths was fetched at half the size it rendered at.
   */
  variant?: Extract<
    EventCardMediaVariant,
    | 'grid-one-two-three'
    | 'grid-one-two-three-sm'
    | 'grid-one-three'
    | 'grid-one-two-three-four'
    | 'grid-one-two-four'
    | 'rail-flat'
  >
  /**
   * WI2's city guide, a page of free events only: the price position says which
   * free it is, "Free entry, no ticket needed" or "Free, ticket needed" (the
   * founder's answer 3 of 21 October 2026, src/lib/listings/free-week.ts).
   * Every other surface keeps the short labels.
   */
  freeLabels?: boolean
}



/**
 * THE CARD'S PRICE LINE IS THE NIGHT'S CALL TO ACTION (rules E6 and E7; the project manager's 12:40 of 30 October
 * 2026). This used to answer 'Free' for any night with no ticket types of ours, so Kate Ceberano's paid Costa Hall
 * show, sold by Geelong Arts Centre, read 'Free' on /city/geelong. It now asks the one function every broadcast asks
 * (src/lib/broadcast/price-line.ts): a night sold elsewhere names the site, free is said only where free is stored
 * (a walk-in, our own $0 tickets, or is_free), one wording for each free state, and a night whose price nobody has
 * checked says no price at all.
 */
function formatPrice(event: EventCardData, dynamicPrices: Map<string, number>): string {
  return broadcastPriceLabel({
    ticket_tiers: event.ticket_tiers.map((t) => ({ price: dynamicPrices.get(t.id) ?? t.price, currency: t.currency })),
    external_ticket_url: event.external_ticket_url ?? null,
    is_free: event.is_free ?? null,
    entry_mode: event.entry_mode ?? null,
  })
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

export function EventCard({ event, dynamicPrices = new Map(), initiallySaved = false, priority = false, variant = 'grid-one-two-three', freeLabels = false }: Props) {
  const {
    id, slug, title, cover_image_url, start_date, timezone,
    venue_city, venue_country, created_at, category, ticket_tiers,
    organisation, badge,
  } = event

  // M5 mode: caller explicitly attached a pre-computed `badge` (including
  // `null`, meaning "no badge for this event"). Disables the inventory
  // badge at the bottom and swaps the top-left pill.
  const m5Mode = 'badge' in event

  const priceLabel =
    freeLabels && (event.is_free === true || isWalkIn({ entry_mode: event.entry_mode ?? null }))
      ? freeEntryLabel(event.entry_mode)
      : formatPrice(event, dynamicPrices)
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
      //   `transition-all` is explicitly forbidden by the spec; transform and
      //   box-shadow are named explicitly inside `event-card-surface`, at the
      //   same 200ms and the same ease-out. Aspect ratio (1:1 per spec) is
      //   deferred to a follow-up because event-card.tsx ships site-wide;
      //   see SUMMARY.md.
      // Close-out C14.12 (6 September 2026): the card radius (16px, the same
      // as every homepage card; this one was the 8px control radius), the two
      // elevation tokens, and a 4px lift, so the browse card and the rail card
      // are one object at two widths.
      // Close-out C8B.3 (19 September 2026): the 428-character list that used
      // to be written here is `event-card-surface` in globals.css. It was said
      // 40 times on /events - in the markup and again in the RSC payload - and
      // this component renders on eighteen surfaces. `group` stays: it is a
      // variant marker with no declarations of its own.
      className="group event-card-surface"
    >
      <div className="event-card-media">
        {cover_image_url ? (
          <EventCardMedia
            src={cover_image_url}
            alt={title}
            variant={variant}
            priority={priority}
            // The typographic cover's facts: the category only where the pill does not already say it on the image.
            category={m5Mode ? (category?.name ?? null) : null}
            startDate={start_date}
            timeZone={timezone ?? null}
            // Image scale-up per spec card hover: subtle 1.02 (2%).
            // Previous 1.05 / 700ms ease-out replaced with .card-hover-img
            // utility (transform: scale 1.02 under --motion-quick).
            className="card-hover-img event-card-zoom"
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
                className={`event-card-badge ${BADGE_STYLES[badge]}`}
              >
                {BADGE_LABELS[badge]}
              </span>
            )
          : category && (
              <span className="event-card-pill">
                {category.name}
              </span>
            )}

        <SaveEventButton
          eventId={id}
          initiallySaved={initiallySaved}
          variant="light"
          className="event-card-save"
        />
      </div>

      {/* Card body per docs/M5-DESIGN-SPEC.md / Card design:
       *   20px top padding, left-aligned (never centred), title at
       *   --type-h4, date/venue at --type-small, price at --type-body
       *   (17/600). Price kept prominent at the bottom-right of the
       *   metadata row.
       *   The four padding declarations were an inline style object, paid per
       *   card in the markup and serialised again into the RSC payload; they
       *   are `event-card-body` in globals.css now, set from the same two
       *   tokens (close-out C8B.3, 19 September 2026). */}
      <div className="event-card-body">
        {m5Mode && organisation ? (
          <p className="type-small text-[var(--text-secondary)]">{organisation.name}</p>
        ) : (
          <p
            /* The 600 stays an inline style on purpose: `.type-micro` is an
             * UNLAYERED rule setting font-weight 500, and unlayered CSS beats
             * `@layer utilities`, so a weight folded into the composite would
             * lose to it silently. */
            className="type-micro event-card-date"
            style={{ fontWeight: 600 }}
          >
            {formatEventDateShort(start_date, timezone)}
          </p>
        )}

        {/* Title at the card step of the one scale, 18px on every viewport
         *  (Design system: "Card titles 18px"; the homepage rail card is the
         *  same). It ran at --type-h4, 22px on desktop, which outranked the
         *  24px section heading above the grid in weight and nearly in size.
         *  Hover: navy stays, gold underline added (spec). */}
        <h3 className="event-card-title">
          {title}
        </h3>

        {m5Mode ? (
          /* `gap-1.5` and `gap-1` used to sit on these two rows and neither
           * ever applied: the inline `gap` token beat both. One row now. */
          <p className="type-small event-card-meta">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{formatEventDateShort(start_date, timezone)}</span>
            {location && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate">{location}</span>
              </>
            )}
          </p>
        ) : (
          location && (
            <p className="type-small event-card-meta">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              {location}
            </p>
          )
        )}

        {/* Price row - --type-body 17/600 per spec. mt-auto pushes to
         *  bottom of the card. */}
        <div className="event-card-footer">
          <p className="event-card-price">
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
