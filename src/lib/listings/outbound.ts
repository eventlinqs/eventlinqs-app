/**
 * THE ONE BUTTON THAT LEAVES, ON EVERY CURATED LISTING (WI3's page, Lawal's
 * finding of 27 October 2026: "the event link doesn't show an outside event in
 * full with one button to the other ticketing site ... the page still just says
 * you can get the free entry").
 *
 * An EventLinqs listing names its host and never the listings organisation
 * (src/lib/listings/shown-organiser.ts), so until this file the page had no
 * address to send anybody to: shownOrganiser returns no website for a listing.
 * A listing's host does have one. The import keeps the venue's own site
 * (venues.website_url), the series' Instagram post (event_series.instagram_post_url)
 * and every page it read the night from (listing_checks.source_url); WI3 adds
 * the night's own page to the event (events.source_url). This picks one, in that
 * order of how near it is to the host: the night's own page, the host's site,
 * the host's post, then the page the import last read.
 *
 * PARITY, read 27 October 2026 (Law 7): an Eventfinda event page carries
 * "Buy Tickets" to the organiser's ticket site and "Melbourne Magic Show -
 * Official Website" to the organiser's own
 * (https://www.eventfinda.com.au/2026/melbourne-magic-show2/melbourne). Ours is
 * one button, named for where it goes.
 *
 * A leaf: no database, so every rule here is tested without one.
 */

export type Outbound = {
  /** Where the button goes: always https, always off EventLinqs. */
  href: string
  /** The words on the button. */
  label: string
  /** The destination's hostname, for the "Opens ..." line beneath it. */
  host: string
}

/** The pages a listing's host keeps, as the import and WI3 recorded them. Each may be missing. */
export type ListingPages = {
  /** events.source_url (WI3): the night's own page. */
  sourceUrl?: string | null
  /** venues.website_url: the host's own site. */
  websiteUrl?: string | null
  /** event_series.instagram_post_url: the host's post for the series. */
  instagramPostUrl?: string | null
  /** The newest listing_checks.source_url: the page the import last read the night from. */
  checkedUrl?: string | null
}

/**
 * THE ONE PLACE A BUTTON THAT LEAVES TAKES ITS ADDRESS. Today the destination
 * itself; window 6's counted redirect (/out/<event slug>, the 12:21 and 12:37
 * of 27 October 2026) changes this function and nothing else, so every button
 * is counted the day it lands.
 */
export function outboundHref(_eventSlug: string, destination: string): string {
  return destination
}

/** The hostname of an https address, without "www.", or null when it is not one. */
export function outboundHost(url: string | null | undefined): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null
  try {
    const u = new URL(url.trim())
    if (u.protocol !== 'https:') return null
    return u.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

/**
 * The button for a free curated night: "See it on Beav's Bar's page", to the
 * first of the host's pages that is a real https address, or null when the
 * listing holds none (the page then draws no button, never a dead one; Law 5).
 */
export function freeListingOutbound(eventSlug: string, hostName: string | null | undefined, pages: ListingPages): Outbound | null {
  const name = hostName?.trim() || null
  for (const url of [pages.sourceUrl, pages.websiteUrl, pages.instagramPostUrl, pages.checkedUrl]) {
    const host = outboundHost(url)
    if (host === null || isEventLinqs(host)) continue
    return { href: outboundHref(eventSlug, (url as string).trim()), label: name === null ? 'See it on the host\'s page' : `See it on ${name}'s page`, host }
  }
  return null
}

/** The booking sites the 12:30 of 27 October names for WI3's booking links, as each writes its own name. */
export const BOOKING_PROVIDERS: Record<string, string> = {
  eventbrite: 'Eventbrite',
  humanitix: 'Humanitix',
  moshtix: 'Moshtix',
  oztix: 'Oztix',
  trybooking: 'TryBooking',
  ticketek: 'Ticketek',
  ticketmaster: 'Ticketmaster',
  dice: 'DICE',
}

/**
 * A booking site's own name, from the provider a link records or else from its
 * address; null for a venue's or an organiser's own page, which is named plainly.
 */
export function siteName(url: string, provider?: string | null): string | null {
  const named = provider ? BOOKING_PROVIDERS[provider.trim().toLowerCase()] : undefined
  if (named) return named
  const host = outboundHost(url)
  if (host === null) return null
  for (const [key, words] of Object.entries(BOOKING_PROVIDERS)) {
    if ([`${key}.com`, `${key}.com.au`, `${key}.fm`].some((d) => host === d || host.endsWith(`.${d}`))) return words
  }
  return null
}

/**
 * The words on the ticket button of an event sold on another site: "Get tickets
 * on Humanitix" where the site is one of the booking sites, and "Get tickets"
 * where it is not (the venue's own booking page).
 */
export function ticketButtonLabel(destinationUrl: string, provider?: string | null): string {
  const name = siteName(destinationUrl, provider)
  return name === null ? 'Get tickets' : `Get tickets on ${name}`
}

function isEventLinqs(host: string): boolean {
  return /(^|\.)eventlinqs\.com(\.au)?$/.test(host)
}
