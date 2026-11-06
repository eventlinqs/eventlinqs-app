/**
 * THE RESOLVER, RUN READ ONLY OVER THE SWEEP'S WRONG FACTS AND UNREADABLE LISTINGS (the CONTROLLER's 06:21 of 7 November
 * 2026: 'run it over the 45 wrong facts and the 94 unreadable before anything is hidden; the counts corrected, re-sourced and
 * quarantined go in the report'). Nothing is written to the database: each fact gets the ruling the resolver WOULD apply
 * (src/lib/listings/resolver.ts), with every page read and what it stated, into a report.
 *
 * For each listing it reads, through the polite reader (robots.txt first, the collector's agent, one request a second per
 * host, a stop at the first 403 or 429): the listing's own source page, and every page its booking links name (the ticket
 * seller's, often the venue's own box office). The price and the status are read by the engine's own link reader
 * (src/lib/events/link-check.ts readByRule, then readPage), the start by the collector's readers (a page rule, else the
 * page's Event data) and the page's own words (src/lib/listings/stated-words.ts).
 *
 *   scripts\ops\with-supabase-token.ps1 node node_modules/tsx/dist/cli.mjs scripts/verify/resolve-run.mts <sweep.json> [--out dir]
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
const { statedInWords } = pick((await import('@/lib/listings/stated-words')) as typeof import('@/lib/listings/stated-words'))
const { resolveFact } = pick((await import('@/lib/listings/resolver')) as typeof import('@/lib/listings/resolver'))
type Reading = import('@/lib/listings/resolver').Reading

const args = process.argv.slice(2)
const SWEEP = args.find((a) => a.endsWith('.json'))
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'C:/dev/EVIDENCE/ENGINE-P0/resolver'
if (!SWEEP) throw new Error('usage: resolve-run.mts <sweep.json> [--out dir]')
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN) throw new Error('REFUSED: run under scripts\\ops\\with-supabase-token.ps1 (production is read, never written)')

type Fact = { field: string; ok: boolean; host: string; title: string; detail: string; source: string; eventId: string }
type Unreadable = { title: string; when: string; source: string; why: string; eventId: string; city: string; host: string }
const sweep = JSON.parse(readFileSync(SWEEP, 'utf8')) as { at: string; facts: Fact[]; unreadable: Unreadable[] }
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
type EventRow = { id: string; title: string; start_date: string; timezone: string | null; links: { url: string; price_from_cents: number | null; availability: string | null }[] | null }
const events = await sql<EventRow>(`
  select e.id, e.title, e.start_date, e.timezone,
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
    return found.length ? 'another time' : null
  }
  return null
}
const storedOf = (field: string, e: EventRow): string | null => {
  const l = e.links?.[0]
  if (field === 'price') return l?.price_from_cents == null ? null : String(l.price_from_cents)
  if (field === 'status') return l?.availability ?? null
  return e.start_date
}

type Row = { title: string; field: string; ruling: string; value: string | null; reason: string | null; readings: string }
const rows: Row[] = []
async function resolveOne(e: EventRow, field: string, ownUrl: string): Promise<void> {
  const stored = storedOf(field, e) ?? ''
  const urls = [ownUrl, ...(e.links ?? []).map((l) => l.url)].filter((u, i, all) => /^https?:\/\//.test(u) && all.indexOf(u) === i)
  const readings: Reading[] = []
  for (const u of urls) readings.push({ kind: u === ownUrl ? 'listing' : 'seller', url: u, value: await statedBy(u, field, e) })
  const out = resolveFact({ stored, ownUrl, readings })
  rows.push({
    title: e.title,
    field,
    ruling: out.kind,
    value: out.kind === 'quarantine' ? null : out.value,
    reason: out.kind === 'quarantine' ? out.reason : null,
    readings: readings.map((r) => `${new URL(r.url).host}: ${r.value ?? pages.get(r.url)?.why ?? 'does not state it'}`).join('; '),
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
  quarantine: list.filter((r) => r.ruling === 'quarantine').length,
  reasons: Object.fromEntries(['sources_disagree', 'single_source', 'unverifiable'].map((k) => [k, list.filter((r) => r.reason === k).length])),
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
console.log(`[resolve-run] wrong facts ${JSON.stringify(report.wrongFacts)}`)
console.log(`[resolve-run] unreadable ${JSON.stringify(report.unreadable)}`)
console.log(`[resolve-run] ${OUT}/resolve-run-${stamp}.json; nothing written to the database`)
