/**
 * THE ENGINE ACCURACY SWEEP (the CONTROLLER's 20:34 of 6 November 2026; Lawal 20:33: '0.0001 error rates'). READ ONLY.
 *
 * Every upcoming published listing, read against its own source page (the newest listing check's source_url), each page read
 * once through the engine's own polite reader (robots.txt first, one request a second per host, a stop at 403 or 429, the
 * collector's named agent) and its own page rule or generic reader, exactly as the engine reads it. Facts judged per listing:
 *   start    the page states this night's date and start: a night of its own at the same minute, or the date with the time
 *            within 300 characters in its words (statedInWords), or, for a recurring listing, its weekly words (statedWeekly)
 *   venue    the same place: the street the page gives against ours, else the venue names folded (Mt and Mount alike)
 *   price    the seller's from price the page states for that night, when both sides hold one
 *   status   the page does not call the night postponed, rescheduled or sold out while we show it bookable
 * and per page, for every title we list there:
 *   session  every timed night the page states inside the horizon, under that same title, has its own listing
 * A listing whose page gives nothing the readers can judge is UNREADABLE, listed for holding from discovery, never guessed.
 * The error rate is wrong facts over facts checked, in total, by field and by source host.
 *
 * First run, 6 November 21:27, corrected after its every wrong fact was read (WINDOW 5, 21:50): a date only night (Bird's
 * Basement's structured data) was compared at midnight against our stated 7:30 pm; a recurring listing (City of Melbourne's
 * weekly comedy) against its page's range start; a venue by its name though the street was the same; and a session matched
 * on shared generic words ('YVES. Australian Tour 2026' read as Fleshwater's tour). Each now judged as above.
 *
 *   scripts\ops\with-supabase-token.ps1 node node_modules/tsx/dist/cli.mjs scripts/verify/engine-accuracy-sweep.mts
 */
import Module from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) => (request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest))
const pick = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const { COLLECTOR_AGENT, robotsVerdict, eventsFromBody, COLLECT_AHEAD_DAYS } = pick((await import('@/lib/listings/collect')) as typeof import('@/lib/listings/collect'))
const { pageRuleFor } = pick((await import('@/lib/listings/page-rules')) as typeof import('@/lib/listings/page-rules'))
const { fold } = pick((await import('@/lib/listings/headline-hunt')) as typeof import('@/lib/listings/headline-hunt'))
const { statedInWords, statedWeekly } = pick((await import('@/lib/listings/stated-words')) as typeof import('@/lib/listings/stated-words'))
const { titleShare, SAME_TITLE_SHARE } = pick((await import('@/lib/events/booking-links')) as typeof import('@/lib/events/booking-links'))
type Found = import('@/lib/listings/collect').FoundEvent

const REF = 'gndnldyfudbytbboxesk' // production, read only: nothing in this file writes
const OUT = process.env.SWEEP_OUT ?? 'C:/dev/GROWTH/accuracy'
const token = process.env.SUPABASE_ACCESS_TOKEN ?? ''
if (!token) throw new Error('REFUSED: run it through scripts\\ops\\with-supabase-token.ps1')
const keys = (await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { name: string; api_key: string }[]
const service = keys.find((k) => k.name === 'service_role')?.api_key
if (!service) throw new Error('REFUSED: the production key could not be read')
const db = createClient(`https://${REF}.supabase.co`, service, { auth: { persistSession: false } })

async function every<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await read(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}
/**
 * Read by groups of ids, each group read whole: a group past Supabase's silent thousand-row cap would lose rows. The first
 * corrected run (21:41) read listing_checks in groups of 200 series unpaged, a group of daily confirmations passed 1,000, and
 * 27 listings with a source on record were reported as having none.
 */
async function inChunks<T>(ids: string[], read: (chunk: string[], from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 100) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await read(ids.slice(i, i + 100), from, from + 999)
      if (error) throw new Error(error.message)
      out.push(...((data ?? []) as T[]))
      if (!data || data.length < 1000) break
    }
  }
  return out
}

type Ev = { id: string; title: string; start_date: string; timezone: string | null; venue_name: string | null; venue_address: string | null; city_primary: string | null; listing_series_id: string }
const now = new Date()
const events = await every<Ev>((a, b) =>
  db.from('events').select('id, title, start_date, timezone, venue_name, venue_address, city_primary, listing_series_id').eq('status', 'published').gt('start_date', now.toISOString()).not('listing_series_id', 'is', null).order('start_date').range(a, b),
)
const seriesIds = [...new Set(events.map((e) => e.listing_series_id))]
const checks = await inChunks<{ series_id: string; source_url: string; checked_at: string }>(seriesIds, (c, a, b) => db.from('listing_checks').select('id, series_id, source_url, checked_at').in('series_id', c).order('id').range(a, b))
const rules = new Map((await inChunks<{ id: string; rule: string }>(seriesIds, (c, a, b) => db.from('event_series').select('id, rule').in('id', c).order('id').range(a, b))).map((s) => [s.id, s.rule]))
const sourceOf = new Map<string, string>()
for (const c of checks.sort((a, b) => b.checked_at.localeCompare(a.checked_at))) {
  if (!sourceOf.has(c.series_id) && /^https?:\/\//.test(c.source_url)) sourceOf.set(c.series_id, c.source_url)
}
const links = await inChunks<{ event_id: string; price_from_cents: number | null; availability: string }>(events.map((e) => e.id), (c, a, b) => db.from('event_booking_links').select('id, event_id, price_from_cents, availability').in('event_id', c).order('id').range(a, b))

// The polite reader, the verifier's own rules.
const lastHit = new Map<string, number>()
const stopped = new Set<string>()
const robots = new Map<string, { status: number | null; body: string }>()
async function polite(u: string): Promise<{ status: number | null; body: string; pdf: boolean }> {
  const host = new URL(u).host
  if (stopped.has(host)) return { status: null, body: '', pdf: false }
  const wait = (lastHit.get(host) ?? 0) + 1000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastHit.set(host, Date.now())
  try {
    const res = await fetch(u, { headers: { 'User-Agent': COLLECTOR_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(25000) })
    if (res.status === 403 || res.status === 429) stopped.add(host)
    const pdf = /pdf/i.test(res.headers.get('content-type') ?? '') || /\.pdf$/i.test(new URL(u).pathname)
    return { status: res.status, body: res.ok && !pdf ? await res.text() : '', pdf }
  } catch {
    return { status: null, body: '', pdf: false }
  }
}

const sameMinute = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000
const alike = (a: string, b: string) => fold(a) === fold(b) || titleShare(a, b) >= SAME_TITLE_SHARE
/** The same title, not merely shared words: folded equal, or one folded title holding the other whole. */
const sameTitle = (a: string, b: string) => {
  const x = fold(a)
  const y = fold(b)
  return x === y || (x.length >= 8 && y.includes(x)) || (y.length >= 8 && x.includes(y))
}
const timed = (f: Found) => f.timeStatus !== 'date_only' && f.timeStatus !== 'multi_day'
/** The street a venue address names: its first number and the street word after it ('50 little malop'). */
const street = (address: string | null | undefined) => {
  const m = fold(address ?? '').match(/\b(\d+[a-z]?)\s+([a-z]+)(?:\s+([a-z]+))?/)
  return m ? `${m[1]} ${m[2]}${m[3] && !/^(st|street|rd|road|ave|avenue|pde|parade|dr|drive|hwy|highway|ln|lane|pl|place)$/.test(m[3]) ? ` ${m[3]}` : ''}` : null
}
/** Same place: by street where both give one, else by name folded. Null where neither can say. */
const samePlace = (ours: Ev, f: Found): boolean | null => {
  const a = street(ours.venue_address)
  const b = street(f.venueAddress)
  if (a && b) return a === b || (a.split(' ')[0] === b.split(' ')[0] && a.split(' ')[1] === b.split(' ')[1])
  if (!ours.venue_name || !f.venueName) return null
  const x = fold(ours.venue_name).replace(/^the /, '')
  const y = fold(f.venueName).replace(/^the /, '')
  return x === y || x.includes(y) || y.includes(x)
}
const localDay = (iso: string, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
const clock = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).replace(/\u202f/g, ' ')

type Fact = { field: 'start' | 'venue' | 'price' | 'status' | 'session'; ok: boolean; host: string; title: string; detail: string; source: string; eventId?: string }
const facts: Fact[] = []
const unreadable: { title: string; when: string; source: string; why: string; eventId: string; city: string | null; host: string }[] = []
const byPage = new Map<string, Ev[]>()
for (const e of events) {
  const src = sourceOf.get(e.listing_series_id)
  if (!src) {
    unreadable.push({ title: e.title, when: e.start_date, source: '', why: 'no source page on record', eventId: e.id, city: e.city_primary, host: '' })
    continue
  }
  byPage.set(src, [...(byPage.get(src) ?? []), e])
}
const pages = [...byPage.keys()].sort((a, b) => new URL(a).host.localeCompare(new URL(b).host))
const horizon = now.getTime() + COLLECT_AHEAD_DAYS * 86_400_000
let pageNo = 0
for (const src of pages) {
  pageNo += 1
  const listed = byPage.get(src) ?? []
  const u = new URL(src)
  const host = u.host.replace(/^www\./, '')
  let r = robots.get(u.origin)
  if (!r) {
    r = await polite(`${u.origin}/robots.txt`)
    robots.set(u.origin, r)
  }
  const unread = (why: string) => {
    for (const e of listed) unreadable.push({ title: e.title, when: e.start_date, source: src, why, eventId: e.id, city: e.city_primary, host })
  }
  if (robotsVerdict(r.status, r.body, u.pathname + u.search) === 'disallowed') { unread('robots.txt disallows a re-read'); continue }
  const page = await polite(src)
  if (page.pdf) { unread('the source is a PDF'); continue }
  if (page.status !== 200) { unread(`the page answered ${page.status ?? 'nothing'}`); continue }
  const rule = pageRuleFor(src)
  let found: Found[] = []
  try {
    found = rule ? rule.read(page.body, src) : eventsFromBody(page.body, src)
  } catch {
    found = []
  }
  for (const e of listed) {
    const zone = e.timezone ?? 'Australia/Melbourne'
    const recurring = (rules.get(e.listing_series_id) ?? 'once') !== 'once'
    const mine = found.filter((f) => alike(f.title, e.title))
    const at = mine.find((f) => timed(f) && sameMinute(f.startsAt, e.start_date)) ?? (found.length === 1 && timed(found[0]) && sameMinute(found[0].startsAt, e.start_date) ? found[0] : undefined)
    if (at) {
      facts.push({ field: 'start', ok: true, host, title: e.title, detail: clock(e.start_date, zone), source: src, eventId: e.id })
      const place = samePlace(e, at)
      if (place !== null) facts.push({ field: 'venue', ok: place, host, title: e.title, detail: `ours '${e.venue_name}' (${e.venue_address ?? 'no address'}), the page '${at.venueName}' (${at.venueAddress ?? 'no address'})`, source: src, eventId: e.id })
      const theirs = at.links.find((l) => l.priceFromCents !== null)?.priceFromCents ?? null
      const ours = links.find((l) => l.event_id === e.id && l.price_from_cents !== null)?.price_from_cents ?? null
      if (theirs !== null && ours !== null) facts.push({ field: 'price', ok: theirs === ours, host, title: e.title, detail: `ours $${(ours / 100).toFixed(2)}, the page $${(theirs / 100).toFixed(2)}`, source: src, eventId: e.id })
      const soldOut = at.links.length > 0 && at.links.every((l) => l.availability === 'sold_out')
      const oursOnSale = links.some((l) => l.event_id === e.id && l.availability === 'on_sale')
      facts.push({ field: 'status', ok: !at.calledOff && !(soldOut && oursOnSale), host, title: e.title, detail: at.calledOff ? 'the page calls it postponed or rescheduled' : soldOut && oursOnSale ? 'the page says sold out; we show it on sale' : 'as stated', source: src, eventId: e.id })
      continue
    }
    const words = statedInWords(page.body, e.start_date, zone)
    const weekly = recurring && words !== 'both' ? statedWeekly(page.body, e.title, e.venue_name ?? '', e.start_date, zone) : null
    if (words === 'both' || weekly === 'weekly') { facts.push({ field: 'start', ok: true, host, title: e.title, detail: `${clock(e.start_date, zone)} (in the page's words)`, source: src, eventId: e.id }); continue }
    if (weekly === 'outside_term') { facts.push({ field: 'start', ok: false, host, title: e.title, detail: `ours ${clock(e.start_date, zone)}, outside the term the page states`, source: src, eventId: e.id }); continue }
    const timedMine = mine.filter(timed)
    if (timedMine.length > 0 && !recurring) {
      facts.push({ field: 'start', ok: false, host, title: e.title, detail: `ours ${clock(e.start_date, zone)}; the page states ${timedMine.slice(0, 4).map((f) => clock(f.startsAt, zone)).join(', ')}`, source: src, eventId: e.id })
      continue
    }
    const day = localDay(e.start_date, zone)
    const why = words === 'date' || mine.some((f) => !timed(f) && localDay(f.startsAt, zone) === day)
      ? 'the page states the date and no start time the readers can find'
      : found.length > 0
        ? 'the page does not state this night (it may have ended its run, been cancelled or moved)'
        : 'no reader of ours finds a night on this page'
    unreadable.push({ title: e.title, when: e.start_date, source: src, why, eventId: e.id, city: e.city_primary, host })
  }
  // Sessions: every timed night the page states for a title we list here, inside the horizon, has its own listing.
  const titles = [...new Set(listed.map((e) => e.title))]
  for (const f of found) {
    const t = new Date(f.startsAt).getTime()
    if (t <= now.getTime() || t > horizon || !timed(f)) continue
    if (!titles.some((x) => sameTitle(x, f.title))) continue
    const has = events.some((e) => sameTitle(e.title, f.title) && sameMinute(e.start_date, f.startsAt))
    facts.push({ field: 'session', ok: has, host, title: f.title, detail: has ? clock(f.startsAt, 'Australia/Melbourne') : `the page states ${clock(f.startsAt, 'Australia/Melbourne')}, which we do not list`, source: src })
  }
  if (pageNo % 25 === 0) console.log(`[sweep] ${pageNo} of ${pages.length} pages read`)
}

const wrong = facts.filter((f) => !f.ok)
const rate = (w: number, n: number) => (n === 0 ? 'none checked' : `${w} of ${n} (${((100 * w) / n).toFixed(3)}%)`)
const fields = ['start', 'venue', 'price', 'status', 'session'] as const
const hosts = [...new Set(facts.map((f) => f.host))].sort()
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
mkdirSync(OUT, { recursive: true })
const whyCounts = [...unreadable.reduce((m, x) => m.set(x.why, (m.get(x.why) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])
const lines = [
  `# Engine accuracy sweep, ${new Date().toISOString()}`,
  '',
  `${events.length} upcoming published listings on ${pages.length} source pages. Wrong facts over facts checked: ${rate(wrong.length, facts.length)}. Unreadable listings (held from discovery, never guessed): ${unreadable.length}.`,
  '',
  '## By field',
  '',
  ...fields.map((f) => `- ${f}: ${rate(wrong.filter((x) => x.field === f).length, facts.filter((x) => x.field === f).length)}`),
  '',
  '## By source host',
  '',
  ...hosts.map((h) => `- ${h}: ${rate(wrong.filter((x) => x.host === h).length, facts.filter((x) => x.host === h).length)}`),
  '',
  '## Unreadable, by reason',
  '',
  ...whyCounts.map(([why, n]) => `- ${n}: ${why}`),
  '',
  '## Every wrong fact',
  '',
  ...wrong.map((w) => `- [${w.field}] ${w.title}: ${w.detail} (${w.source})`),
  '',
  '## Unreadable listings',
  '',
  ...unreadable.map((x) => `- ${x.title}, ${x.when.slice(0, 16)}, ${x.city ?? ''}: ${x.why} (${x.source || 'no source'})`),
]
writeFileSync(`${OUT}/sweep-${stamp}.md`, lines.join('\n') + '\n')
writeFileSync(`${OUT}/sweep-${stamp}.json`, JSON.stringify({ at: new Date().toISOString(), events: events.length, pages: pages.length, facts, unreadable }, null, 1))
console.log(`[sweep] ${events.length} listings, ${pages.length} pages; wrong ${rate(wrong.length, facts.length)}; unreadable ${unreadable.length}; ${OUT}/sweep-${stamp}.md`)
for (const f of fields) console.log(`[sweep]   ${f}: ${rate(wrong.filter((x) => x.field === f).length, facts.filter((x) => x.field === f).length)}`)
