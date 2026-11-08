/**
 * WHAT AN ORGANISER'S OWN BOOKING PAGE STATES ABOUT ITS EVENT (organiser self-listing, Lawal's rulings of 8 November 2026,
 * 07:01 (3) and 07:05 (2)). Pure: the page's HTML in, the facts it states out, so the checks and their tests read one
 * reading. The page's own structured data first (schema.org Event in JSON-LD: the TryBooking and Humanitix pages of the
 * first three submissions, read 8 November 2026, each publish one; GroovyTown's did not), and the page's visible words
 * beside it for the checks that read words.
 *
 * Nothing is guessed: a field the page does not state is null, and a page with no Event says so.
 */

export type PageOffer = { readonly name: string | null; readonly price: number | null }

export type PageEvent = {
  readonly name: string | null
  /** As the page writes it: an ISO date and time with its offset, or a date alone. */
  readonly startDate: string | null
  readonly endDate: string | null
  readonly locationName: string | null
  readonly address: string | null
  readonly organiser: string | null
  readonly lowPrice: number | null
  readonly offers: readonly PageOffer[]
  readonly status: string | null
}

export type BookingFacts = {
  readonly events: readonly PageEvent[]
  /** The page's own title (og:title, else <title>). */
  readonly title: string | null
  /** The page's visible words, lowercased and with runs of space made one. */
  readonly text: string
}

const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/** A date as the page writes it, its offset given the colon ISO 8601 asks for ('+1100' becomes '+11:00'). */
function asDate(v: unknown): string | null {
  const s = asString(v)
  return s === null ? null : s.replace(/T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)([+-]\d{2})(\d{2})$/, 'T$1$2:$3')
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v)) return Number(v)
  return null
}

function typesOf(node: Record<string, unknown>): string[] {
  const t = node['@type']
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === 'string')
}

/** Every object in a JSON-LD value, through arrays and @graph, depth first. */
function nodesOf(value: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) for (const v of value) nodesOf(v, out)
  else if (value && typeof value === 'object') {
    const node = value as Record<string, unknown>
    out.push(node)
    if (Array.isArray(node['@graph'])) nodesOf(node['@graph'], out)
  }
  return out
}

function addressOf(location: unknown): { name: string | null; address: string | null } {
  const loc = Array.isArray(location) ? location[0] : location
  if (!loc || typeof loc !== 'object') return { name: asString(loc), address: null }
  const l = loc as Record<string, unknown>
  const a = l.address
  let address: string | null = null
  if (typeof a === 'string') address = asString(a)
  else if (a && typeof a === 'object') {
    const p = a as Record<string, unknown>
    address = [p.streetAddress, p.addressLocality, p.addressRegion, p.postalCode]
      .map(asString)
      .filter((x): x is string => x !== null)
      .map((x) => x.replace(/,\s*$/, ''))
      .join(', ') || null
  }
  return { name: asString(l.name), address }
}

function offersOf(offers: unknown): { low: number | null; list: PageOffer[] } {
  const list: PageOffer[] = []
  let low: number | null = null
  for (const node of nodesOf(offers)) {
    const isAggregate = typesOf(node).includes('AggregateOffer')
    const lp = asNumber(node.lowPrice)
    if (lp !== null) low = low === null ? lp : Math.min(low, lp)
    const price = asNumber(node.price)
    if (!isAggregate && (price !== null || asString(node.name))) list.push({ name: asString(node.name), price })
    if (Array.isArray(node.offers)) for (const o of offersOf(node.offers).list) list.push(o)
  }
  const prices = list.map((o) => o.price).filter((p): p is number => p !== null && p > 0)
  if (prices.length) low = low === null ? Math.min(...prices) : Math.min(low, ...prices)
  return { low, list }
}

function eventOf(node: Record<string, unknown>): PageEvent {
  const { name: locationName, address } = addressOf(node.location)
  const organiserNode = Array.isArray(node.organizer) ? node.organizer[0] : node.organizer
  const organiser = organiserNode && typeof organiserNode === 'object' ? asString((organiserNode as Record<string, unknown>).name) : asString(organiserNode)
  const { low, list } = offersOf(node.offers)
  return {
    name: asString(node.name),
    startDate: asDate(node.startDate),
    endDate: asDate(node.endDate),
    locationName,
    address,
    organiser,
    lowPrice: low,
    offers: list,
    status: asString(node.eventStatus),
  }
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

export function readBookingFacts(html: string): BookingFacts {
  const events: PageEvent[] = []
  const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const m of scripts) {
    let parsed: unknown
    try {
      parsed = JSON.parse(m[1].trim())
    } catch {
      continue
    }
    for (const node of nodesOf(parsed)) if (typesOf(node).some((t) => /Event$/.test(t))) events.push(eventOf(node))
  }
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  const title = asString(decode(og ?? titleTag ?? ''))
  const text = decode(
    html
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return { events, title, text }
}
