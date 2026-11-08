/**
 * THE ENGINE'S INDEPENDENT VERIFIER (the engine directive, Phases 8 and 9; LAW 19 section 3; the research note's section 6:
 * 'the thing that would have caught this without Lawal'). READ ONLY. For the fixed critical cases (every night ever
 * published wrong) and a fresh sample of at least 20 published nights across sources and the four cities, it compares,
 * field by field, three things:
 *   SOURCE   the night's own page read again now through the readers (robots first, one request a second per host, a stop
 *            at 403 or 429, the collector's agent)
 *   STORED   the event row (start_date in its timezone, venue, city, booking link)
 *   LIVE     the event page as a visitor gets it, in a browser at 390 and 1440: its schema.org startDate and the time it
 *            shows
 * and writes the table to C:\dev\EVIDENCE\ENGINE-P0\verifier-<stamp>.md. Any mismatch exits 1 and names the source.
 *
 *   scripts\ops\with-supabase-token.ps1 node node_modules/tsx/dist/cli.mjs scripts/verify/engine-verifier.mts [--sample 20]
 */
import Module from 'node:module'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import type * as CollectModule from '@/lib/listings/collect'
import type * as RulesModule from '@/lib/listings/page-rules'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)
const pick = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const { COLLECTOR_AGENT, robotsVerdict, eventsFromBody } = pick((await import('@/lib/listings/collect')) as typeof CollectModule)
const { pageRuleFor } = pick((await import('@/lib/listings/page-rules')) as typeof RulesModule)
const { fold } = pick((await import('@/lib/listings/headline-hunt')) as typeof import('@/lib/listings/headline-hunt'))
const { statedInWords, statedWeekly } = pick((await import('@/lib/listings/stated-words')) as typeof import('@/lib/listings/stated-words'))
const { verifierVerdict, sourcesToSwitchOff, asksTheWords, SOURCE_DISAGREES, PDF_SOURCE, OUTSIDE_TERM } = pick((await import('@/lib/listings/verifier-verdict')) as typeof import('@/lib/listings/verifier-verdict'))
const { expectedOfferCents, liveOfferCents, priceAgrees, categoryShown } = pick((await import('@/lib/listings/verifier-fields')) as typeof import('@/lib/listings/verifier-fields'))
const { BOOKING_LINK_COLUMNS, toBookingLink } = pick((await import('@/lib/events/booking-links')) as typeof import('@/lib/events/booking-links'))
type BookingLink = import('@/lib/events/booking-links').BookingLink
type BookingLinkRow = import('@/lib/events/booking-links').BookingLinkRow

const args = process.argv.slice(2)
const valueOf = (flag: string): string | null => (args.includes(flag) ? args[args.indexOf(flag) + 1] ?? null : null)
/*
 * --target test (LAW 19 section 7.2 on a planted failure, 6 November 2026): the same checks and the same switch against
 * TEST, with --base naming a build that serves TEST (no public site reads TEST), --only naming the nights to judge, and
 * --plant a file of planted source pages (url to status and body) answered instead of a read. Production keeps every
 * rule it had: www as its base, real reads only, and --enforce only with ALLOW_PRODUCTION_SUPABASE=1.
 */
const TARGET = valueOf('--target') ?? 'production'
const REFS: Record<string, string> = { production: 'gndnldyfudbytbboxesk', test: 'vkapkibzokmfaxqogypq' }
const REF = REFS[TARGET] // production: read only, except --enforce, which may switch a failing source off
if (!REF) {
  console.error('[engine-verifier] REFUSED: --target is production or test')
  process.exit(1)
}
if (TARGET === 'production' && (valueOf('--base') || valueOf('--plant'))) {
  console.error('[engine-verifier] REFUSED: --base and --plant are for --target test only; production is read as a visitor reads it')
  process.exit(1)
}
if (TARGET === 'test' && !valueOf('--base')) {
  console.error('[engine-verifier] REFUSED: --target test needs --base, a build serving TEST')
  process.exit(1)
}
if (TARGET === 'production' && args.includes('--enforce') && process.env.ALLOW_PRODUCTION_SUPABASE !== '1') {
  console.error('[engine-verifier] REFUSED: --enforce writes production (a failing source switched off); set ALLOW_PRODUCTION_SUPABASE=1 for this run')
  process.exit(1)
}
const BASE = valueOf('--base') ?? 'https://www.eventlinqs.com.au'
const ONLY = valueOf('--only')
const PLANTED: Record<string, { status: number; body: string }> = valueOf('--plant') ? JSON.parse(readFileSync(valueOf('--plant')!, 'utf8')) : {}
const OUT = process.env.ENGINE_EVIDENCE_DIR || 'C:/dev/EVIDENCE/ENGINE-P0'
const SAMPLE = Number(args[args.indexOf('--sample') + 1]) || 20
/** Every night ever published wrong (LAW 19 section 3, the fixed critical cases); later ones are added here. */
export const CRITICAL_TITLES = [
  'Benson Boone', 'Iron Maiden', 'Khalid', 'Joji', 'LANY', 'Death Cab For Cutie',
  'Melbourne United vs Brisbane Bullets', 'Melbourne United vs South East Melbourne Phoenix', 'Melbourne City FC vs Western Sydney Wanderers FC',
]

const token = process.env.SUPABASE_ACCESS_TOKEN ?? ''
if (!token) {
  console.error('[engine-verifier] REFUSED: run it through scripts\\ops\\with-supabase-token.ps1')
  process.exit(1)
}
const keys = (await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { name: string; api_key: string }[]
const anon = keys.find((k) => k.name === 'anon')?.api_key
const service = keys.find((k) => k.name === 'service_role')?.api_key
if (!anon || !service) {
  console.error(`[engine-verifier] REFUSED: the ${TARGET} keys could not be read`)
  process.exit(1)
}
// The events through the public (anon) key, exactly what a visitor's page reads; the listing checks (not public) through
// the service key, SELECT only: nothing in this script writes.
const db = createClient(`https://${REF}.supabase.co`, anon, { auth: { persistSession: false } })
const records = createClient(`https://${REF}.supabase.co`, service, { auth: { persistSession: false } })

type Row = { id: string; title: string; slug: string; start_date: string; timezone: string | null; venue_name: string | null; city_primary: string | null; external_ticket_url: string | null; listing_series_id: string | null; category_id: string | null }
const cols = 'id, title, slug, start_date, timezone, venue_name, city_primary, external_ticket_url, listing_series_id, category_id'
const nowIso = new Date().toISOString()
const { data: critical } = await db.from('events').select(cols).in('title', ONLY ? [ONLY] : CRITICAL_TITLES).eq('status', 'published').gt('start_date', nowIso).order('start_date')
const sample: Row[] = []
for (const city of ONLY ? [] : ['melbourne', 'geelong', 'ballarat', 'bendigo']) {
  const { data } = await db.from('events').select(cols).eq('status', 'published').eq('city_primary', city).gt('start_date', nowIso).not('listing_series_id', 'is', null).order('start_date').limit(200)
  const rows = (data ?? []) as Row[]
  // A spread across each city's coming nights, not the first few: every k-th night, and four times as many as are
  // judged, so the fresh sample reaches its count of JUDGED nights past any unverifiable ones (the CONTROLLER's 16:20).
  const want = Math.ceil(SAMPLE / 4)
  const step = Math.max(1, Math.floor(rows.length / (want * 4)))
  for (let i = 0; i < rows.length && sample.filter((s) => s.city_primary === city).length < want * 4; i += step) sample.push(rows[i])
}
const WANT_PER_CITY = Math.ceil(SAMPLE / 4)
const criticalIds = new Set(((critical ?? []) as Row[]).map((c) => c.id))
const judgedIn = new Map<string, number>()
const nights = [...((critical ?? []) as Row[]), ...sample.filter((s) => !(critical ?? []).some((c) => (c as Row).id === s.id))]

/* Each night's source page: the page its listing check names (the series' own record). */
const seriesIds = [...new Set(nights.map((n) => n.listing_series_id).filter(Boolean))] as string[]
const { data: checks } = await records.from('listing_checks').select('series_id, source_url, source_date').in('series_id', seriesIds)
/* Every page a series' checks name, newest first: a night is judged against each until one states its start (Geelong
   Regional Libraries' Baby time 11:30 was re-pointed by the two hour merge to the 10:30 session's page, 5 November). */
const sourcesOf = new Map<string, string[]>()
for (const c of (checks ?? []).sort((a, b) => String(b.source_date).localeCompare(String(a.source_date)))) {
  const list = sourcesOf.get(c.series_id as string) ?? []
  if (/^https?:\/\//.test(String(c.source_url)) && !list.includes(c.source_url as string)) list.push(c.source_url as string)
  sourcesOf.set(c.series_id as string, list)
}

/* PRICE AND CATEGORY (src/lib/listings/verifier-fields.ts): each night's booking links and its category's name, read once,
   so the live page's offered price and hero category are judged against what is stored. */
const nightIds = nights.map((n) => n.id)
const { data: linkRows } = await records.from('event_booking_links').select(`event_id, ${BOOKING_LINK_COLUMNS}`).in('event_id', nightIds).order('position')
const linksOf = new Map<string, BookingLink[]>()
for (const r of (linkRows ?? []) as unknown as (BookingLinkRow & { event_id: string })[]) linksOf.set(r.event_id, [...(linksOf.get(r.event_id) ?? []), toBookingLink(r)])
const catIds = [...new Set(nights.map((n) => n.category_id).filter(Boolean))] as string[]
const { data: cats } = await records.from('event_categories').select('id, name').in('id', catIds)
const catName = new Map(((cats ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]))
const dollars = (c: number | null) => (c === null ? 'no price' : `$${(c / 100).toFixed(2)}`)

const lastHit = new Map<string, number>()
const stopped = new Set<string>()
const robots = new Map<string, { status: number | null; body: string }>()
async function polite(u: string): Promise<{ status: number | null; body: string; pdf: boolean }> {
  /* A planted page (TEST only, refused for production above) is answered as given, and nothing else is read. */
  if (TARGET === 'test' && Object.keys(PLANTED).length > 0) {
    const p = PLANTED[u]
    return p ? { status: p.status, body: p.body, pdf: false } : { status: null, body: '', pdf: false }
  }
  const host = new URL(u).host
  if (stopped.has(host)) return { status: null, body: '', pdf: false }
  const wait = (lastHit.get(host) ?? 0) + 1000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastHit.set(host, Date.now())
  try {
    const res = await fetch(u, { headers: { 'User-Agent': COLLECTOR_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(25000) })
    if (res.status === 403 || res.status === 429) stopped.add(host)
    // A PDF is named as one, never read as text: no reader of ours parses a PDF programme.
    const pdf = /pdf/i.test(res.headers.get('content-type') ?? '') || /\.pdf$/i.test(new URL(u).pathname)
    return { status: res.status, body: res.ok && !pdf ? await res.text() : '', pdf }
  } catch {
    return { status: null, body: '', pdf: false }
  }
}
const sameMinute = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000
const localClock = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).replace(/\u202f/g, ' ')
const timeOnly = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).replace(/\u202f/g, ' ').toLowerCase()

/* THE PAGE'S OWN WORDS, dated or a weekly timetable: src/lib/listings/stated-words.ts, with its cases in
   tests/unit/listings/stated-words.test.ts (North Central Goldfields Regional Library's storytimes, 5 November). */


type Result = { title: string; city: string; stored: string; source: string; live390: string; live1440: string; price: string; category: string; verdict: 'PASS' | 'FAIL' | 'NOT JUDGED' | 'UNVERIFIABLE'; why: string; sourceUrl: string; critical: boolean }
const results: Result[] = []
const browser = await chromium.launch()
async function judgeNight(n: Row): Promise<void> {
  const zone = n.timezone ?? 'Australia/Melbourne'
  const stored = localClock(n.start_date, zone)
  const pages = n.listing_series_id ? sourcesOf.get(n.listing_series_id) ?? [] : []
  let src = pages[0] ?? ''
  let source = 'no source page on record'
  let sourceOk: boolean | null = null
  const disagree: string[] = []
  for (const candidate of pages.slice(0, 4)) {
    const u = new URL(candidate)
    let r = robots.get(u.origin)
    if (!r) {
      r = await polite(`${u.origin}/robots.txt`)
      robots.set(u.origin, r)
    }
    if (robotsVerdict(r.status, r.body, u.pathname + u.search) === 'disallowed') {
      source = 'robots.txt disallows a re-read'
      continue
    }
    const page = await polite(candidate)
    const rule = pageRuleFor(candidate)
    const found = page.body ? (rule ? rule.read(page.body, candidate) : eventsFromBody(page.body, candidate)) : []
    // This night on the page: its title once case, accents and punctuation are set aside (fold), or anything the page
    // states at exactly its start, or the page's only night.
    const mine = found.filter((f) => fold(f.title) === fold(n.title) || sameMinute(f.startsAt, n.start_date) || found.length === 1)
    /* The page's words are asked whenever no night it carries sits at this one's minute, not only when it carries none: a
       weekly listing's page often carries one Event at its FIRST date, and run 42251873336 (7 November 2026, 03:25, the
       first on ubuntu-24.04) failed Here & Now Lounge's Sunday Improv, stored Sun 8 Nov 6:30 pm, against that page's 'Sun 11
       Oct', though its words state Sun 8 and Sun 22 November at 6:30 pm (the accuracy sweep read both). */
    const ask = asksTheWords(mine, n.start_date)
    const words = page.status === 200 && ask ? statedInWords(page.body, n.start_date, zone) : null
    const weekly = page.status === 200 && ask && words !== 'both' ? statedWeekly(page.body, n.title, n.venue_name ?? '', n.start_date, zone) : null
    if (page.pdf) source = PDF_SOURCE
    else if (page.status !== 200) source = `the page answered ${page.status ?? 'nothing'}`
    else if (words === 'both') {
      // No reader of ours parses this page, but its own visible words state the night's date and time together.
      sourceOk = true
      src = candidate
      source = `${localClock(n.start_date, zone)} (in the page's words)`
      break
    } else if (weekly === 'weekly') {
      // A weekly timetable: under the session's own heading, its venue's line states this weekday and this start.
      sourceOk = true
      src = candidate
      source = `${new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'long' }).format(new Date(n.start_date))}s ${timeOnly(n.start_date, zone)} at ${n.venue_name} (the page's weekly timetable)`
      break
    } else if (weekly === 'outside_term') source = OUTSIDE_TERM
    else if (words === 'date') source = 'the page states the date in words but not this time'
    else if (mine.length === 0) source = 'the page does not state this night'
    else if (mine.every((f) => f.timeStatus === 'date_only')) source = 'the page states a date with no time'
    else if (mine.some((f) => sameMinute(f.startsAt, n.start_date))) {
      sourceOk = true
      src = candidate
      source = localClock(n.start_date, zone)
      break
    } else disagree.push(`${mine.map((f) => localClock(f.startsAt, zone)).join(', ')} (${candidate.split('/').pop()})`)
  }
  if (sourceOk !== true && disagree.length > 0) {
    sourceOk = false
    source = `states ${disagree.join('; ')}`
  }
  const live: Record<number, { ok: boolean; text: string }> = {}
  let priceOk = true
  let priceText = 'not read'
  let categoryOk = true
  let categoryText = 'not read'
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } })
    try {
      await page.goto(`${BASE}/events/${n.slug}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      const html = await page.content()
      if (width === 390) {
        const links = linksOf.get(n.id) ?? []
        const expected = links.length ? expectedOfferCents(links, new Date()) : null
        const offered = liveOfferCents(html)
        priceOk = links.length === 0 || priceAgrees(expected, offered)
        priceText = links.length === 0 ? 'no booking link, not compared' : `${dollars(expected)} stored, ${dollars(offered)} live`
        const category = n.category_id ? catName.get(n.category_id) ?? null : null
        const shownCategory = categoryShown(await page.locator('main').innerText().catch(() => ''), n.title, category)
        categoryOk = shownCategory !== false
        categoryText = shownCategory === null ? 'none stored' : `${category} ${shownCategory ? 'shown' : 'NOT shown'}`
      }
      const ldStarts = [...html.matchAll(/"startDate"\s*:\s*"([^"]+)"/g)].map((m) => m[1])
      // '7:30 pm' and '7:30pm' are one time: the walk in pages write it without the space.
      const shown = (await page.locator('body').innerText()).replace(/\u202f/g, ' ').toLowerCase().replace(/\s+(am|pm)\b/g, '$1')
      const ldOk = ldStarts.some((s) => sameMinute(s, n.start_date))
      // '10:00am' and '10am' are one time too: on the hour the walk in pages drop the minutes.
      const t = timeOnly(n.start_date, zone).replace(/\s+(am|pm)$/, '$1')
      const timeOk = shown.includes(t) || (/:00(am|pm)$/.test(t) && new RegExp(`(^|[^\\d:])${t.replace(':00', '')}`).test(shown))
      live[width] = { ok: ldOk && timeOk, text: `${ldOk ? 'schema right' : `schema ${ldStarts[0] ?? 'missing'}`}, ${timeOk ? `shows ${timeOnly(n.start_date, zone)}` : 'time not shown'}` }
    } catch (err) {
      live[width] = { ok: false, text: `did not load: ${err instanceof Error ? err.message.slice(0, 60) : String(err)}` }
    } finally {
      await page.close()
    }
  }
  const liveOk = live[390].ok && live[1440].ok && priceOk && categoryOk
  /* The verdict, one rule: src/lib/listings/verifier-verdict.ts (UNVERIFIABLE with its reason, a page that gave no answer
     among them; a source going quiet is never read as a cancellation; each is listed for a person's re-check). */
  const verdict: Result['verdict'] = verifierVerdict({ sourceOk, liveOk, source })
  const why =
    sourceOk === false
      ? SOURCE_DISAGREES
      : !priceOk
        ? 'the live price disagrees with the stored links'
        : !categoryOk
          ? 'the live page does not show the stored category'
          : !liveOk
            ? 'the live page disagrees with the stored row'
            : sourceOk === null
              ? source
              : 'source, stored and live agree'
  results.push({ title: n.title, city: n.city_primary ?? '', stored, source, live390: live[390].text, live1440: live[1440].text, price: priceText, category: categoryText, verdict, why, sourceUrl: src, critical: criticalIds.has(n.id) })
  if (!criticalIds.has(n.id) && (verdict === 'PASS' || verdict === 'FAIL')) judgedIn.set(n.city_primary ?? '', (judgedIn.get(n.city_primary ?? '') ?? 0) + 1)
  console.log(`${verdict.padEnd(10)} ${n.title.slice(0, 44).padEnd(44)} stored ${stored} | source: ${source} | 390: ${live[390].text} | 1440: ${live[1440].text} | price: ${priceText} | category: ${categoryText}`)
}
/* First each city to its count of judged nights; then, where a city's coming nights run out of judgeable ones (most of
   Bendigo's are library sessions), the other cities make up the sample, a night from each in turn, so the bar always
   counts SAMPLE judged fresh nights (the CONTROLLER's 16:20) or says it could not. */
const position = new Map<string, number>()
for (const city of ['melbourne', 'geelong', 'ballarat', 'bendigo']) sample.filter((s) => s.city_primary === city).forEach((s, i) => position.set(s.id, i))
const left: Row[] = []
for (const n of nights) {
  if (!criticalIds.has(n.id) && (judgedIn.get(n.city_primary ?? '') ?? 0) >= WANT_PER_CITY) left.push(n)
  else await judgeNight(n)
}
for (const n of left.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0))) {
  if ([...judgedIn.values()].reduce((a, b) => a + b, 0) >= SAMPLE) break
  await judgeNight(n)
}
await browser.close()

const count = (v: Result['verdict']) => results.filter((r) => r.verdict === v).length
/* THE BASELINE BAR, THIS RUN'S HALF (the CONTROLLER's 16:20: every fixed case and a fresh sample of at least 20 all PASS, on
   two consecutive runs): every critical case PASS, and at least SAMPLE fresh nights judged, every one PASS. */
const criticalAll = results.filter((r) => r.critical)
const freshJudged = results.filter((r) => !r.critical && (r.verdict === 'PASS' || r.verdict === 'FAIL'))
const barMet = criticalAll.length > 0 && criticalAll.every((r) => r.verdict === 'PASS') && freshJudged.length >= SAMPLE && freshJudged.every((r) => r.verdict === 'PASS')
const baselineLine = `baseline bar this run: ${barMet ? 'MET' : 'NOT MET'} (critical ${criticalAll.filter((r) => r.verdict === 'PASS').length} of ${criticalAll.length} PASS; fresh judged ${freshJudged.length}, ${freshJudged.filter((r) => r.verdict === 'PASS').length} PASS)`
mkdirSync(OUT, { recursive: true })
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
const md = [
  `# Engine verifier, ${new Date().toISOString()}`,
  '',
  `${results.length} nights (${results.filter((r) => r.critical).length} fixed critical cases, ${results.filter((r) => !r.critical).length} fresh across the four cities): ${count('PASS')} PASS, ${count('FAIL')} FAIL, ${count('NOT JUDGED')} NOT JUDGED, ${count('UNVERIFIABLE')} UNVERIFIABLE.`,
  '',
  baselineLine,
  '',
  '| Verdict | Night | City | Stored (local) | Source now | Live 390 | Live 1440 | Price | Category | Why |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.verdict} | ${r.title} | ${r.city} | ${r.stored} | ${r.source} | ${r.live390} | ${r.live1440} | ${r.price} | ${r.category} | ${r.why} |`),
].join('\n')
writeFileSync(`${OUT}/verifier-${stamp}.md`, md + '\n')
writeFileSync(`${OUT}/verifier-${stamp}.json`, JSON.stringify(results, null, 1))
console.log(`[engine-verifier] ${count('PASS')} PASS, ${count('FAIL')} FAIL, ${count('NOT JUDGED')} NOT JUDGED, ${count('UNVERIFIABLE')} UNVERIFIABLE; ${baselineLine}; ${OUT}/verifier-${stamp}.md`)

/*
 * --enforce (LAW 19 section 4.3 and 7.2: 'that source's publication flag switches off', automatically, by a failed check).
 * A source whose night the check finds wrong against its own page is taken off automatic reading (listing_sources
 * collection 'read' to 'ask', the same switch the 5 November containment used): its published nights stay and are not
 * deleted; nothing new from it is published until a person restores it. A night that fails only on the live page (the
 * site, not the source) switches no source off. Logged; the run exits 1, so the job that ran it fails and says so.
 */
if (args.includes('--enforce')) {
  /* The switch, one rule: src/lib/listings/verifier-verdict.ts sourcesToSwitchOff (tests/unit/listings/verifier-switch-off.test.ts). */
  const { data: rows } = await records.from('listing_sources').select('id, name, page_url, collection, notes').eq('collection', 'read')
  const off = new Set(sourcesToSwitchOff(results, (rows ?? []) as { id: string; page_url: string; collection: string }[]))
  for (const s of (rows ?? []).filter((r) => off.has(r.id as string))) {
    const note = ` | Switched off ${new Date().toISOString()} by the engine verifier (LAW 19 4.3): a night it published disagrees with its own page (${OUT}/verifier-${stamp}.md).`
    const { error } = await records.from('listing_sources').update({ collection: 'ask', notes: `${(s.notes as string | null) ?? ''}${note}` }).eq('id', s.id).eq('collection', 'read')
    const line = `${new Date().toISOString()} | engine-verifier --enforce | ${TARGET} | ${error ? `FAILED to switch off ${s.name}: ${error.message}` : `${s.name} switched off (collection read -> ask)`}; evidence ${OUT}/verifier-${stamp}.md`
    console.log(`[engine-verifier] ${line}`)
    if (TARGET !== 'production') continue
    try {
      appendFileSync('C:/dev/PRODUCTION-WRITES.txt', line + '\n')
    } catch {
      // On a CI runner the write log is the job's own output, printed above.
    }
  }
}
/*
 * EVERY OPEN HOLD CARRIES ITS NEXT ACTION (Lawal, 7 November 2026; the CONTROLLER's 16:55 (1)): a hold with no next source or
 * time, or one whose next check is more than a day overdue, is red by name (src/lib/listings/hold-walk.ts holdsVerdict). While
 * migration 20261107170001 is not on the target, its columns are missing and the check says NOT JUDGED, never a pass.
 */
const { holdsVerdict } = pick((await import('@/lib/listings/hold-walk')) as typeof import('@/lib/listings/hold-walk'))
const { data: openHolds, error: holdsError } = await records
  .from('listing_holds')
  .select('id, next_source, next_check_at, event:events(title)')
  .is('released_at', null)
let holdsRed = 0
if (holdsError) {
  console.log(`[engine-verifier] open holds: NOT JUDGED (${holdsError.message}; migration 20261107170001 may not be on ${TARGET} yet)`)
} else {
  const red = holdsVerdict(
    (openHolds ?? []).map((h) => {
      const ev = (Array.isArray(h.event) ? h.event[0] : h.event) as { title?: string } | null
      return { id: h.id as string, title: ev?.title ?? '(no night)', nextSource: h.next_source as string | null, nextCheckAt: h.next_check_at as string | null }
    }),
    new Date(),
  )
  holdsRed = red.length
  console.log(`[engine-verifier] open holds: ${(openHolds ?? []).length}, ${red.length} red`)
  for (const r of red) console.log(`[engine-verifier] FAIL open hold ${r.id} (${r.title}): ${r.why}`)
}
process.exitCode = count('FAIL') > 0 || holdsRed > 0 ? 1 : 0
