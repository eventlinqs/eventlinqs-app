import { pageRuleFor } from './page-rules'

/**
 * THE SOURCE SCOUT, the discovery layer's first part (the CONTROLLER's 16:14 (4) of 1 November 2026: the discovery layer
 * finds NEW SOURCES and registers each, routed to the adapter that may read it; WINDOW 6 owns it). Pure: given what one
 * site answered, it names the adapter that may read it and why. The runner (scripts/verify/source-scout-run.mts) does
 * the fetching as the collector does (our agent named, robots.txt first, one request a second, stop on 403 or 429).
 *
 * The order is the engine directive's own: a site that refuses is never read (robots.txt, 403, 429); a calendar feed
 * first (the source's own export, the most faithful); then the page's own schema.org Event data; then a page rule
 * already written for the host; then event pages listed in the site's own sitemap, which means a rule is to be written;
 * else nothing to read, said plainly. A proposed source is registered asking and unverified, and is never read until a
 * person has read its terms and confirmed them (listing_sources.collection stays 'ask').
 */

export type ScoutAdapter = 'ics' | 'jsonld' | 'page_rule' | 'none'

export type ScoutInput = {
  /** The page tried: a venue's or organiser's events page, or its home page. */
  readonly url: string
  /** robots.txt's verdict for our agent on that page. */
  readonly robotsAllowed: boolean
  /** The page's HTTP status, or null when it did not answer. */
  readonly status: number | null
  readonly html: string
  /** Every sitemap the site lists (robots.txt Sitemap lines and the sitemap index), absolute. */
  readonly sitemapUrls: readonly string[]
}

export type ScoutVerdict = {
  readonly url: string
  readonly host: string
  readonly adapter: ScoutAdapter
  readonly reason: string
  readonly feeds: readonly string[]
  readonly jsonldEvents: number
  readonly ruleWritten: boolean
  readonly eventSitemaps: readonly string[]
}

const FEED_HREF = /href\s*=\s*["']((?:webcal:[^"']*)|(?:[^"']*(?:\.ics\b|[?&]ical=1)[^"']*))["']/gi

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function absolute(href: string, base: string): string | null {
  if (/^webcal:/i.test(href)) return href
  try {
    return new URL(href.replace(/&amp;/g, '&'), base).toString()
  } catch {
    return null
  }
}

export function scoutSite(input: ScoutInput): ScoutVerdict {
  const base = { url: input.url, host: hostOf(input.url), feeds: [] as string[], jsonldEvents: 0, ruleWritten: false, eventSitemaps: [] as string[] }
  if (!input.robotsAllowed) return { ...base, adapter: 'none', reason: 'robots.txt disallows the page' }
  if (input.status === 403 || input.status === 429) return { ...base, adapter: 'none', reason: `the site answered ${input.status}: never read` }
  if (input.status === null || input.status < 200 || input.status >= 300) return { ...base, adapter: 'none', reason: `the page answered ${input.status ?? 'nothing'}` }

  const feeds: string[] = []
  for (const m of input.html.matchAll(FEED_HREF)) {
    const u = absolute(m[1], input.url)
    if (u && !feeds.includes(u)) feeds.push(u)
  }
  const jsonldEvents = (input.html.match(/"@type"\s*:\s*"[A-Za-z]*Event"/g) ?? []).length
  const ruleWritten = pageRuleFor(input.url) !== null
  const eventSitemaps = input.sitemapUrls.filter((u) => /event|whats-?on|gig|show/i.test(u.split('/').pop() ?? ''))
  const seen = { ...base, feeds, jsonldEvents, ruleWritten, eventSitemaps }

  if (feeds.length > 0) return { ...seen, adapter: 'ics', reason: 'a calendar feed on the page' }
  if (jsonldEvents > 0) return { ...seen, adapter: 'jsonld', reason: "the page's own schema.org Event data" }
  if (ruleWritten) return { ...seen, adapter: 'page_rule', reason: 'a page rule is written for this site' }
  if (eventSitemaps.length > 0) return { ...seen, adapter: 'page_rule', reason: 'event pages listed in its own sitemap: a page rule is to be written' }
  return { ...seen, adapter: 'none', reason: 'no event data, feed or event sitemap found' }
}

/**
 * The listing_sources row a scouted site is proposed as: asking, unverified, facts only, links allowed (the booking
 * link is a fact; the CONTROLLER's 15:54 (1)), in its city. Null for a site that is never to be read. The page it names
 * is the one its adapter reads: the feed, the page with Event data, or the event sitemap for a page rule.
 */
export function proposedSource(v: ScoutVerdict, who: { name: string; citySlug: string; kind: string }) {
  if (v.adapter === 'none') return null
  const pageUrl = v.adapter === 'ics' ? v.feeds[0] : v.adapter === 'page_rule' && v.eventSitemaps.length > 0 ? v.eventSitemaps[0] : v.url
  return {
    name: who.name,
    kind: who.kind,
    city_slug: who.citySlug,
    page_url: pageUrl,
    collection: 'ask' as const,
    verification: 'unverified' as const,
    changes: 'weekly' as const,
    permits_facts: true,
    permits_descriptions: false,
    permits_images: false,
    permits_links: true,
    notes: `proposed by the source scout: ${v.adapter} (${v.reason}); read only once a person confirms its terms`,
  }
}
