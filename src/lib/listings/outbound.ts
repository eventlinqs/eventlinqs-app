import { PROVIDER_NAMES, providerOf } from '@/lib/events/booking-links'
import { ctaFor } from '@/lib/events/cta'

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
 * the night's own page to the event (events.source_url). This picks one, the
 * host's own first: a page on the host's own site, the host's site, the host's
 * post, and only then another site's listing of the night, which is never called
 * the host's page: it reads "See the original listing".
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
  /** Where the button goes: the counted route, /out/<slug>?to=<an https page off EventLinqs> (outboundHref). */
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
 * THE ONE PLACE A BUTTON THAT LEAVES TAKES ITS ADDRESS: window 6's counted
 * redirect (/out/<event slug>?to=<destination>, the 12:21 and 12:37 of 27
 * October 2026; src/app/out/[slug]/route.ts). The route follows the destination
 * only when it is one of that event's own, so this is never an open redirect, and
 * counts the press before the visitor leaves.
 */
export function outboundHref(eventSlug: string, destination: string): string {
  return `/out/${encodeURIComponent(eventSlug)}?to=${encodeURIComponent(destination)}`
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
  const ownWords = name === null ? "See it on the host's page" : `See it on ${name}'s page`
  const siteHost = outboundHost(pages.websiteUrl)
  /* A page on the host's own site is the host's own; any other site's page is a listing of it (found driving
   * production on 27 October 2026: two nights said "FAD Gallery Bar's page" and opened What's On Melbourne). */
  const onOwnSite = (host: string) => siteHost !== null && (host === siteHost || host.endsWith(`.${siteHost}`))
  const real = (url: string | null | undefined) => {
    const host = outboundHost(url)
    return host === null || isEventLinqs(host) ? null : { url: (url as string).trim(), host }
  }
  const listed = [real(pages.sourceUrl), real(pages.checkedUrl)].filter((u): u is { url: string; host: string } => u !== null)
  const own = [...listed.filter((u) => onOwnSite(u.host)), real(pages.websiteUrl), real(pages.instagramPostUrl)].filter((u): u is { url: string; host: string } => u !== null)
  if (own.length > 0) return { href: outboundHref(eventSlug, own[0].url), label: ownWords, host: own[0].host }
  if (listed.length > 0) return { href: outboundHref(eventSlug, listed[0].url), label: 'See the original listing', host: listed[0].host }
  return null
}

/**
 * The words on the ticket button of an event sold on another site: "Get tickets
 * on Humanitix" where the address is a booking platform's, by WI3's own reading
 * of it (src/lib/events/booking-links.ts, providerOf and PROVIDER_NAMES), and
 * "Get tickets" where it is not (the venue's own booking page).
 */
export function ticketButtonLabel(destinationUrl: string): string {
  /* The release checklist's E4 (28 October 2026): "View tickets at <provider>", the outside site named, by the one function. */
  return ctaFor({ externalTicketUrl: destinationUrl, providerName: PROVIDER_NAMES[providerOf(destinationUrl)] ?? outboundHost(destinationUrl) }).action
}

function isEventLinqs(host: string): boolean {
  return /(^|\.)eventlinqs\.com(\.au)?$/.test(host)
}
