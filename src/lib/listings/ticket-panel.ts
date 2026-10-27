import { PROVIDER_NAMES, alsoOn, buttonOf, priceToShow, type BookingLink } from '@/lib/events/booking-links'
import { outboundHost, outboundHref } from './outbound'

/**
 * WHAT THE TICKET COLUMN SAYS FOR AN EVENT SOLD ON OTHER SITES (WI3's page, the
 * project manager's 12:30 of 27 October 2026, point 4): ONE one-click button
 * ("Get tickets on Humanitix", "Register free on Humanitix"); under it one quiet
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
  const label = first.kind === 'free_register' ? (name ? `Register free on ${name}` : 'Register free') : name ? `Get tickets on ${name}` : 'Get tickets'
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
