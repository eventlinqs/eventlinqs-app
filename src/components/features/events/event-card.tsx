import Link from 'next/link'
import { formatEventDateShort, resolveZone } from '@/lib/dates/event-time'
import { OUTBOUND_LABEL, WALK_IN_LABEL, rowPrice, sourceLabel } from '@/lib/events/whats-on-directory'
import { ROW_FREE_WITH_BOOKING } from '@/lib/events/cta'
import { isComposedCover } from '@/lib/events/generated-cover-prefix'
import { seriesAlsoOn } from '@/lib/events/series-also-on'
import { EventCardMedia } from '@/components/media/EventCardMedia'
import type { EventCardMediaVariant } from '@/components/media/EventCardMedia'
import { SaveEventButton } from './save-event-button'
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
  /** A venue photograph's credit (src/lib/images/venue-photo-chain.ts), the image's title attribute, never on the image. */
  image_credit?: string | null
  /**
   * The organiser's cover has its rights on record (public.event_image_rights reads organiser_authorised or
   * separately_licensed; read by the caller with readCoverRights). Absent means not on record: the night is a row.
   */
  cover_rights_recorded?: boolean | null
  /** The series a night belongs to, and its later nights on this page (src/lib/events/one-card-per-event.ts, P4). */
  listing_series_id?: string | null
  also_on?: string[]
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

export function EventCard({ event, dynamicPrices = new Map(), initiallySaved = false, priority = false, variant = 'grid-one-two-three', freeLabels = false }: Props) {
  const {
    id, slug, title, cover_image_url, start_date, timezone,
    venue_city, venue_country,
    organisation, badge, also_on,
  } = event
  const alsoOn = seriesAlsoOn(also_on, timezone)

  // M5 mode: caller explicitly attached a pre-computed `badge` (including
  // `null`, meaning "no badge for this event"). Disables the inventory
  // badge at the bottom and swaps the top-left pill.
  const m5Mode = 'badge' in event

  const priceLabel =
    freeLabels && (event.is_free === true || isWalkIn({ entry_mode: event.entry_mode ?? null }))
      ? freeEntryLabel(event.entry_mode)
      : formatPrice(event, dynamicPrices)

  // Location display: city if available, else country
  const location = venue_city
    ? venue_city
    : venue_country ?? null

  // A CARD ONLY WHERE A RIGHTS RECORDED PHOTOGRAPH EXISTS (Lawal's order of 1 November 2026, 16:40; the CONTROLLER's
  // 16:41 (1)). Two photographs qualify: a venue photograph the image chain applied with its credit, or the
  // organiser's own cover whose rights record reads authorised (the caller reads it and sets cover_rights_recorded).
  // That night is the Ledger card: the photograph with nothing written on it, then the day and time, the title, the
  // venue and its suburb, the price. Every other night (an image with no rights on record, our composed cover, no
  // image) is a directory row with the same facts and its ticket source, and nothing where a photograph would be. No
  // large date block, no EventLinqs mark, no panel, ever.
  const venueLine = [event.venue_name, venue_city].filter(Boolean).join(', ') || location
  const when = whenLine(start_date, timezone)
  const meta = alsoOn ? alsoOn.words : null
  const isVenuePhoto = Boolean(event.image_credit)
  const photo = cover_image_url && !isComposedCover(cover_image_url) ? cover_image_url : null
  const recorded = Boolean(photo) && (isVenuePhoto || event.cover_rights_recorded === true)

  if (!recorded) {
    const source = sourceLabel({
      ticket_tiers: event.ticket_tiers,
      external_ticket_url: event.external_ticket_url ?? null,
      is_free: event.is_free ?? null,
      entry_mode: event.entry_mode ?? null,
    })
    const shownPrice = priceLabel ? rowPrice(priceLabel) : ''
    // A free walk-in night says 'Free · Walk in' once, as its price (Lawal 09:00, refinement 4, in place of 'Free entry'
    // beside 'Walk in, no ticket needed'); the source line, the same words, is then not shown again.
    const rowPriceShown = source === WALK_IN_LABEL ? WALK_IN_LABEL : /^free/i.test(shownPrice) && OUTBOUND_LABEL.test(source) ? ROW_FREE_WITH_BOOKING : shownPrice
    return (
      <Link href={`/events/${slug}`} className="group event-row">
        <span className="min-w-0">
          {when ? <span className="event-row-when">{when}</span> : null}
          <span className="event-row-title">{title}</span>
          {venueLine ? <span className="event-row-venue">{venueLine}</span> : null}
          {meta ? <span className="event-row-venue" title={alsoOn?.every}>{meta}</span> : null}
        </span>
        {/* One fact once, no domain (Lawal, 2 November 2026, refinements 1 and 4): the price line's 'Tickets on <site>'
            is not a price (the source names the seller), and a free walk-in night says 'Free · Walk in' once. */}
        <span className="event-row-end">
          {rowPriceShown ? <span className="event-row-price">{rowPriceShown}</span> : null}
          {source && source !== rowPriceShown ? <span className="event-row-source">{source}</span> : null}
        </span>
      </Link>
    )
  }

  return (
    <Link href={`/events/${slug}`} className="group ledger-card">
      <div className="ledger-media">
        {/* Law 15 (Lawal, 2 November 2026, 14:51): a venue's photograph is shown WHOLE as an organiser's is, over its own
            blurred backdrop, never cropped to the frame and never zoomed on hover; its credit stays on the image's title. */}
        {photo && isVenuePhoto ? (
          <>
            <div className="ledger-blur" aria-hidden="true">
              <EventCardMedia src={photo} alt="" variant={variant} />
            </div>
            <EventCardMedia src={photo} alt={title} variant={variant} priority={priority} title={event.image_credit ?? null} objectFit="contain" />
          </>
        ) : photo ? (
          <>
            <div className="ledger-blur" aria-hidden="true">
              <EventCardMedia src={photo} alt="" variant={variant} />
            </div>
            <EventCardMedia src={photo} alt={title} variant={variant} priority={priority} objectFit="contain" />
          </>
        ) : null}

        {m5Mode && badge ? (
          <span data-m5-badge={badge} className={`event-card-badge ${BADGE_STYLES[badge]}`}>
            {BADGE_LABELS[badge]}
          </span>
        ) : null}

        <SaveEventButton eventId={id} initiallySaved={initiallySaved} variant="light" className="event-card-save" />
      </div>

      <div className="ledger-body">
        <div className="ledger-info">
          {when ? <p className="ledger-when">{when}</p> : <p className="sr-only">{formatEventDateShort(start_date, timezone)}</p>}
          <h3 className="ledger-title">{title}</h3>
          {m5Mode && organisation ? <p className="ledger-venue">{organisation.name}</p> : null}
          {venueLine ? <p className="ledger-venue">{venueLine}</p> : null}
          <div className="ledger-row">
            {priceLabel ? <p className="ledger-price">{priceLabel}</p> : <span />}
            {meta ? (
              <span className="ledger-meta" title={alsoOn?.every}>
                {meta}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  )
}

/**
 * 'Fri 6 Nov \u00b7 7:30 pm' in the event's own zone, one quiet line above the title (never a date block). A night stored
 * at midnight holds no time, so it reads the day alone rather than '12:00 am'.
 */
function whenLine(iso: string, timezone: string | null): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const zone = resolveZone(timezone)
  const day = new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: zone }).format(at).replace(/,/g, '')
  const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }).format(at)
  if (hm === '00:00' || hm === '24:00') return day
  const time = new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone })
    .format(at)
    .replace(/\u202f/g, ' ')
    .toLowerCase()
  return `${day} \u00b7 ${time}`
}
