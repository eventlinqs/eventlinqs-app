/**
 * THE HUNT'S TIMES, CORRECTED IN PLACE (car 44c; the CONTROLLER's 14:55 of 5 November 2026: 'correct every hunt-written row
 * on production ... any night whose time cannot be read is held back, never shown with a guessed time').
 *
 * For every night the hunt's rule listed today (a partner_rule candidate with a published series, from a source on the hunt's
 * list), the night's own page is read again through the FIXED readers (robots first, one request a second per host, a stop at
 * 403 or 429, the collector's agent), and each night is:
 *   RIGHT  the page states the stored start: nothing changes;
 *   MOVE   the page states the stored clock in Melbourne time (the fault: the local clock stored as UTC): the candidate's
 *          starts_at and the series' anchor_date, day and starts_at move to the page's own time, so the night keeps its
 *          series and its record;
 *   HOLD   the page states no time the reader can trust, or no longer this night: the series is PAUSED (never a guess).
 * Then the platform's own occurrence run (src/lib/listings/occurrence-run.ts) runs for exactly those nights, so each event
 * moves to its night's date and time, or comes off, now rather than at the next hourly run.
 *
 *   scripts\ops\with-supabase-token.ps1 node node_modules/tsx/dist/cli.mjs scripts/ops/hunt-correct-times.mts --target production
 *       a DRY RUN: reads the pages, prints every night's decision, writes nothing
 *   ... --target production --apply     needs ALLOW_PRODUCTION_SUPABASE=1, then APPLY typed; logged in C:\dev\PRODUCTION-WRITES.txt;
 *       every row's before values saved to C:\dev\EVIDENCE\CAR44\correct-times-before-<stamp>.json (the rollback)
 */
import Module from 'node:module'
import { appendFileSync, mkdirSync, readFileSync, readSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import type * as CollectModule from '@/lib/listings/collect'
import type * as RulesModule from '@/lib/listings/page-rules'
import type * as HuntModule from '@/lib/listings/headline-hunt'
import type * as TimeModule from '@/lib/dates/event-time'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const NEXT_STUB = fileURLToPath(new URL('./lib/next-request-stub.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only'
    ? EMPTY
    : request === 'next/cache' || request === 'next/headers'
      ? NEXT_STUB
      : resolveFilename(request, ...rest)

const pick = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const { COLLECTOR_AGENT, robotsVerdict, eventsFromBody, wallClockToIso } = pick((await import('@/lib/listings/collect')) as typeof CollectModule)
const { pageRuleFor } = pick((await import('@/lib/listings/page-rules')) as typeof RulesModule)
const { huntFor } = pick((await import('@/lib/listings/headline-hunt')) as typeof HuntModule)
const { toZonedInputValue } = pick((await import('@/lib/dates/event-time')) as typeof TimeModule)

const TARGETS = { production: 'gndnldyfudbytbboxesk', test: 'vkapkibzokmfaxqogypq' } as const
const ZONE = 'Australia/Melbourne'
const LOG = 'C:/dev/PRODUCTION-WRITES.txt'
const args = process.argv.slice(2)
const target = args[args.indexOf('--target') + 1] as keyof typeof TARGETS
const apply = args.includes('--apply')
if (!(target in TARGETS)) {
  console.error('[hunt-correct-times] REFUSED: --target must be test or production; there is no default')
  process.exit(1)
}
if (target === 'production' && apply && process.env.ALLOW_PRODUCTION_SUPABASE !== '1') {
  console.error('[hunt-correct-times] REFUSED: a production run that writes needs ALLOW_PRODUCTION_SUPABASE=1 set for this run, then APPLY typed')
  process.exit(1)
}
const token = process.env.SUPABASE_ACCESS_TOKEN ?? ''
if (!token) {
  console.error('[hunt-correct-times] REFUSED: run it through scripts\\ops\\with-supabase-token.ps1')
  process.exit(1)
}
const ref = TARGETS[target]
const keys = (await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { name: string; api_key: string }[]
const service = keys.find((k) => k.name === 'service_role')?.api_key
if (!service) {
  console.error(`[hunt-correct-times] REFUSED: the ${target} service key could not be read`)
  process.exit(1)
}
const url = `https://${ref}.supabase.co`
const db = createClient(url, service, { auth: { persistSession: false } })

/** The platform's own occurrence run, for exactly these nights (its revalidation a no-op here: next-request-stub.ts). */
async function occurrencesFor(ids: Set<string>) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = url
  process.env.SUPABASE_SERVICE_ROLE_KEY = service
  const { runOccurrences } = pick((await import('@/lib/listings/occurrence-run')) as typeof import('@/lib/listings/occurrence-run'))
  const { occurrenceStore } = pick((await import('@/lib/listings/occurrence-store')) as typeof import('@/lib/listings/occurrence-store'))
  const store = occurrenceStore()
  return runOccurrences({ ...store, nights: async (now: Date) => (await store.nights(now)).filter((x) => ids.has(x.id)) }, new Date())
}

function typedApply(prompt: string) {
  process.stdout.write(prompt)
  const b = Buffer.alloc(64)
  let got = 0
  try {
    got = readSync(0, b, 0, b.length, null)
  } catch {
    got = 0
  }
  if (b.subarray(0, got).toString('utf8').trim() !== 'APPLY') {
    console.error('[hunt-correct-times] not applied')
    process.exit(1)
  }
}

/* --occurrences-for <before-values file>: only the occurrence run, for the series a corrected run touched (car 44c: the
   first APPLY of 5 November moved and paused the series, then its occurrence step stopped at revalidatePath). */
const forFile = args.includes('--occurrences-for') ? args[args.indexOf('--occurrences-for') + 1] : null
if (forFile) {
  const saved = JSON.parse(readFileSync(forFile, 'utf8')) as { series: { id: string }[] }
  const ids = new Set(saved.series.map((s) => s.id))
  console.log(`[hunt-correct-times] the occurrence run for ${ids.size} corrected night(s) from ${forFile}`)
  if (!apply) {
    console.log('[hunt-correct-times] DRY RUN: nothing written. Add --apply to write.')
    process.exit(0)
  }
  typedApply(`Type APPLY to run the occurrence run for ${ids.size} night(s) on ${target}: `)
  const s = await occurrencesFor(ids)
  console.log(`[hunt-correct-times] occurrence run: ${JSON.stringify({ ...s, held: s.held, failed: s.failed })}`)
  if (target === 'production') {
    appendFileSync(LOG, `${new Date().toISOString()} | hunt-correct-times --occurrences-for | production | the occurrence run for the ${ids.size} corrected hunted night(s): created ${s.created}, updated ${s.updated}, deleted ${s.deleted}, cancelled ${s.cancelled}, unchanged ${s.unchanged}, held ${s.held.length}, failed ${s.failed.length}. Series list: ${forFile}\n`)
  }
  process.exit(0)
}

type Night = { id: string; title: string; pageUrl: string; startsAt: string; seriesId: string; sourcePage: string }
const { data: rows, error } = await db
  .from('listing_candidates')
  .select('id, title, page_url, starts_at, published_series_id, source:listing_sources!inner(page_url)')
  .eq('decided_by', 'partner_rule')
  .not('published_series_id', 'is', null)
  .gte('starts_at', new Date().toISOString())
if (error) throw new Error(`the hunt's nights could not be read: ${error.message}`)
const nights: Night[] = (rows ?? [])
  .map((r) => {
    const src = (Array.isArray(r.source) ? r.source[0] : r.source) as { page_url: string } | null
    return { id: r.id as string, title: r.title as string, pageUrl: r.page_url as string, startsAt: new Date(r.starts_at as string).toISOString(), seriesId: r.published_series_id as string, sourcePage: src?.page_url ?? '' }
  })
  .filter((n) => huntFor(n.sourcePage))

/* The pages, politely. */
const lastHit = new Map<string, number>()
const stopped = new Set<string>()
const robots = new Map<string, { status: number | null; body: string }>()
async function polite(u: string): Promise<{ status: number | null; body: string }> {
  const host = new URL(u).host
  if (stopped.has(host)) return { status: null, body: '' }
  const wait = (lastHit.get(host) ?? 0) + 1000 - Date.now()
  if (wait > 0) await new Promise((res) => setTimeout(res, wait))
  lastHit.set(host, Date.now())
  try {
    const res = await fetch(u, { headers: { 'User-Agent': COLLECTOR_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(25000) })
    if (res.status === 403 || res.status === 429) stopped.add(host)
    return { status: res.status, body: res.ok ? await res.text() : '' }
  } catch {
    return { status: null, body: '' }
  }
}
const readings = new Map<string, { status: number | null; starts: Set<string> }>()
for (const pageUrl of [...new Set(nights.map((n) => n.pageUrl))]) {
  const u = new URL(pageUrl)
  let r = robots.get(u.origin)
  if (!r) {
    r = await polite(`${u.origin}/robots.txt`)
    robots.set(u.origin, r)
  }
  if (robotsVerdict(r.status, r.body, u.pathname + u.search) === 'disallowed') {
    readings.set(pageUrl, { status: null, starts: new Set() })
    continue
  }
  const page = await polite(pageUrl)
  const rule = pageRuleFor(pageUrl)
  const found = page.body ? (rule ? rule.read(page.body, pageUrl) : eventsFromBody(page.body, pageUrl)) : []
  readings.set(pageUrl, { status: page.status, starts: new Set(found.map((f) => new Date(f.startsAt).toISOString())) })
}

/** The fault's own mapping: the stored instant's UTC clock, read as Melbourne's clock. */
const asMelbourne = (iso: string) => {
  const d = new Date(iso)
  return wallClockToIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), 0, ZONE)
}
const local = (iso: string) => toZonedInputValue(iso, ZONE).replace('T', ' ')
type Decision = { night: Night; kind: 'right' | 'move' | 'hold'; to: string | null; why: string }
const decisions: Decision[] = nights.map((night) => {
  const reading = readings.get(night.pageUrl)
  if (!reading || reading.status !== 200) return { night, kind: 'hold', to: null, why: `the page answered ${reading?.status ?? 'nothing'}` }
  if (reading.starts.has(night.startsAt)) return { night, kind: 'right', to: null, why: 'the page states this start' }
  const to = asMelbourne(night.startsAt)
  if (to && reading.starts.has(new Date(to).toISOString())) return { night, kind: 'move', to: new Date(to).toISOString(), why: "the page states this clock in Melbourne time" }
  return { night, kind: 'hold', to: null, why: reading.starts.size ? 'the page no longer states this night' : 'the page states no time the reader can trust' }
})
for (const d of decisions) {
  console.log(`${d.kind.toUpperCase().padEnd(5)} ${d.night.title.slice(0, 50).padEnd(50)} stored ${local(d.night.startsAt)}${d.to ? ` -> ${local(d.to)}` : ''} | ${d.why} | ${d.night.pageUrl}`)
}
const count = (k: Decision['kind']) => decisions.filter((d) => d.kind === k).length
console.log(`[hunt-correct-times] ${target}: ${nights.length} hunted night(s): ${count('right')} right, ${count('move')} to move, ${count('hold')} to hold back`)
if (!apply) {
  console.log('[hunt-correct-times] DRY RUN: nothing written. Add --apply to write.')
  process.exit(0)
}
typedApply(`Type APPLY to correct ${count('move')} and hold back ${count('hold')} night(s) on ${target}: `)

/* The before values, the rollback. */
const touched = decisions.filter((d) => d.kind !== 'right')
const { data: before } = await db.from('event_series').select('id, anchor_date, day, starts_at, status').in('id', touched.map((d) => d.night.seriesId))
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
mkdirSync('C:/dev/EVIDENCE/CAR44', { recursive: true })
writeFileSync(`C:/dev/EVIDENCE/CAR44/correct-times-before-${stamp}.json`, JSON.stringify({ target, candidates: touched.map((d) => ({ id: d.night.id, starts_at: d.night.startsAt })), series: before }, null, 1))

let moved = 0
let held = 0
const failed: string[] = []
for (const d of touched) {
  if (d.kind === 'move' && d.to) {
    const z = toZonedInputValue(d.to, ZONE)
    const anchor = z.slice(0, 10)
    const { error: se } = await db
      .from('event_series')
      .update({ anchor_date: anchor, day: new Date(`${anchor}T00:00:00Z`).getUTCDay(), starts_at: z.slice(11, 16) })
      .eq('id', d.night.seriesId)
    const { error: ce } = se ? { error: null } : await db.from('listing_candidates').update({ starts_at: d.to }).eq('id', d.night.id)
    if (se || ce) failed.push(`${d.night.title}: ${(se ?? ce)?.message}`)
    else moved += 1
  } else {
    const { error: pe } = await db.from('event_series').update({ status: 'paused' }).eq('id', d.night.seriesId)
    if (pe) failed.push(`${d.night.title}: ${pe.message}`)
    else held += 1
  }
}

const summary = await occurrencesFor(new Set(touched.map((d) => d.night.seriesId)))
console.log(`[hunt-correct-times] moved ${moved}, held back ${held}, failed ${failed.length}${failed.length ? `: ${failed.slice(0, 5).join('; ')}` : ''}`)
console.log(`[hunt-correct-times] occurrence run for those nights: ${JSON.stringify({ ...summary, held: summary.held.length, failed: summary.failed })}`)
if (target === 'production') {
  appendFileSync(
    LOG,
    `${new Date().toISOString()} | hunt-correct-times | production | the CONTROLLER's 14:55: ${moved} hunted night(s) moved to their page's own time (series and candidate), ${held} held back (series paused), ${failed.length} failed; occurrence run for those nights created ${summary.created}, updated ${summary.updated}, deleted ${summary.deleted}, cancelled ${summary.cancelled}. Before values: C:\\dev\\EVIDENCE\\CAR44\\correct-times-before-${stamp}.json\n`,
  )
}
