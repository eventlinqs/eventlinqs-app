/**
 * LAW 19 SECTION 7.5 (c), THE PLANTED DEMONSTRATION (C:\dev\GROWTH\RELEASE-POLICY-5NOV.md: 'a planted 7:30 pm to 7:30 am
 * change is quarantined and never shown'). TEST ONLY: the TEST project's reference is the only one this file names.
 *
 * The platform's own code end to end, on TEST's rows: the collection run (runCollection), its publication gate
 * (planCandidates, judgeCandidate, the hunt's rule), the candidate store (collectionStore), and the hourly occurrence run
 * (runOccurrences) that turns a published series into an event. Only the page is planted: the run is handed a fetcher
 * that answers robots.txt, the night's page and its ticket link from memory, and refuses any other address, so no real
 * site is read (law 14 (k) is about reading a source's page; none is read here).
 *
 *   A  the page states 'The Planted Quartet in Concert' at Forum Melbourne, Saturday 28 November 2026, 7:30 pm. The
 *      hunt's rule lists it (high confidence, through its candidate row) and the occurrence run makes the event.
 *   B  the page now states the same night at 7:30 am. The gate must hold it for a person (time_changed and
 *      implausible_time), publish nothing, and leave the event at 7:30 pm; the occurrence run must not move it.
 *   C  the same 7:30 am page read again (two consecutive reads): still held, still nothing published, still 7:30 pm.
 *
 *   scripts\ops\with-supabase-token.ps1 node node_modules/tsx/dist/cli.mjs scripts/verify/law19-planted-time-change.mts
 *       runs A, B and C on TEST and writes C:\dev\EVIDENCE\ENGINE-P0\demo-7-5c\run-<stamp>.json
 *   ... --retire     pauses the planted series, lets the occurrence run take its event off, and stops the planted source
 *
 * Exit 0 only when every check passes.
 */
import Module from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import type * as RunModule from '@/lib/listings/collect-run'
import type * as StoreModule from '@/lib/listings/collect-store'
import type * as ClassifyModule from '@/lib/categories/classify'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const NEXT_STUB = fileURLToPath(new URL('../ops/lib/next-request-stub.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only'
    ? EMPTY
    : request === 'next/cache' || request === 'next/headers'
      ? NEXT_STUB
      : resolveFilename(request, ...rest)

const pick = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const { runCollection } = pick((await import('@/lib/listings/collect-run')) as typeof RunModule)
const { collectionStore } = pick((await import('@/lib/listings/collect-store')) as typeof StoreModule)
const { classify } = pick((await import('@/lib/categories/classify')) as typeof ClassifyModule)

/* TEST, and only TEST. There is no target argument and no production reference in this file. */
const TEST_REF = 'vkapkibzokmfaxqogypq'
const TAG = '[law19-demo]'
const token = process.env.SUPABASE_ACCESS_TOKEN ?? ''
if (!token) {
  console.error(`${TAG} REFUSED: run it through scripts\\ops\\with-supabase-token.ps1`)
  process.exit(1)
}
const keys = (await (await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { name: string; api_key: string }[]
const service = keys.find((k) => k.name === 'service_role')?.api_key
if (!service) {
  console.error(`${TAG} REFUSED: the TEST service key could not be read`)
  process.exit(1)
}
const url = `https://${TEST_REF}.supabase.co`
const db = createClient(url, service, { auth: { persistSession: false } })

/* --night YYYY-MM-DD (default 2026-11-28): each run plants its own night, because a held row is never deleted, so a later
   run on the same night would read the earlier run's rows instead of its own. */
const NIGHT = process.argv.includes('--night') ? process.argv[process.argv.indexOf('--night') + 1] : '2026-11-28'
if (!/^2026-1[12]-\d{2}$/.test(NIGHT)) {
  console.error('[law19-demo] REFUSED: --night must be a date in November or December 2026, inside the collection horizon')
  process.exit(1)
}
const PAGE = 'https://forummelbourne.com.au/law19-demonstration-test-only/whats-on/'
const SHOW = `https://forummelbourne.com.au/shows/the-planted-quartet-law19-test-only-${NIGHT}/`
const DAY_TEXT = new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  .format(new Date(`${NIGHT}T12:00:00Z`))
  .replace(/,/g, '')
const ROBOTS = 'https://forummelbourne.com.au/robots.txt'
const TICKETS = 'https://www.ticketmaster.com.au/the-planted-quartet-law19-test-only/event/law19demo'
const TITLE = 'The Planted Quartet in Concert'
/* Every planted address lives under this prefix or /shows/...-law19-test-only/, so a run can find and stop its own rows. */
const PLANT_PREFIX = 'https://forummelbourne.com.au/law19-demonstration-test-only/'
const EVENING = `${NIGHT}T19:30:00+11:00`
const MORNING = `${NIGHT}T07:30:00+11:00`
const today = new Date().toISOString().slice(0, 10)
/* The register's answers carry their evidence (listing_sources_answers_carry_evidence); on TEST the evidence says what it is. */
const PLANTED_TERMS = 'https://forummelbourne.com.au/law19-demonstration-test-only/terms'
const PLANTED_QUOTE = 'TEST ONLY: the LAW 19 section 7.5 (c) planted demonstration. No real page is read; the run is handed the page.'

const checks: { name: string; pass: boolean; detail: string }[] = []
const check = (name: string, pass: boolean, detail: string) => {
  checks.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${detail}`)
}

async function occurrencesFor(ids: Set<string>) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = url
  process.env.SUPABASE_SERVICE_ROLE_KEY = service
  const { runOccurrences } = pick((await import('@/lib/listings/occurrence-run')) as typeof import('@/lib/listings/occurrence-run'))
  const { occurrenceStore } = pick((await import('@/lib/listings/occurrence-store')) as typeof import('@/lib/listings/occurrence-store'))
  const store = occurrenceStore()
  return runOccurrences({ ...store, nights: async (now: Date) => (await store.nights(now)).filter((x) => ids.has(x.id)) }, new Date())
}

async function plantedSource(): Promise<string> {
  /* An earlier planted page under another address is stopped, so only this one is ever read. */
  const { error: stopError } = await db
    .from('listing_sources')
    .update({ collection: 'never', stopped_at: new Date().toISOString(), stopped_because: 'an earlier LAW 19 demonstration page (TEST only)' })
    .like('page_url', `${PLANT_PREFIX}%`)
    .neq('page_url', PAGE)
  if (stopError) throw new Error(`an earlier planted source could not be stopped on TEST: ${stopError.message}`)
  const { data, error } = await db
    .from('listing_sources')
    .upsert(
      {
        name: 'LAW 19 demonstration, planted page (TEST only)',
        kind: 'venue',
        page_url: PAGE,
        city_slug: 'melbourne',
        collection: 'read',
        verification: 'verified',
        verified_on: today,
        source_type: 'manual_research',
        may_scrape: 'yes',
        may_scrape_quote: PLANTED_QUOTE,
        may_scrape_url: PLANTED_TERMS,
        may_scrape_read_on: today,
        may_redistribute_facts: 'yes',
        may_redistribute_facts_quote: PLANTED_QUOTE,
        may_redistribute_facts_url: PLANTED_TERMS,
        may_redistribute_facts_read_on: today,
        permits_facts: true,
        permits_links: true,
        permits_descriptions: false,
        permits_images: false,
        terms_url: PLANTED_TERMS,
        terms_quote: PLANTED_QUOTE,
        terms_read_on: today,
        stopped_at: null,
        stopped_because: null,
      },
      { onConflict: 'page_url' },
    )
    .select('id')
    .single()
  if (error || !data) throw new Error(`the planted source could not be written on TEST: ${error?.message ?? 'no row'}`)
  return data.id as string
}

/* Forum Melbourne's own page shapes, as its page rule reads them (src/lib/listings/page-rules-melbourne.ts, forumMelbourne):
   a list page linking each show under /shows/, and a show page with its h1, 'span.full-date' and 'span.time' inside
   'div.calendar', and its 'Buy Tickets' link. So the demonstration runs the real hunt adapter, not a generic reader. */
const listPage = `<html><body><ul><li><a href="${SHOW}">${TITLE}</a></li></ul></body></html>`
function showPage(clock: string): string {
  return `<html><body><h1>${TITLE}</h1><div class="calendar"><span class="full-date">${DAY_TEXT}</span> <span class="time">${clock}</span></div><a class="button" href="${TICKETS}">Buy Tickets</a></body></html>`
}

/** The planted web: robots.txt, the list page, the show page, its ticket link. Any other address is refused and counted. */
function planted(clock: string, asked: string[]): RunModule.Fetcher {
  const answers: Record<string, { status: number; body: string }> = {
    [ROBOTS]: { status: 200, body: 'User-agent: *\nAllow: /' },
    'https://www.ticketmaster.com.au/robots.txt': { status: 200, body: 'User-agent: *\nAllow: /' },
    [PAGE]: { status: 200, body: listPage },
    [SHOW]: { status: 200, body: showPage(clock) },
    [TICKETS]: { status: 200, body: '<html><body>tickets</body></html>' },
  }
  return async (u) => {
    asked.push(u)
    const a = answers[u] ?? { status: 404, body: '' }
    return { status: a.status, text: async () => a.body }
  }
}

async function readRun(sourceId: string, clock: string, label: string) {
  const asked: string[] = []
  const real = collectionStore(db)
  /* Only the planted source, and due now (its last read set aside in memory, never written). */
  const store = { ...real, sources: async () => (await real.sources()).filter((s) => s.id === sourceId).map((s) => ({ ...s, lastCheckedAt: null, lastSuccessAt: null })) }
  const result = await runCollection(store, planted(clock, asked), new Date(), Infinity, { pauseMs: 0 })
  for (const s of result.sources) console.log(`${TAG} ${label} run: ${s.name}: ${s.outcome}`)
  const unplanned = asked.filter((u) => ![ROBOTS, PAGE, SHOW, TICKETS, 'https://www.ticketmaster.com.au/robots.txt'].includes(u))
  check(`${label}: no address outside the planted page was asked`, unplanned.length === 0, unplanned.length === 0 ? `asked ${[...new Set(asked)].length} planted address(es)` : unplanned.join(', '))
  return result
}

async function candidates(sourceId: string) {
  const { data, error } = await db
    .from('listing_candidates')
    .select('id, kind, starts_at, status, decided_by, confidence, reasons, change, event_id, published_series_id, found_at')
    .eq('source_id', sourceId)
    .order('found_at')
  if (error) throw new Error(error.message)
  return data ?? []
}

async function eventOf(seriesId: string) {
  const { data, error } = await db.from('events').select('id, slug, title, start_date, status, listing_series_id').eq('listing_series_id', seriesId)
  if (error) throw new Error(error.message)
  return data ?? []
}

const local = (iso: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))

if (process.argv.includes('--retire')) {
  const { data: src } = await db.from('listing_sources').select('id').eq('page_url', PAGE).maybeSingle()
  if (!src) {
    console.log(`${TAG} nothing planted on TEST`)
    process.exit(0)
  }
  const ids = new Set((await candidates(src.id as string)).map((c) => c.published_series_id as string | null).filter((x): x is string => !!x))
  for (const id of ids) await db.from('event_series').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', id)
  const s = ids.size > 0 ? await occurrencesFor(ids) : null
  await db.from('listing_sources').update({ collection: 'never', stopped_at: new Date().toISOString(), stopped_because: 'the LAW 19 demonstration is over (TEST only)' }).eq('id', src.id)
  console.log(`${TAG} retired on TEST: ${ids.size} planted series paused; occurrence run ${JSON.stringify(s && { deleted: s.deleted, cancelled: s.cancelled, failed: s.failed })}; source stopped`)
  process.exit(0)
}

/* The title must be a night kind, or 7:30 am would not be implausible and the demonstration would prove less. */
const kind = classify({ title: TITLE }).primary
check('the planted night is a night kind', ['music', 'comedy', 'nightlife', 'theatre'].includes(kind ?? ''), `classify('${TITLE}') = ${kind}`)

const sourceId = await plantedSource()
console.log(`${TAG} planted source on TEST: ${sourceId} (${PAGE})`)

/* A: the evening night, listed by the hunt's rule, made an event by the occurrence run. */
const a = await readRun(sourceId, '7:30pm', 'A')
let rows = await candidates(sourceId)
const evening = rows.find((r) => r.starts_at && new Date(r.starts_at as string).getTime() === new Date(EVENING).getTime())
check('A: the 7:30 pm night is listed by the rule through its candidate row', !!evening && evening.decided_by === 'partner_rule' && !!evening.published_series_id, evening ? `decided_by ${evening.decided_by}, confidence ${evening.confidence}, reasons [${(evening.reasons as string[]).join(', ')}], series ${evening.published_series_id}; run ${JSON.stringify({ landed: a.landed, acceptedByRule: a.acceptedByRule, queued: a.queued })}` : 'no candidate at 7:30 pm')
const seriesId = (evening?.published_series_id as string | undefined) ?? ''
if (!seriesId) {
  console.error(`${TAG} STOPPED: A did not list the night, so B and C would prove nothing`)
  process.exit(1)
}
const occA = await occurrencesFor(new Set([seriesId]))
let events = await eventOf(seriesId)
check('A: the occurrence run made the event at 7:30 pm Melbourne', events.length === 1 && new Date(events[0].start_date as string).getTime() === new Date(EVENING).getTime() && events[0].status === 'published', events[0] ? `event ${events[0].id} /events/${events[0].slug} ${local(events[0].start_date as string)} ${events[0].status}; occurrence ${JSON.stringify({ created: occA.created, unchanged: occA.unchanged, failed: occA.failed })}` : `no event; occurrence ${JSON.stringify(occA)}`)
const eventId = events[0]?.id as string

/* B: the planted change, 7:30 am. Held for a person, nothing published, the event untouched. */
const b = await readRun(sourceId, '7:30am', 'B')
rows = await candidates(sourceId)
const morning = rows.find((r) => new Date(r.starts_at as string).getTime() === new Date(MORNING).getTime())
const reasons = (morning?.reasons as string[] | undefined) ?? []
check('B: the 7:30 am change lands for a person', !!morning && morning.decided_by === 'person' && morning.status !== 'accepted', morning ? `kind ${morning.kind}, change ${morning.change}, decided_by ${morning.decided_by}, status ${morning.status}, confidence ${morning.confidence}` : 'no candidate at 7:30 am')
check('B: it names the listed night as changed, never a second night', morning?.kind === 'changes_facts' && morning?.change === 'time_changed' && morning?.event_id === eventId, `kind ${morning?.kind}, change ${morning?.change}, event_id ${morning?.event_id ?? null} (the listed night ${eventId})`)
check('B: held as a time change and as implausible for its kind', reasons.includes('time_changed') && (reasons.includes('implausible_time') || reasons.includes('midnight_start')), `reasons [${reasons.join(', ')}] (implausible_time lands as midnight_start only on a database without migration 20261105160001)`)
check('B: nothing published by the rule', b.acceptedByRule === 0 && !morning?.published_series_id, `run ${JSON.stringify({ landed: b.landed, acceptedByRule: b.acceptedByRule, queued: b.queued })}, published_series_id ${morning?.published_series_id ?? null}`)
const occB = await occurrencesFor(new Set([seriesId]))
events = await eventOf(seriesId)
check('B: the event still starts at 7:30 pm after the occurrence run', events.length === 1 && events[0].id === eventId && new Date(events[0].start_date as string).getTime() === new Date(EVENING).getTime(), events[0] ? `${local(events[0].start_date as string)}; occurrence ${JSON.stringify({ created: occB.created, updated: occB.updated, unchanged: occB.unchanged, deleted: occB.deleted })}` : 'no event')
const { data: seriesRow } = await db.from('event_series').select('anchor_date, starts_at, status').eq('id', seriesId).single()
check('B: the series keeps its 19:30', seriesRow?.starts_at?.toString().startsWith('19:30') === true && seriesRow?.anchor_date === NIGHT, JSON.stringify(seriesRow))

/* C: the same 7:30 am page read again: two consecutive reads change nothing on their own. */
const c = await readRun(sourceId, '7:30am', 'C')
const after = await candidates(sourceId)
const occC = await occurrencesFor(new Set([seriesId]))
events = await eventOf(seriesId)
check('C: a second read of 7:30 am publishes nothing and adds no second row', c.acceptedByRule === 0 && after.length === rows.length, `run ${JSON.stringify({ landed: c.landed, acceptedByRule: c.acceptedByRule })}, candidate rows ${rows.length} then ${after.length}`)
check('C: the event still starts at 7:30 pm', events.length === 1 && new Date(events[0].start_date as string).getTime() === new Date(EVENING).getTime(), events[0] ? `${local(events[0].start_date as string)}; occurrence ${JSON.stringify({ updated: occC.updated, unchanged: occC.unchanged })}` : 'no event')

const failed = checks.filter((x) => !x.pass)
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
mkdirSync('C:/dev/EVIDENCE/ENGINE-P0/demo-7-5c', { recursive: true })
writeFileSync(`C:/dev/EVIDENCE/ENGINE-P0/demo-7-5c/run-${stamp}.json`, JSON.stringify({ at: new Date().toISOString(), target: 'TEST', sourceId, seriesId, eventId, slug: events[0]?.slug ?? null, candidates: after, checks }, null, 1))
console.log(`${TAG} ${checks.length - failed.length} PASS, ${failed.length} FAIL | event /events/${events[0]?.slug ?? '?'} | C:/dev/EVIDENCE/ENGINE-P0/demo-7-5c/run-${stamp}.json`)
process.exit(failed.length === 0 ? 0 : 1)
