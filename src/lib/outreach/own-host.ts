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
