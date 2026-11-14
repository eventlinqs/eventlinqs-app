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
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const { statedInWords, statedWeekly, statedSeasonal, statedByGates, statedInDatedList, statedEveryWeekday, statedDailyInRange, statedUnderName } = pick((await import('@/lib/listings/stated-words')) as typeof import('@/lib/listings/stated-words'))
const { titleShare, SAME_TITLE_SHARE } = pick((await import('@/lib/events/booking-links')) as typeof import('@/lib/events/booking-links'))
type Found = import('@/lib/listings/collect').FoundEvent
const { judgeNight, sameMinute, sameTitle, timed, clock } = pick((await import('@/lib/listings/night-judge')) as typeof import('@/lib/listings/night-judge'))

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
const links = await inChunks<{ event_id: string; url: string; price_from_cents: number | null; availability: string }>(events.map((e) => e.id), (c, a, b) => db.from('event_booking_links').select('id, event_id, url, price_from_cents, availability').in('event_id', c).order('id').range(a, b))

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

/* The judge and its helpers live in src/lib/listings/night-judge.ts (15 November 2026), shared with the six hourly re-read. */

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
type Unread = { e: Ev; src: string; why: string; host: string }

/* LEARNING PART 3 (the CONTROLLER's 08:42 of 7 November 2026; src/lib/listings/source-patterns.ts): on each listing's own
   source page (the first pass, never a booking page), which kind of schedule words vouched for it today, or that none did.
   A listing whose nights are all unvouched is an observation of null; one vouched night is enough to match. */
type PatternKind = import('@/lib/listings/source-patterns').PatternKind
const observed = new Map<string, { host: string; sourceUrl: string; title: string; matched: PatternKind | null; eventIds: string[] }>()
function observe(e: Ev, src: string, host: string, kind: PatternKind | null, sourcePage: boolean): void {
  if (!sourcePage) return
  const key = `${src}|${e.title}`
  const o = observed.get(key) ?? { host, sourceUrl: src, title: e.title, matched: null, eventIds: [] }
  if (kind !== null) o.matched = o.matched ?? kind
  else o.eventIds.push(e.id)
  observed.set(key, o)
}

/**
 * One page judged for the listings it holds; what it cannot judge is returned. `sessions` counts the page's own nights
 * against our listings, done on a listing's source page only, so a booking page read second never counts a night twice.
 */
async function judgePage(src: string, listed: Ev[], sessions: boolean): Promise<Unread[]> {
  const left: Unread[] = []
  const u = new URL(src)
  const host = u.host.replace(/^www\./, '')
  let r = robots.get(u.origin)
  if (!r) {
    r = await polite(`${u.origin}/robots.txt`)
    robots.set(u.origin, r)
  }
  const unread = (why: string) => listed.map((e) => ({ e, src, why, host }))
  if (robotsVerdict(r.status, r.body, u.pathname + u.search) === 'disallowed') return unread('robots.txt disallows a re-read')
  const page = await polite(src)
  if (page.pdf) return unread('the source is a PDF')
  if (page.status !== 200) return unread(`the page answered ${page.status ?? 'nothing'}`)
  const rule = pageRuleFor(src)
  let found: Found[] = []
  try {
    found = rule ? rule.read(page.body, src) : eventsFromBody(page.body, src)
  } catch {
    found = []
  }
  for (const e of listed) {
    const j = judgeNight(e, (rules.get(e.listing_series_id) ?? 'once') !== 'once', page.body, found, links.filter((l) => l.event_id === e.id))
    for (const f of j.facts) facts.push({ ...f, host, title: e.title, source: src, eventId: e.id })
    if (j.pattern !== undefined) observe(e, src, host, j.pattern, sessions)
    if (j.unread) left.push({ e, src, why: j.unread, host })
  }
  // Sessions: every timed night the page states for a title we list here, inside the horizon, has its own listing.
  const titles = [...new Set(listed.map((e) => e.title))]
  for (const f of sessions ? found : []) {
    const t = new Date(f.startsAt).getTime()
    if (t <= now.getTime() || t > horizon || !timed(f)) continue
    if (!titles.some((x) => sameTitle(x, f.title))) continue
    const has = events.some((e) => sameTitle(e.title, f.title) && sameMinute(e.start_date, f.startsAt))
    facts.push({ field: 'session', ok: has, host, title: f.title, detail: has ? clock(f.startsAt, 'Australia/Melbourne') : `the page states ${clock(f.startsAt, 'Australia/Melbourne')}, which we do not list`, source: src })
  }
  return left
}

let pageNo = 0
const firstPass: Unread[] = []
for (const src of pages) {
  pageNo += 1
  firstPass.push(...(await judgePage(src, byPage.get(src) ?? [], true)))
  if (pageNo % 25 === 0) console.log(`[sweep] ${pageNo} of ${pages.length} pages read`)
}
// Second: a listing its source page could not judge is read on its own booking page, the seller's, where it has one.
const byBooking = new Map<string, Unread[]>()
for (const x of firstPass) {
  const url = links.find((l) => l.event_id === x.e.id && /^https:\/\//.test(l.url) && l.url !== x.src)?.url
  if (!url) {
    unreadable.push({ title: x.e.title, when: x.e.start_date, source: x.src, why: x.why, eventId: x.e.id, city: x.e.city_primary, host: x.host })
    continue
  }
  byBooking.set(url, [...(byBooking.get(url) ?? []), x])
}
let viaBooking = 0
for (const [url, xs] of byBooking) {
  const left = await judgePage(url, xs.map((x) => x.e), false)
  viaBooking += xs.length - left.length
  for (const l of left) {
    const first = xs.find((x) => x.e.id === l.e.id) as Unread
    unreadable.push({ title: l.e.title, when: l.e.start_date, source: first.src, why: `${first.why}; its booking page too (${l.why})`, eventId: l.e.id, city: l.e.city_primary, host: first.host })
  }
}
console.log(`[sweep] ${viaBooking} listing(s) judged on their booking page where the source page could not be`)

const wrong = facts.filter((f) => !f.ok)
const rate = (w: number, n: number) => (n === 0 ? 'none checked' : `${w} of ${n} (${((100 * w) / n).toFixed(3)}%)`)
const fields = ['start', 'venue', 'price', 'status', 'session'] as const
const hosts = [...new Set(facts.map((f) => f.host))].sort()
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
/* Each source's schedule, remembered (learning part 3): patterns.json beside the trend, one pattern per listing per page. A
   page that stops vouching for a schedule it stated breaks the pattern, and its nights' unreadable entries carry the reason,
   so the resolver holds them rather than letting the old words publish them. */
const patternsBroken: { title: string; host: string; kind: string; firstSeen: string; lastMatched: string; misses: number; why: string; eventIds: readonly string[] }[] = []
{
  const { learnPatterns } = pick((await import('@/lib/listings/source-patterns')) as typeof import('@/lib/listings/source-patterns'))
  // The folder first: on 15 November 2026 a run with a new SWEEP_OUT read every page and then stopped here, ENOENT on its
  // patterns file, losing the whole run's findings.
  mkdirSync(OUT, { recursive: true })
  const patternFile = `${OUT}/patterns.json`
  const memory = existsSync(patternFile) ? (JSON.parse(readFileSync(patternFile, 'utf8')) as import('@/lib/listings/source-patterns').Pattern[]) : []
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const { patterns, broken, learned } = learnPatterns(memory, [...observed.values()], today)
  writeFileSync(patternFile, JSON.stringify(patterns, null, 1))
  for (const b of broken) {
    patternsBroken.push({ title: b.pattern.title, host: b.pattern.host, kind: b.pattern.kind, firstSeen: b.pattern.firstSeen, lastMatched: b.pattern.lastMatched, misses: b.pattern.misses, why: b.why, eventIds: b.eventIds })
    for (const id of b.eventIds) {
      const u = unreadable.find((x) => x.eventId === id)
      if (u) u.why = `${b.why} (${u.why})`
    }
  }
  console.log(`[sweep] schedules: ${patterns.filter((x) => !x.retired).length} remembered, ${learned} learned today, ${broken.length} broken, in ${patternFile}`)
  for (const b of broken) console.log(`[sweep]   BROKEN ${b.pattern.host} ${b.pattern.title}: ${b.eventIds.length} night(s) to the resolver`)
}
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
writeFileSync(`${OUT}/sweep-${stamp}.json`, JSON.stringify({ at: new Date().toISOString(), events: events.length, pages: pages.length, facts, unreadable, patternsBroken }, null, 1))
/* THE TREND (learning part 1 of the CONTROLLER's 08:42 of 7 November 2026): one row a run, appended to trend.jsonl beside the
   runs; a rate above the day before's last run is said here, for a CONTROLLER line (src/lib/listings/accuracy-trend.ts). */
{
  const { trendRow, rateRose } = pick((await import('@/lib/listings/accuracy-trend')) as typeof import('@/lib/listings/accuracy-trend'))
  const trendFile = `${OUT}/trend.jsonl`
  const earlier = existsSync(trendFile)
    ? readFileSync(trendFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as import('@/lib/listings/accuracy-trend').TrendRow)
    : []
  const row = trendRow(new Date().toISOString(), facts, unreadable.length)
  appendFileSync(trendFile, JSON.stringify(row) + '\n')
  console.log(`[sweep] trend: ${row.date} ${row.rate}% (${row.wrong} of ${row.facts}), ${earlier.length + 1} run(s) in ${trendFile}`)
  if (rateRose(earlier, row)) console.log(`[sweep] RATE ROSE over the day before: ${row.rate}% against the last run before ${row.date}; a CONTROLLER line`)
}
console.log(`[sweep] ${events.length} listings, ${pages.length} pages; wrong ${rate(wrong.length, facts.length)}; unreadable ${unreadable.length}; ${OUT}/sweep-${stamp}.md`)
for (const f of fields) console.log(`[sweep]   ${f}: ${rate(wrong.filter((x) => x.field === f).length, facts.filter((x) => x.field === f).length)}`)
