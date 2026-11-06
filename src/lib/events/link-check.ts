/**
 * THE DAILY LINK CHECK (window 6, 27 October 2026; the project manager's 12:30, point 5: "daily, every link: dead or
 * sold out moves down and the button re-picks by rule 3. Respect robots.txt; read the page's own Event data where
 * present; no scraping behind logins"; the locked foundation's listing rule 5: "Every link is checked daily. A broken
 * or sold-out link drops down and the button re-picks").
 *
 * Each booking link of an event still to come is read once a day, as a visitor would read it: no login, no cookie, one
 * page, its own robots.txt first. What the page says about itself is the only thing read: its status, and its own
 * Event structured data (schema.org's offers.availability and price). The availability written back is WI3's own
 * (event_booking_links.availability), so the database's event_booking_button re-picks the one button by itself, and its
 * mirror carries the choice to events.external_ticket_url.
 *
 * ROBOTS (RFC 9309, https://www.rfc-editor.org/rfc/rfc9309.html, read 27 October 2026): the group for our product token
 * if there is one, else the "*" group ("If no matching group exists, crawlers MUST obey the group with a user-agent line
 * with the "*" value"); the longest matching rule wins and an allow wins a tie ("The most specific match found MUST be
 * used"; "If an "allow" rule and a "disallow" rule are equivalent, then the "allow" rule SHOULD be used"); a 4xx
 * robots.txt allows everything, a 5xx or an unreachable one allows nothing ("the crawler MUST assume complete
 * disallow"). A page robots keeps us from is left as it was.
 *
 * WHAT CHANGES A LINK, and only this: 404 or 410 is dead (the site says the page is gone); the page's own Event data
 * saying SoldOut or OutOfStock is sold out, PreOrder or PreSale is not yet, InStock, LimitedAvailability or OnlineOnly
 * is on sale (schema.org's ItemAvailability, https://schema.org/ItemAvailability, read 27 October 2026). Anything else,
 * a server error, a timeout, a login wall or a page with no Event data, changes nothing: a link is never marked dead on
 * a blink. A dead link that answers again is read afresh, so it comes back.
 */

import { pageRuleFor } from '@/lib/listings/page-rules'
import { isRestrictedTier } from '@/lib/listings/open-tier'

export const AGENT = 'EventLinqsLinkCheck'

export type Availability = 'on_sale' | 'not_yet' | 'sold_out' | 'dead'

type Rule = { allow: boolean; path: string }

/** The rules robots.txt gives our product token, by RFC 9309's group choice. */
export function robotsRules(txt: string, agent: string = AGENT): Rule[] {
  const groups: { agents: string[]; rules: Rule[] }[] = []
  let current: { agents: string[]; rules: Rule[] } | null = null
  let lastWasAgent = false
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue
    const key = m[1].toLowerCase()
    const value = m[2].trim()
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false
      if (value !== '') current.rules.push({ allow: key === 'allow', path: value })
    } else {
      lastWasAgent = false
    }
  }
  const named = groups.filter((g) => g.agents.includes(agent.toLowerCase()))
  const chosen = named.length > 0 ? named : groups.filter((g) => g.agents.includes('*'))
  return chosen.flatMap((g) => g.rules)
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  const re = new RegExp(`^${body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}${anchored ? '$' : ''}`)
  return re.test(path)
}

/** Whether a path may be read: the longest matching rule, an allow winning a tie; no rule, allowed. */
export function robotsAllows(rules: readonly Rule[], path: string): boolean {
  let best: Rule | null = null
  for (const r of rules) {
    if (!matches(r.path, path)) continue
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r
  }
  return best ? best.allow : true
}

const AVAILABILITY: Record<string, Availability> = {
  soldout: 'sold_out',
  outofstock: 'sold_out',
  preorder: 'not_yet',
  presale: 'not_yet',
  instock: 'on_sale',
  limitedavailability: 'on_sale',
  onlineonly: 'on_sale',
}

export type PageRead = { availability: Availability | null; priceFromCents: number | null }

/** The night a link sells: its start, and the zone a date only startDate is read in. */
export type Night = { startsAt: string; zone: string }

/** Whether an Event's startDate is this night: the same minute, or a date only startDate on the night's local day. */
function isNight(startDate: string, night: Night): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: night.zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(night.startsAt)) === startDate
  }
  const t = Date.parse(startDate)
  return Number.isFinite(t) && Math.abs(t - new Date(night.startsAt).getTime()) < 60_000
}

/**
 * What a page says about itself: gone, or its own Event data's availability and lowest price in dollars. Where the page holds
 * more than one dated Event and the night is given, only that night's Event is read, and a page without it says nothing:
 * Comedy Republic's Main Stage sells each night at its own price on one page, and pooling them wrote the week's lowest onto
 * every night and kept a sold out night on sale (the engine accuracy sweep, 6 November 2026).
 */
export function readPage(status: number, html: string, night?: Night | null): PageRead {
  if (status === 404 || status === 410) return { availability: 'dead', priceFromCents: null }
  if (status < 200 || status >= 300) return { availability: null, priceFromCents: null }
  const events: { startDate: string | null; offers: Record<string, unknown>[] }[] = []
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    const o = node as Record<string, unknown>
    const type = String(o['@type'] ?? '')
    if (/Event$/.test(type)) {
      const own: Record<string, unknown>[] = []
      ;[o.offers].flat().forEach((x) => x && typeof x === 'object' && own.push(x as Record<string, unknown>))
      events.push({ startDate: typeof o.startDate === 'string' ? o.startDate : null, offers: own })
    }
    if (o['@graph']) visit(o['@graph'])
  }
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1]))
    } catch {
      // A page's broken structured data says nothing; it never marks a link.
    }
  }
  const dated = events.filter((e) => e.startDate)
  const mine = night && dated.length > 1 ? dated.filter((e) => isNight(e.startDate as string, night)) : events
  const offers = mine.flatMap((e) => e.offers)
  const states = offers.map((o) => AVAILABILITY[String(o.availability ?? '').replace(/^https?:\/\/schema\.org\//i, '').toLowerCase()]).filter(Boolean)
  const availability = states.includes('on_sale') ? 'on_sale' : states.includes('not_yet') ? 'not_yet' : states.length > 0 ? 'sold_out' : null
  // The from price is an open ticket's (src/lib/listings/open-tier.ts): a concession or a package never sets it, though it
  // still counts for availability above, since a buyer who qualifies can still buy.
  const prices = offers
    .filter((o) => String(o.priceCurrency ?? 'AUD').toUpperCase() === 'AUD')
    .filter((o) => !isRestrictedTier(`${String(o.name ?? '')} ${String(o.description ?? '')} ${String(o.category ?? '')}`))
    .map((o) => Number(o.lowPrice ?? o.price))
    .filter((p) => Number.isFinite(p) && p >= 0)
  return { availability, priceFromCents: prices.length > 0 ? Math.round(Math.min(...prices) * 100) : null }
}

export type CheckDeps = {
  /** One GET as a visitor would make it, no cookie, our agent named; null where it could not be reached. */
  get(url: string): Promise<{ status: number; body: string } | null>
}

export type LinkVerdict = { changed: false; why: 'robots' | 'unknown' } | { changed: true; availability: Availability; priceFromCents: number | null }

/** Reads one link: its site's robots.txt first, then the page. Robots cached per host by the caller's map. */
/**
 * A night read through the engine's own page rule for its site, where one is written (src/lib/listings/page-rules.ts): the
 * rule's performance at the night's minute, its availability and from price. Null where no rule is written for the site, so
 * the page's Event data is read instead. Geelong Arts Centre's pages carry no Event data and mark each sold out night in their
 * 'Performances:' block, so the link check, reading Event data only, never saw Cosi's sold out nights (the engine accuracy
 * sweep, 6 November 2026).
 */
export function readByRule(url: string, html: string, night: Night): PageRead | null {
  const rule = pageRuleFor(url)
  if (!rule) return null
  let found: ReturnType<typeof rule.read> = []
  try {
    found = rule.read(html, url)
  } catch {
    return { availability: null, priceFromCents: null }
  }
  const own = found.filter((f) => Math.abs(new Date(f.startsAt).getTime() - new Date(night.startsAt).getTime()) < 60_000)
  const states = own.flatMap((f) => f.links.map((l) => l.availability))
  const availability: Availability | null = states.includes('on_sale') ? 'on_sale' : states.includes('not_yet') ? 'not_yet' : states.length > 0 && states.every((s) => s === 'sold_out') ? 'sold_out' : null
  const prices = own.flatMap((f) => f.links.map((l) => l.priceFromCents)).filter((p): p is number => p !== null)
  return { availability, priceFromCents: prices.length > 0 ? Math.min(...prices) : null }
}

export async function checkLink(url: string, deps: CheckDeps, robotsCache: Map<string, Rule[] | 'none'>, night?: Night | null): Promise<LinkVerdict> {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return { changed: false, why: 'unknown' }
  }
  let rules = robotsCache.get(u.host)
  if (rules === undefined) {
    const robots = await deps.get(`${u.protocol}//${u.host}/robots.txt`)
    rules = !robots || robots.status >= 500 ? 'none' : robots.status >= 400 ? [] : robotsRules(robots.body)
    robotsCache.set(u.host, rules)
  }
  if (rules === 'none' || !robotsAllows(rules, `${u.pathname}${u.search}`)) return { changed: false, why: 'robots' }
  const page = await deps.get(url)
  if (!page) return { changed: false, why: 'unknown' }
  const byRule = night && page.status >= 200 && page.status < 300 ? readByRule(url, page.body, night) : null
  // The rule's answer where it has one; else the page's Event data, read for this night.
  const read = byRule?.availability ? byRule : readPage(page.status, page.body, night)
  if (!read.availability) return { changed: false, why: 'unknown' }
  return { changed: true, availability: read.availability, priceFromCents: read.priceFromCents }
}
