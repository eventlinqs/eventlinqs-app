/**
 * AN ORGANISER'S OWN WEBSITE HOST, OR NONE (./their-nights.ts). A night whose booking page is on this host is theirs.
 * A shared host is never anyone's own: ticketing platforms many organisers sell on, social sites, link pages, website
 * builders' shared domains, and government and education sites (a council's or a library's events are not one
 * organiser's). Pure.
 */

const SHARED: readonly RegExp[] = [
  /(^|\.)eventbrite\.[a-z.]+$/, /(^|\.)humanitix\.com$/, /(^|\.)trybooking\.com$/, /(^|\.)moshtix\.com(\.au)?$/, /(^|\.)oztix\.com\.au$/,
  /(^|\.)ticketek\.com(\.au)?$/, /(^|\.)ticketmaster\.[a-z.]+$/, /(^|\.)dice\.fm$/, /(^|\.)stickytickets\.com\.au$/, /(^|\.)ticketebo\.com\.au$/,
  /(^|\.)megatix\.[a-z.]+$/, /(^|\.)tixel\.com(\.au)?$/, /(^|\.)eventfinda\.[a-z.]+$/, /(^|\.)ticketsource\.[a-z.]+$/, /(^|\.)universe\.com$/,
  /(^|\.)facebook\.com$/, /(^|\.)fb\.me$/, /(^|\.)instagram\.com$/, /(^|\.)linktr\.ee$/, /(^|\.)eventlinqs\.com(\.au)?$/,
  /(^|\.)squarespace\.com$/, /(^|\.)wixsite\.com$/, /(^|\.)wordpress\.com$/, /(^|\.)google\.com$/, /(^|\.)forms\.gle$/,
  /\.gov\.au$/, /\.edu\.au$/,
]

export function ownHost(websiteUrl: string | null | undefined): string | null {
  if (!websiteUrl) return null
  let host: string
  try {
    host = new URL(websiteUrl).hostname.toLowerCase()
  } catch {
    return null
  }
  host = host.replace(/^www\./, '')
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null
  return SHARED.some((re) => re.test(host)) ? null : host
}

/**
 * Whether a booking page is on their own host: the host itself, its www, or any subdomain of it (a box office such as
 * tickets.birdsbasement.com or shtickets.sovereignhill.com.au is the organiser's own; WINDOW 5A, 13 November 2026, the
 * PM's 06:13 (2a)). Judged on the URL's own hostname, never on text inside it, so another site's link that only mentions
 * their host in its path or query is never theirs. Pure.
 */
export function onOwnHost(url: string | null | undefined, host: string): boolean {
  if (!url) return false
  let name: string
  try {
    name = new URL(url).hostname.toLowerCase()
  } catch {
    return false
  }
  return name === host || name.endsWith(`.${host}`)
}

