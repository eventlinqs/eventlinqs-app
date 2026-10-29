import { PROVIDER_NAMES, alsoOn, buttonOf, priceToShow, type BookingLink } from '@/lib/events/booking-links'
import { ctaFor, FREE_REGISTRATION_REQUIRED, GET_TICKETS, type Cta } from '@/lib/events/cta'
import { outboundHost, outboundHref, ticketButtonLabel } from './outbound'

/**
 * WHAT THE TICKET COLUMN SAYS FOR AN EVENT SOLD ON OTHER SITES (WI3's page, the
 * project manager's 12:30 of 27 October 2026, point 4): ONE one-click button
 * ("View tickets at Humanitix", "Register free on Humanitix"); under it one quiet
 * line, "Also on Eventbrite · Moshtix", each one tap; a price only when it was
 * checked within the last day; all sold out, "Sold out on Humanitix" and never a
 * dead button. Which link gets the button is WI3's rule, buttonOf
 * (src/lib/events/booking-links.ts), never this file's.
 *
 * A leaf: no database.
 */
export type TicketPanel = {
  button: { href: string; label: string; host: string | null; price: string | null } | null
  also: { href: string; name: string }[]
  soldOut: string | null
}

/** The platform's own name, or null for a venue's or organiser's own page. */
const nameOf = (l: BookingLink) => PROVIDER_NAMES[l.provider] ?? null

const live = (l: BookingLink) => (l.availability === 'on_sale' || l.availability === 'not_yet') && l.kind !== 'sold_out'

/** "From $35.50", the lowest price including fees, as Google asks it to be read. */
export function fromPrice(cents: number): string {
  const dollars = cents / 100
  return `From $${Number.isInteger(dollars) ? dollars.toLocaleString('en-AU') : dollars.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function ticketPanelOf(eventSlug: string, links: readonly BookingLink[], now: Date): TicketPanel {
  const first = buttonOf(links)
  if (first === null) return { button: null, also: [], soldOut: null }
  if (!live(first)) {
    const name = nameOf(first)
    return { button: null, also: [], soldOut: name ? `Sold out on ${name}` : 'Sold out' }
  }
  const name = nameOf(first)
  /* The one call to action (src/lib/events/cta.ts): "Register free on Humanitix" or "View tickets at Humanitix". */
  const label = ctaFor({ externalTicketUrl: first.url, externalKind: first.kind, providerName: name ?? outboundHost(first.url) }).action
  const cents = priceToShow(first, now)
  const seen = new Set<string>([name ?? outboundHost(first.url) ?? first.url])
  const also: TicketPanel['also'] = []
  for (const l of alsoOn(links)) {
    if (!live(l)) continue
    const n = nameOf(l) ?? outboundHost(l.url)
    if (n === null || seen.has(n)) continue
    seen.add(n)
    also.push({ href: outboundHref(eventSlug, l.url), name: n })
  }
  return {
    button: { href: outboundHref(eventSlug, first.url), label, host: outboundHost(first.url), price: cents !== null && cents > 0 ? fromPrice(cents) : null },
    also,
    soldOut: null,
  }
}

/** What the hero and the sticky bar say: the call to action and the price beside it. */
export type HeroSaleWords = { cta: string; price: string | null; trustSignals: boolean }

/**
 * AN EVENT SOLD ON ANOTHER SITE (WI3) is never "Not on sale yet": it is on sale,
 * elsewhere, and nothing is checked out here. Its hero and sticky bar name the
 * same one button as the panel they scroll to, its price is the panel's (only
 * while fresh), and it never claims a checkout or a refund policy that is not
 * ours. Found driving the first imported ticketed listing on TEST, 27 October
 * 2026: the hero read "Not on sale yet", "Free entry" and "Secure checkout"
 * above a panel saying tickets are sold elsewhere. Every other event keeps the
 * words it had.
 */
export function heroSaleWords(input: {
  externalUrl: string | null
  panel: TicketPanel | null
  isFree: boolean
  saleBlocked: boolean
  isSoldOut: boolean
  priceLabel: string | null
  /** The event's call to action (src/lib/events/cta.ts); with it a free night says details or register, never buy. */
  cta?: Cta
}): HeroSaleWords {
  /* A night that is over offers no ticket, here or elsewhere, and names no price (cta.ts's sixth state). */
  if (input.cta?.state === 'over') return { cta: input.cta.action, price: null, trustSignals: false }
  if (input.externalUrl) {
    return {
      cta: input.panel?.soldOut ?? input.panel?.button?.label ?? ticketButtonLabel(input.externalUrl),
      price: input.panel?.button?.price ?? (input.isFree ? 'Free' : null),
      trustSignals: false,
    }
  }
  /* Nothing to sell here and no price anyone checked (the checklist's E5): details, never "Get tickets". */
  if (input.cta?.state === 'unknown_price' || (!input.cta && input.priceLabel === null && !input.isFree)) {
    return { cta: 'View event details', price: null, trustSignals: false }
  }
  /* E1, free with nothing to register: details and "Free entry". */
  if (input.cta?.state === 'free_open') return { cta: 'View event details', price: 'Free entry', trustSignals: false }
  /* E2, free with registration here: "Register", and it says registration is required. */
  if (input.cta?.state === 'free_registration') {
    return { cta: input.saleBlocked ? 'Not on sale yet' : input.isSoldOut ? 'Join the waitlist' : 'Register', price: FREE_REGISTRATION_REQUIRED, trustSignals: true }
  }
  return {
    cta: input.saleBlocked ? 'Not on sale yet' : input.isSoldOut ? 'Join the waitlist' : (input.cta?.action ?? GET_TICKETS),
    /* Never free because no price is stored (the checklist's E6): free only when the event says it is. */
    price: input.priceLabel ?? (input.isFree ? 'Free entry' : null),
    trustSignals: true,
  }
}
