/**
 * THE RESOLVER, RUN READ ONLY OVER THE SWEEP'S WRONG FACTS AND UNREADABLE LISTINGS (the CONTROLLER's 06:21 of 7 November
 * 2026: 'run it over the 45 wrong facts and the 94 unreadable before anything is hidden; the counts corrected, re-sourced and
 * held go in the report'; the rulings of the CONTROLLER's 10:50). Nothing is written to the database: each fact gets the ruling the resolver WOULD apply
 * (src/lib/listings/resolver.ts), with every page read and what it stated, into a report.
 *
 * For each listing it reads, through the polite reader (robots.txt first, the collector's agent, one request a second per
 * host, a stop at the first 403 or 429): the listing's own source page, and every page its booking links name (the ticket
 * seller's, often the venue's own box office). The price and the status are read by the engine's own link reader
 * (src/lib/events/link-check.ts readByRule, then readPage), the start by the collector's readers (a page rule, else the
 * page's Event data) and the page's own words (src/lib/listings/stated-words.ts).
 *
 *   scripts\ops\with-supabase-token.ps1 node node_modules/tsx/dist/cli.mjs scripts/verify/resolve-run.mts <sweep.json> [--out dir] [--emit-sql]
 */
import Module from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) => (request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest))
const pick = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const { COLLECTOR_AGENT, robotsVerdict, eventsFromBody } = pick((await import('@/lib/listings/collect')) as typeof import('@/lib/listings/collect'))
const { pageRuleFor } = pick((await import('@/lib/listings/page-rules')) as typeof import('@/lib/listings/page-rules'))
const { readPage, readByRule } = pick((await import('@/lib/events/link-check')) as typeof import('@/lib/events/link-check'))
const { statedInWords, statedSeasonal, statedByGates, statedInDatedList, statedEveryWeekday, statedDailyInRange, statedUnderName } = pick((await import('@/lib/listings/stated-words')) as typeof import('@/lib/listings/stated-words'))
const { fold } = pick((await import('@/lib/listings/headline-hunt')) as typeof import('@/lib/listings/headline-hunt'))
const { resolveFact, isListingSite } = pick((await import('@/lib/listings/resolver')) as typeof import('@/lib/listings/resolver'))
const { resolverSql } = pick((await import('@/lib/listings/resolver-sql')) as typeof import('@/lib/listings/resolver-sql'))
const asField = (f: string) => (f === 'session' ? 'session' : f) as import('@/lib/listings/resolver').Field
type Reading = import('@/lib/listings/resolver').Reading

const args = process.argv.slice(2)
const SWEEP = args.find((a) => a.endsWith('.json'))
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'C:/dev/EVIDENCE/ENGINE-P0/resolver'
// --walk-holds: every open hold whose next check is due, its next source read and its next step written (hold-walk.ts).
const WALK = args.includes('--walk-holds')
if (!SWEEP && !WALK) throw new Error('usage: resolve-run.mts <sweep.json> [--out dir] [--emit-sql] | --walk-holds')
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN) throw new Error('REFUSED: run under scripts\\ops\\with-supabase-token.ps1 (production is read, never written)')

type Fact = { field: string; ok: boolean; host: string; title: string; detail: string; source: string; eventId: string }
type Unreadable = { title: string; when: string; source: string; why: string; eventId: string; city: string; host: string }
const sweep = (SWEEP ? JSON.parse(readFileSync(SWEEP, 'utf8')) : { at: '', facts: [], unreadable: [] }) as { at: string; facts: Fact[]; unreadable: Unreadable[] }
const wrong = sweep.facts.filter((f) => !f.ok)

async function sql<T>(query: string): Promise<T[]> {
  const res = await fetch('https://api.supabase.com/v1/projects/gndnldyfudbytbboxesk/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: true }),
  })
  if (!res.ok) throw new Error(`production read refused (${res.status})`)
  return res.json() as Promise<T[]>
}
const ids = [...new Set([...wrong.map((f) => f.eventId), ...sweep.unreadable.map((u) => u.eventId)])].filter((id) => /^[0-9a-f-]{36}$/.test(id))
type EventRow = { id: string; series_id: string | null; title: string; start_date: string; timezone: string | null; venue_name: string | null; venue_address: string | null; links: { url: string; price_from_cents: number | null; availability: string | null }[] | null }
const events = ids.length === 0 ? [] : await sql<EventRow>(`
  select e.id, e.listing_series_id as series_id, e.title, e.start_date, e.timezone, e.venue_name, e.venue_address,
         (select json_agg(json_build_object('url', l.url, 'price_from_cents', l.price_from_cents, 'availability', l.availability) order by l.position)
            from public.event_booking_links l where l.event_id = e.id) as links
    from public.events e where e.id in (${ids.map((id) => `'${id}'`).join(',')})`)
const byId = new Map(events.map((e) => [e.id, e]))

/* The polite reader: robots.txt first, the collector's agent, one request a second per host, a stop at 403 or 429. */
const lastHit = new Map<string, number>()
const stopped = new Set<string>()
const robots = new Map<string, { status: number | null; body: string }>()
const pages = new Map<string, { status: number | null; body: string; why: string | null }>()
async function get(u: string): Promise<{ status: number | null; body: string }> {
  const host = new URL(u).host
  if (stopped.has(host)) return { status: null, body: '' }
  const wait = (lastHit.get(host) ?? 0) + 1000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastHit.set(host, Date.now())
  try {
    const res = await fetch(u, { headers: { 'User-Agent': COLLECTOR_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(25000) })
    if (res.status === 403 || res.status === 429) stopped.add(host)
    const pdf = /pdf/i.test(res.headers.get('content-type') ?? '')
    return { status: res.status, body: res.ok && !pdf ? await res.text() : '' }
  } catch {
    return { status: null, body: '' }
  }
}
async function read(u: string): Promise<{ status: number | null; body: string; why: string | null }> {
  const hit = pages.get(u)
  if (hit) return hit
  let out: { status: number | null; body: string; why: string | null }
  try {
    const at = new URL(u)
    let r = robots.get(at.origin)
    if (!r) {
      r = await get(`${at.origin}/robots.txt`)
      robots.set(at.origin, r)
    }
    if (robotsVerdict(r.status, r.body, at.pathname + at.search) === 'disallowed') out = { status: null, body: '', why: 'robots.txt disallows a re-read' }
    else {
      const p = await get(u)
      out = { ...p, why: p.status === 200 && p.body ? null : `the page answered ${p.status ?? 'nothing'}` }
    }
  } catch {
    out = { status: null, body: '', why: 'not a readable address' }
  }
  pages.set(u, out)
  return out
}

/* What one page states of one fact, in the resolver's one form per fact. */
async function statedBy(u: string, field: string, e: EventRow): Promise<string | null> {
  const p = await read(u)
  if (p.why) return null
  const zone = e.timezone ?? 'Australia/Melbourne'
  const night = { startsAt: e.start_date, zone }
  if (field === 'price' || field === 'status') {
    const r = readByRule(u, p.body, night) ?? readPage(p.status ?? 0, p.body, night)
    return field === 'price' ? (r.priceFromCents === null ? null : String(r.priceFromCents)) : r.availability
  }
  if (field === 'start' || field === 'session') {
    const rule = pageRuleFor(u)
    const found = rule ? rule.read(p.body, u) : eventsFromBody(p.body, u)
    const at = new Date(e.start_date).getTime()
    if (found.some((f) => Math.abs(new Date(f.startsAt).getTime() - at) < 60_000)) return e.start_date
    if (statedInWords(p.body, e.start_date, zone) === 'both') return e.start_date
    if (statedSeasonal(p.body, e.title, e.start_date, zone) === 'seasonal') return e.start_date
    if (statedByGates(p.body, e.start_date, zone) || statedInDatedList(p.body, e.title, e.start_date, zone)) return e.start_date
    if (statedEveryWeekday(p.body, e.title, e.start_date, zone) === 'weekly') return e.start_date
    if (statedDailyInRange(p.body, e.start_date, zone)) return e.start_date
    if (statedUnderName(p.body, e.title, e.start_date, zone)) return e.start_date
    /* Another time is a value only when it is THE night: the page's one night of this title. A page of several nights
       that does not state this one says nothing of it (the first run 'corrected' three nights to the words 'another time'). */
    const same = found.filter((f) => fold(f.title) === fold(e.title))
    return same.length === 1 ? new Date(same[0].startsAt).toISOString() : null
  }
  if (field === 'venue') {
    /* The place this page gives THE night (the same minute, else its one night), judged by the sweep's own rule
       (engine-accuracy-sweep.mts samePlace): the street where both give one, else the names folded. The same place answers
       with ours, so it keeps; another place answers with the page's own name and address. The first run had no venue
       reader, so Macbeth's venue read as unstated and its night would have been held for a missing reader, not a doubt. */
    const rule = pageRuleFor(u)
    const found = rule ? rule.read(p.body, u) : eventsFromBody(p.body, u)
    const at = new Date(e.start_date).getTime()
    const night = found.find((f) => Math.abs(new Date(f.startsAt).getTime() - at) < 60_000) ?? (found.length === 1 ? found[0] : undefined)
    if (!night?.venueName) return null
    return samePlace(e, night.venueName, night.venueAddress ?? null) ? (e.venue_name ?? night.venueName) : `${night.venueName}${night.venueAddress ? ` (${night.venueAddress})` : ''}`
  }
  throw new Error(`no reader for the field '${field}': a field nobody reads must never hold a night`)
}
/** The street a venue address names (its first number and street word), as the sweep reads it. */
const street = (address: string | null) => {
  const m = fold(address ?? '').match(/\b(\d+[a-z]?)\s+([a-z]+)/)
  return m ? `${m[1]} ${m[2]}` : null
}
function samePlace(e: EventRow, name: string, address: string | null): boolean {
  const a = street(e.venue_address)
  const b = street(address)
  if (a && b) return a === b
  const x = fold(e.venue_name ?? '').replace(/^the /, '')
  const y = fold(name).replace(/^the /, '')
  return x !== '' && (x === y || x.includes(y) || y.includes(x))
}
const storedOf = (field: string, e: EventRow): string | null => {
  const l = e.links?.[0]
  if (field === 'price') return l?.price_from_cents == null ? null : String(l.price_from_cents)
  if (field === 'status') return l?.availability ?? null
  if (field === 'venue') return e.venue_name
  return e.start_date
}

type Row = { title: string; field: string; ruling: string; value: string | null; scope: string | null; reason: string | null; readings: string }
const rows: Row[] = []
const ruled: import('@/lib/listings/resolver-sql').Ruled[] = []
async function resolveOne(e: EventRow, field: string, ownUrl: string): Promise<void> {
  const stored = storedOf(field, e) ?? ''
  const urls = [ownUrl, ...(e.links ?? []).map((l) => l.url)].filter((u, i, all) => /^https?:\/\//.test(u) && all.indexOf(u) === i)
  const readings: Reading[] = []
  for (const u of urls) readings.push({ kind: u === ownUrl ? (isListingSite(u) ? 'listing' : 'venue') : 'seller', url: u, value: await statedBy(u, field, e) })
  const out = resolveFact({ field: asField(field), stored, ownUrl, readings })
  rows.push({
    title: e.title,
    field,
    ruling: out.kind,
    value: out.kind === 'hold' ? null : out.value,
    scope: out.kind === 'hold' ? out.scope : null,
    reason: out.kind === 'hold' ? out.reason : null,
    readings: readings.map((r) => `${new URL(r.url).host}: ${r.value ?? pages.get(r.url)?.why ?? 'does not state it'}`).join('; '),
  })
  ruled.push({
    eventId: e.id,
    seriesId: e.series_id,
    field: asField(field),
    linkUrl: e.links?.[0]?.url ?? null,
    ruling: out.kind,
    value: out.kind === 'hold' ? null : out.value,
    scope: out.kind === 'hold' ? out.scope : null,
    reason: out.kind === 'hold' ? out.reason : null,
    readings,
  })
}

for (const f of wrong) {
  const e = byId.get(f.eventId)
  if (e) await resolveOne(e, f.field, f.source)
}
for (const u of sweep.unreadable) {
  const e = byId.get(u.eventId)
  if (e) await resolveOne(e, 'start', u.source)
}

const tally = (list: Row[]) => ({
  correct: list.filter((r) => r.ruling === 'correct').length,
  keep: list.filter((r) => r.ruling === 'keep').length,
  resource: list.filter((r) => r.ruling === 'resource').length,
  holdFact: list.filter((r) => r.ruling === 'hold' && r.scope === 'fact').length,
  holdNight: list.filter((r) => r.ruling === 'hold' && r.scope === 'night').length,
  reasons: Object.fromEntries(['officials_disagree', 'no_official_page'].map((k) => [k, list.filter((r) => r.reason === k).length])),
})
const wrongRows = rows.slice(0, rows.length - sweep.unreadable.filter((u) => byId.has(u.eventId)).length)
const unreadRows = rows.slice(wrongRows.length)
mkdirSync(OUT, { recursive: true })
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
const report = {
  at: new Date().toISOString(),
  sweep: SWEEP,
  wrongFacts: { count: wrongRows.length, ...tally(wrongRows) },
  unreadable: { count: unreadRows.length, ...tally(unreadRows) },
  rows,
}
writeFileSync(`${OUT}/resolve-run-${stamp}.json`, JSON.stringify(report, null, 1))
/* --emit-sql: the rulings as ONE reviewed begin and rollback file for scripts/ops/apply-reviewed-sql-production.mjs (dry
   run first, applied on APPLY, logged): nothing here writes; the file is the proposal (src/lib/listings/resolver-sql.ts). */
if (args.includes('--emit-sql')) {
  writeFileSync(`${OUT}/resolve-run-${stamp}.sql`, resolverSql(ruled))
  console.log(`[resolve-run] ${OUT}/resolve-run-${stamp}.sql: the reviewed file, for the dry run and APPLY`)
}
console.log(`[resolve-run] wrong facts ${JSON.stringify(report.wrongFacts)}`)
console.log(`[resolve-run] unreadable ${JSON.stringify(report.unreadable)}`)
console.log(`[resolve-run] ${OUT}/resolve-run-${stamp}.json; nothing written to the database`)

/*
 * --walk-holds (the CONTROLLER's 16:55 (1): 'The resolver walks the open holds on every run'). Every open hold whose next
 * check is due is asked of its next source by the readers above: the page states our value, the hold is released; the page
 * calls the night off (the collector's calledOff), the night is cancelled; anything else, the next source (hold-walk.ts).
 * Read only: the steps are written as ONE reviewed file for the dry run and APPLY. Needs migration 20261107170001.
 */
if (WALK) {
  const { nextStep, holdWalkSql } = pick((await import('@/lib/listings/hold-walk')) as typeof import('@/lib/listings/hold-walk'))
  type Tried = import('@/lib/listings/hold-walk').Tried
  type HoldRow = EventRow & { hold_id: string; scope: 'fact' | 'night'; field: string; state: 'held' | 'unconfirmed'; next_source: string | null; sources_tried: Tried[] | null; readings: Reading[] | null }
  const due = await sql<HoldRow>(`
    select h.id as hold_id, h.scope, h.field, h.state, h.next_source, h.sources_tried, h.readings,
           e.id, e.listing_series_id as series_id, e.title, to_json(e.start_date)#>>'{}' as start_date, e.timezone, e.venue_name, e.venue_address,
           (select json_agg(json_build_object('url', l.url, 'price_from_cents', l.price_from_cents, 'availability', l.availability) order by l.position)
              from public.event_booking_links l where l.event_id = e.id) as links
      from public.listing_holds h join public.events e on e.id = h.event_id
     where h.released_at is null and (h.next_check_at is null or h.next_check_at <= now())`)
  const calledOffBy = async (u: string, e: EventRow): Promise<boolean> => {
    const p = await read(u)
    if (p.why) return false
    const rule = pageRuleFor(u)
    const found = rule ? rule.read(p.body, u) : eventsFromBody(p.body, u)
    const at = new Date(e.start_date).getTime()
    return found.some((f) => Math.abs(new Date(f.startsAt).getTime() - at) < 60_000 && (f as { calledOff?: boolean }).calledOff === true)
  }
  const steps: { hold: import('@/lib/listings/hold-walk').OpenHold; step: import('@/lib/listings/hold-walk').Step }[] = []
  for (const h of due) {
    const sources = [...new Set([...(h.readings ?? []).map((r) => r.url), ...(h.links ?? []).map((l) => l.url)])].filter((u) => /^https?:\/\//.test(u))
    const hold = { id: h.hold_id, eventId: h.id, scope: h.scope, field: h.field, state: h.state, nextSource: h.next_source ?? sources[0] ?? null, sourcesTried: h.sources_tried ?? [], sources }
    let answer: import('@/lib/listings/hold-walk').Answer = { kind: 'silent', why: 'no source to read' }
    if (hold.nextSource) {
      const value = await statedBy(hold.nextSource, h.field === 'session' ? 'start' : h.field, h)
      const stored = storedOf(h.field, h)
      if (value !== null && value === stored) answer = { kind: 'states', words: `its ${h.field} '${value}'` }
      else if ((h.field === 'start' || h.field === 'session') && (await calledOffBy(hold.nextSource, h))) answer = { kind: 'cancelled', words: 'the night called off' }
      else answer = { kind: 'silent', why: value !== null ? `states another ${h.field}: ${value}` : (pages.get(hold.nextSource)?.why ?? 'does not state it') }
    }
    steps.push({ hold, step: nextStep(hold, answer, new Date()) })
  }
  mkdirSync(OUT, { recursive: true })
  const wstamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
  writeFileSync(`${OUT}/holds-walk-${wstamp}.sql`, holdWalkSql(steps))
  const kinds = (k: string) => steps.filter((s) => s.step.kind === k).length
  console.log(`[resolve-run] holds walked: ${steps.length} due; ${kinds('release')} released, ${kinds('cancel')} cancelled, ${kinds('next')} to their next source; ${OUT}/holds-walk-${wstamp}.sql, the reviewed file; nothing written`)
}
