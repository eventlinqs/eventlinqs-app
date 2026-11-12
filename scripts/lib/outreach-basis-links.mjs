/**
 * THE PAGES A SITE'S OWN HOME PAGE LINKS FOR AN ADDRESS (the PM's 08:25 of 13 November 2026, (a): a venue's bookings or
 * events address is published on its contact, hire, bookings and footer pages, not only its home page). Used by
 * scripts/ops/outreach-basis.mjs, which reads each link through the polite reader (law 14 (k)) and takes an address only
 * where the basis rules allow. Pure: the links a page gives on the site's own domain, never another's.
 */

/** The words or address of a link that may lead to a published business address. */
export const LINK_WORDS = /\b(contact|hire|book(ing)?s?|functions?|enquir\w*|about)\b/i
export const MAX_LINKED_PAGES = 6

/**
 * The links a page gives, on the site's own domain (or a subdomain of it), whose words or path name contact, hire,
 * bookings, functions, enquiries or about: at most MAX_LINKED_PAGES, in page order, each absolute and without its hash.
 */
export function linkedPages(page, siteDomain) {
  if (!page || !siteDomain) return []
  const out = []
  for (const m of page.html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url
    try {
      url = new URL(m[1], page.url)
    } catch {
      continue
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    if (host !== siteDomain && !host.endsWith(`.${siteDomain}`)) continue
    const words = `${m[2].replace(/<[^>]+>/g, ' ')} ${url.pathname}`
    if (!LINK_WORDS.test(words)) continue
    url.hash = ''
    const href = url.toString()
    if (!out.includes(href)) out.push(href)
    if (out.length >= MAX_LINKED_PAGES) break
  }
  return out
}

/**
 * The day in Melbourne, YYYY-MM-DD, for a contact's seen_on (WINDOW 5A, 13 November 2026): the tool took the UTC date,
 * so every basis recorded before 11 am Melbourne daylight time was dated the day before (four found that morning,
 * seen_on 2026-11-12 on the 13th). Pure.
 */
export function melbourneDay(at = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}
