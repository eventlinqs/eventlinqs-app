/**
 * WI3: ONE EVENT, EVERY PLACE IT SELLS (the project manager's 12:30 of 27 October
 * 2026, on Lawal's 12:23: "He wants to sell tickets. That's all that matters to
 * him."). docs/walk-in/WI3-DECISION.md.
 *
 * An event sold on several platforms is ONE listing with several booking links
 * (public.event_booking_links, 20261027130001), never one card per platform. This
 * file holds what the import, the daily link check and the claim share:
 *
 * - providerOf: which platform a link is on, read from its host only, the same
 *   rule as the database's event_booking_provider_of.
 * - buttonOf: the link the one big button opens, the same order as the
 *   database's event_booking_button: never a dead link; the organiser's own
 *   choice once claimed; then the link the organiser's own website or Instagram
 *   points to; then on sale over not yet over sold out; then the first found.
 *   Never by what pays EventLinqs.
 * - alsoOn: every other live link, in that order, for the one quiet line under
 *   the button.
 * - sameEvent: whether two listings are one event (the same venue, a start
 *   within two hours, titles alike), so a second source adds a link and never a
 *   second card.
 *
 * The page reads the links; events.external_ticket_url is the database's mirror of
 * the button (the sale gate and every older reader read it), never written here.
 */
import { venueSlugify } from '@/lib/venues/venue-slug'
import { sqlLiteral, WriteRefusal } from '@/lib/listings/import-write'

export const BOOKING_PROVIDERS = [
  'humanitix',
  'eventbrite',
  'trybooking',
  'moshtix',
  'oztix',
  'ticketek',
  'ticketmaster',
  'dice',
  'venue',
  'organiser_site',
  'other',
] as const
export type BookingProvider = (typeof BOOKING_PROVIDERS)[number]

/**
 * The major ticketing sellers, as provider ids. The growth priority math (src/lib/growth/priority-math.ts) weighs an
 * organiser tied to these differently from one on an independent seller; it reads this set rather than naming them, so
 * this file stays the one table of platform names (copy-tell-gate's allowlist).
 */
export const MAJOR_SELLERS: ReadonlySet<BookingProvider> = new Set<BookingProvider>(['ticketek', 'ticketmaster', 'moshtix', 'oztix'])

/** Bandsintown's own set: "Tickets, Presale, VIP, Free and Sold Out" (Free read as free with registration). */
export const BOOKING_KINDS = ['tickets', 'presale', 'vip', 'free_register', 'sold_out'] as const
export type BookingKind = (typeof BOOKING_KINDS)[number]

export const BOOKING_AVAILABILITY = ['on_sale', 'not_yet', 'sold_out', 'dead'] as const
export type BookingAvailability = (typeof BOOKING_AVAILABILITY)[number]

export type BookingLink = {
  id: string
  provider: BookingProvider
  url: string
  kind: BookingKind
  availability: BookingAvailability
  priceFromCents: number | null
  priceCheckedAt: string | null
  isPrimary: boolean
  setBy: 'organiser' | 'curated'
  pointedToByOrganiser: boolean
  position: number
  createdAt: string
}

/** The platform's name as a visitor reads it on the button ("View tickets at Humanitix"). */
export const PROVIDER_NAMES: Readonly<Record<BookingProvider, string | null>> = {
  humanitix: 'Humanitix',
  eventbrite: 'Eventbrite',
  trybooking: 'TryBooking',
  moshtix: 'Moshtix',
  oztix: 'Oztix',
  ticketek: 'Ticketek',
  ticketmaster: 'Ticketmaster',
  dice: 'DICE',
  /* The venue's or organiser's own page is named by the host or organiser, which the page knows and this file does not. */
  venue: null,
  organiser_site: null,
  other: null,
}

const HOSTS: ReadonlyArray<[RegExp, BookingProvider]> = [
  [/(^|\.)humanitix\.com$/, 'humanitix'],
  [/(^|\.)eventbrite\.(com|com\.au|co\.uk|ca)$/, 'eventbrite'],
  [/(^|\.)trybooking\.com$/, 'trybooking'],
  [/(^|\.)moshtix\.com\.au$/, 'moshtix'],
  [/(^|\.)oztix\.com\.au$/, 'oztix'],
  [/(^|\.)ticketek\.com\.au$/, 'ticketek'],
  [/(^|\.)ticketmaster\.com\.au$/, 'ticketmaster'],
  [/(^|\.)dice\.fm$/, 'dice'],
]

/** The platform a link is on, from its host alone; a page that is none of them is 'other' until a person names it. */
export function providerOf(url: string): BookingProvider {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    return 'other'
  }
  return HOSTS.find(([pattern]) => pattern.test(host))?.[1] ?? 'other'
}

/**
 * THE SELLER AN EVENT ROW NAMES (Lawal, 2 November 2026, 09:00, refinement 1: never a domain in a row; one pattern,
 * 'Tickets at <seller>'). A venue's or organiser's own booking site is named as that site names itself, read from its
 * own page title on 2 November 2026 (production's upcoming city rows, every host they use); where a site gives no title,
 * the venue every production row on it names (Bird's Basement) or the platform's own name (Gotix). A platform is named
 * by PROVIDER_NAMES. A host in neither has no name here: the row says 'Get tickets' and the address stays on the event
 * page only.
 */
const SELLER_HOST_NAMES: ReadonlyArray<[RegExp, string]> = [
  [/(^|\.)geelongartscentre\.org\.au$/, 'Geelong Arts Centre'],
  [/(^|\.)events\.grlc\.vic\.gov\.au$/, 'Geelong Regional Libraries'],
  [/(^|\.)comedyrepublic\.com\.au$/, 'Comedy Republic'],
  [/(^|\.)gotix\.com\.au$/, 'Gotix'],
  [/(^|\.)birdsbasement\.com$/, 'Bird’s Basement'],
  [/(^|\.)ticketsearch\.com$/, 'TicketSearch'],
  [/(^|\.)nextstopcomedy\.com$/, 'Next Stop Comedy'],
  [/(^|\.)caravanshow\.com\.au$/, 'Caravan Industry Victoria'],
  [/(^|\.)stickytickets\.com\.au$/, 'Sticky Tickets'],
  [/(^|\.)countryracing\.com\.au$/, 'Country Racing Victoria'],
  [/(^|\.)geelongbeerfestival\.com\.au$/, 'Geelong Beer Festival'],
  [/(^|\.)raceroster\.com$/, 'Race Roster'],
  [/(^|\.)sovereignhill\.com\.au$/, 'Sovereign Hill'],
  [/(^|\.)bendigo\.vic\.gov\.au$/, 'City of Greater Bendigo'],
  [/(^|\.)tipsysketching\.club$/, 'The Tipsy Sketching Club'],
  [/^auschoir\.my\.salesforce-sites\.com$/, 'Australian Chamber Choir'],
  // Car 44c (the CONTROLLER's 14:55 (4) of 5 November 2026): the hunt's sellers and its venues' own booking pages, so a
  // hunted row reads 'Tickets at <seller>', never a bare 'Get tickets' (34 of 98 hunted nights sold through AXS).
  [/(^|\.)axs\.com$/, 'AXS'],
  [/(^|\.)melbournerecital\.com\.au$/, 'Melbourne Recital Centre'],
  [/(^|\.)forummelbourne\.com\.au$/, 'Forum Melbourne'],
  [/(^|\.)palaistheatre\.com\.au$/, 'Palais Theatre'],
  [/(^|\.)festivalhall\.com\.au$/, 'Festival Hall'],
  [/(^|\.)mcg\.org\.au$/, 'MCG'],
  [/(^|\.)fedsquare\.com$/, 'Fed Square'],
  [/(^|\.)ausxsupercross\.com\.au$/, 'AUSX'],
]

/** The seller's name for a booking address: the platform's, else the site's own, else null (never the domain). */
export function sellerName(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null
  let host: string
  try {
    host = new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return null
  }
  return PROVIDER_NAMES[providerOf(url.trim())] ?? SELLER_HOST_NAMES.find(([pattern]) => pattern.test(host))?.[1] ?? null
}

const AVAILABILITY_ORDER: Readonly<Record<BookingAvailability, number>> = { on_sale: 0, not_yet: 1, sold_out: 2, dead: 3 }

function byButtonOrder(a: BookingLink, b: BookingLink): number {
  const own = (l: BookingLink) => (l.isPrimary && l.setBy === 'organiser' ? 0 : 1)
  return (
    own(a) - own(b) ||
    Number(b.pointedToByOrganiser) - Number(a.pointedToByOrganiser) ||
    AVAILABILITY_ORDER[a.availability] - AVAILABILITY_ORDER[b.availability] ||
    a.position - b.position ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  )
}

/** The link the one button opens, or null where every link is dead: never a dead button. */
export function buttonOf(links: readonly BookingLink[]): BookingLink | null {
  return [...links].filter((l) => l.availability !== 'dead').sort(byButtonOrder)[0] ?? null
}

/** Every other live link, in the button's order, for "Also on". */
export function alsoOn(links: readonly BookingLink[]): BookingLink[] {
  const button = buttonOf(links)
  return [...links].filter((l) => l.availability !== 'dead' && l.id !== button?.id).sort(byButtonOrder)
}

/**
 * Shown only when it was read within the last 7 days, else no price at all (the CONTROLLER's 08:50 (6) of 5 November
 * 2026, for the guide's outside rows; it widens the 12:30 (4)'s one day, so a row and its event page, which both read
 * this rule, never disagree about a price). Reversible here, in one number.
 */
export const PRICE_SHOWN_FOR_MS = 7 * 24 * 60 * 60 * 1000

export function priceToShow(link: BookingLink, now: Date): number | null {
  if (link.priceFromCents === null || link.priceCheckedAt === null) return null
  return now.getTime() - new Date(link.priceCheckedAt).getTime() <= PRICE_SHOWN_FOR_MS ? link.priceFromCents : null
}

/** "From $35.50", the lowest price including fees, as Google asks it to be read. */
export function fromPrice(cents: number): string {
  const dollars = cents / 100
  return `From $${Number.isInteger(dollars) ? dollars.toLocaleString('en-AU') : dollars.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** One event_booking_links row as the database returns it. */
export type BookingLinkRow = {
  id: string
  provider: string
  url: string
  kind: string
  availability: string
  price_from_cents: number | null
  price_checked_at: string | null
  is_primary: boolean
  set_by: string
  pointed_to_by_organiser: boolean
  position: number
  created_at: string
}

/** The columns a BookingLinkRow is read with, for a select or an embed. */
export const BOOKING_LINK_COLUMNS =
  'id, provider, url, kind, availability, price_from_cents, price_checked_at, is_primary, set_by, pointed_to_by_organiser, position, created_at'

/** A database row as a BookingLink. Pure. */
export function toBookingLink(r: BookingLinkRow): BookingLink {
  return {
    id: r.id,
    provider: r.provider as BookingLink['provider'],
    url: r.url,
    kind: r.kind as BookingLink['kind'],
    availability: r.availability as BookingLink['availability'],
    priceFromCents: r.price_from_cents,
    priceCheckedAt: r.price_checked_at,
    isPrimary: r.is_primary,
    setBy: r.set_by as BookingLink['setBy'],
    pointedToByOrganiser: r.pointed_to_by_organiser,
    position: r.position,
    createdAt: r.created_at,
  }
}

/* ------------------------------------------------------------------ one event */

/** Two starts this close are the same night (the 12:30 (1): "start time within 2 hours"). */
export const SAME_START_WITHIN_MS = 2 * 60 * 60 * 1000
/**
 * The share of words two titles must hold in common to be one event. UNSOURCED: no page read gives a threshold for
 * event titles; set at a half so "Jazz at Beav's" and "Jazz at Beav's Bar, Friday" match and two different acts at
 * one venue the same night do not. Reversal: a merge the project manager undoes, or a duplicate card a visitor reports,
 * moves it, written in the decision.
 */
export const SAME_TITLE_SHARE = 0.5

export type ListingKey = {
  /** The venue's id where it is stored; else its name and address, as the import reads them. */
  venueId: string | null
  venueName: string
  venueAddress: string | null
  title: string
  startsAt: string
}

const WORDS_IGNORED = new Set(['the', 'a', 'an', 'at', 'and', 'with', 'live', 'presents', 'night', 'on', 'in', 'of'])

export function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((w) => w.length > 1 && !WORDS_IGNORED.has(w)),
  )
}

/** Shared words over the shorter title's words, so a longer title carrying more detail still matches. */
export function titleShare(a: string, b: string): number {
  const wa = titleWords(a)
  const wb = titleWords(b)
  const fewer = Math.min(wa.size, wb.size)
  if (fewer === 0) return 0
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared += 1
  return shared / fewer
}

export function sameVenue(a: ListingKey, b: ListingKey): boolean {
  if (a.venueId !== null && b.venueId !== null) return a.venueId === b.venueId
  const name = (k: ListingKey) => venueSlugify(k.venueName)
  const address = (k: ListingKey) => (k.venueAddress === null ? null : venueSlugify(k.venueAddress))
  if (name(a) !== name(b)) return false
  return address(a) === null || address(b) === null || address(a) === address(b)
}

/** One event, whatever platform listed it: the same venue, a start within two hours, titles alike. */
export function sameEvent(a: ListingKey, b: ListingKey): boolean {
  const apart = Math.abs(new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  if (!Number.isFinite(apart) || apart > SAME_START_WITHIN_MS) return false
  return sameVenue(a, b) && titleShare(a.title, b.title) >= SAME_TITLE_SHARE
}

/* ------------------------------------------------------------------ the writer */

/** One link the import or the daily check found for an event. */
export type FoundBookingLink = {
  url: string
  kind?: BookingKind
  availability?: BookingAvailability
  priceFromCents?: number | null
  priceCheckedAt?: string | null
  pointedToByOrganiser?: boolean
  position?: number
}

/**
 * The SQL that adds or refreshes an event's curated links, for the import's one statement (src/lib/listings/import-
 * write.ts). EventLinqs never writes over what an organiser set: a link the organiser holds is left as it is, and a
 * curated link is never the primary (the database refuses one). Values reach the SQL only through sqlLiteral.
 */
export function bookingLinksSql(eventIdSql: string, links: readonly FoundBookingLink[]): string {
  return links
    .map((l, i) => {
      if (!/^https:\/\/\S+$/i.test(l.url)) throw new WriteRefusal(`a booking link must be an https address: ${l.url}`)
      if ((l.priceFromCents ?? null) === null ? (l.priceCheckedAt ?? null) !== null : (l.priceCheckedAt ?? null) === null) {
        throw new WriteRefusal(`a price is written only with the moment it was checked: ${l.url}`)
      }
      const values = [
        eventIdSql,
        sqlLiteral(providerOf(l.url)),
        sqlLiteral(l.url),
        sqlLiteral(l.kind ?? 'tickets'),
        sqlLiteral(l.availability ?? 'on_sale'),
        sqlLiteral(l.priceFromCents ?? null),
        l.priceCheckedAt == null ? 'null' : `${sqlLiteral(l.priceCheckedAt)}::timestamptz`,
        sqlLiteral(l.pointedToByOrganiser ?? false),
        sqlLiteral(l.position ?? i),
      ]
      return `insert into public.event_booking_links (event_id, provider, url, kind, availability, price_from_cents, price_checked_at, pointed_to_by_organiser, position, set_by)
values (${values.join(', ')}, 'curated')
on conflict (event_id, url) do update set kind = excluded.kind, availability = excluded.availability,
  price_from_cents = excluded.price_from_cents, price_checked_at = excluded.price_checked_at,
  pointed_to_by_organiser = excluded.pointed_to_by_organiser, position = excluded.position, updated_at = now()
  where public.event_booking_links.set_by = 'curated';`
    })
    .join('\n')
}
