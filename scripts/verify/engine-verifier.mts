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
import { mkdirSync, writeFileSync } from 'node:fs'
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

const REF = 'gndnldyfudbytbboxesk' // production, read only: this script writes nothing to any database
const BASE = 'https://www.eventlinqs.com.au'
const OUT = 'C:/dev/EVIDENCE/ENGINE-P0'
const args = process.argv.slice(2)
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
  console.error('[engine-verifier] REFUSED: the production keys could not be read')
  process.exit(1)
}
// The events through the public (anon) key, exactly what a visitor's page reads; the listing checks (not public) through
// the service key, SELECT only: nothing in this script writes.
const db = createClient(`https://${REF}.supabase.co`, anon, { auth: { persistSession: false } })
const records = createClient(`https://${REF}.supabase.co`, service, { auth: { persistSession: false } })

type Row = { id: string; title: string; slug: string; start_date: string; timezone: string | null; venue_name: string | null; city_primary: string | null; external_ticket_url: string | null; listing_series_id: string | null }
const cols = 'id, title, slug, start_date, timezone, venue_name, city_primary, external_ticket_url, listing_series_id'
const nowIso = new Date().toISOString()
const { data: critical } = await db.from('events').select(cols).in('title', CRITICAL_TITLES).eq('status', 'published').gt('start_date', nowIso).order('start_date')
const sample: Row[] = []
for (const city of ['melbourne', 'geelong', 'ballarat', 'bendigo']) {
  const { data } = await db.from('events').select(cols).eq('status', 'published').eq('city_primary', city).gt('start_date', nowIso).not('listing_series_id', 'is', null).order('start_date').limit(200)
  const rows = (data ?? []) as Row[]
  // A spread across each city's coming nights, not the first few: every k-th night.
  const want = Math.ceil(SAMPLE / 4)
  const step = Math.max(1, Math.floor(rows.length / want))
  for (let i = 0; i < rows.length && sample.filter((s) => s.city_primary === city).length < want; i += step) sample.push(rows[i])
}
const nights = [...((critical ?? []) as Row[]), ...sample.filter((s) => !(critical ?? []).some((c) => (c as Row).id === s.id))]

/* Each night's source page: the page its listing check names (the series' own record). */
const seriesIds = [...new Set(nights.map((n) => n.listing_series_id).filter(Boolean))] as string[]
const { data: checks } = await records.from('listing_checks').select('series_id, source_url, source_date').in('series_id', seriesIds)
const sourceOf = new Map<string, string>()
for (const c of (checks ?? []).sort((a, b) => String(b.source_date).localeCompare(String(a.source_date)))) {
  if (!sourceOf.has(c.series_id as string) && /^https?:\/\//.test(String(c.source_url))) sourceOf.set(c.series_id as string, c.source_url as string)
}

const lastHit = new Map<string, number>()
const stopped = new Set<string>()
const robots = new Map<string, { status: number | null; body: string }>()
async function polite(u: string): Promise<{ status: number | null; body: string }> {
  const host = new URL(u).host
  if (stopped.has(host)) return { status: null, body: '' }
  const wait = (lastHit.get(host) ?? 0) + 1000 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastHit.set(host, Date.now())
  try {
    const res = await fetch(u, { headers: { 'User-Agent': COLLECTOR_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(25000) })
    if (res.status === 403 || res.status === 429) stopped.add(host)
    return { status: res.status, body: res.ok ? await res.text() : '' }
  } catch {
    return { status: null, body: '' }
  }
}
const sameMinute = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000
const localClock = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).replace(/\u202f/g, ' ')
const timeOnly = (iso: string, zone: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).replace(/\u202f/g, ' ').toLowerCase()

type Result = { title: string; city: string; stored: string; source: string; live390: string; live1440: string; verdict: 'PASS' | 'FAIL' | 'NOT JUDGED'; why: string; sourceUrl: string }
const results: Result[] = []
const browser = await chromium.launch()
for (const n of nights) {
  const zone = n.timezone ?? 'Australia/Melbourne'
  const stored = localClock(n.start_date, zone)
  const src = n.listing_series_id ? sourceOf.get(n.listing_series_id) ?? '' : ''
  let source = 'no source page on record'
  let sourceOk: boolean | null = null
  if (src) {
    const u = new URL(src)
    let r = robots.get(u.origin)
    if (!r) {
      r = await polite(`${u.origin}/robots.txt`)
      robots.set(u.origin, r)
    }
    if (robotsVerdict(r.status, r.body, u.pathname + u.search) === 'disallowed') source = 'robots.txt disallows a re-read'
    else {
      const page = await polite(src)
      const rule = pageRuleFor(src)
      const found = page.body ? (rule ? rule.read(page.body, src) : eventsFromBody(page.body, src)) : []
      const mine = found.filter((f) => f.title.trim().toLowerCase() === n.title.trim().toLowerCase() || found.length === 1)
      if (page.status !== 200) source = `the page answered ${page.status ?? 'nothing'}`
      else if (mine.length === 0) source = 'the page no longer states this night'
      else if (mine.every((f) => f.timeStatus === 'date_only')) source = 'the page states a date with no time'
      else {
        sourceOk = mine.some((f) => sameMinute(f.startsAt, n.start_date))
        source = sourceOk ? localClock(n.start_date, zone) : `states ${mine.map((f) => localClock(f.startsAt, zone)).join(', ')}`
      }
    }
  }
  const live: Record<number, { ok: boolean; text: string }> = {}
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } })
    try {
      await page.goto(`${BASE}/events/${n.slug}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
      const html = await page.content()
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
  const liveOk = live[390].ok && live[1440].ok
  const verdict: Result['verdict'] = sourceOk === false || !liveOk ? 'FAIL' : sourceOk === null ? 'NOT JUDGED' : 'PASS'
  const why = sourceOk === false ? 'the source states another time' : !liveOk ? 'the live page disagrees with the stored row' : sourceOk === null ? source : 'source, stored and live agree'
  results.push({ title: n.title, city: n.city_primary ?? '', stored, source, live390: live[390].text, live1440: live[1440].text, verdict, why, sourceUrl: src })
  console.log(`${verdict.padEnd(10)} ${n.title.slice(0, 44).padEnd(44)} stored ${stored} | source: ${source} | 390: ${live[390].text} | 1440: ${live[1440].text}`)
}
await browser.close()

const count = (v: Result['verdict']) => results.filter((r) => r.verdict === v).length
mkdirSync(OUT, { recursive: true })
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
const md = [
  `# Engine verifier, ${new Date().toISOString()}`,
  '',
  `${results.length} nights (${(critical ?? []).length} fixed critical cases, ${results.length - (critical ?? []).length} fresh across the four cities): ${count('PASS')} PASS, ${count('FAIL')} FAIL, ${count('NOT JUDGED')} NOT JUDGED.`,
  '',
  '| Verdict | Night | City | Stored (local) | Source now | Live 390 | Live 1440 | Why |',
  '|---|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.verdict} | ${r.title} | ${r.city} | ${r.stored} | ${r.source} | ${r.live390} | ${r.live1440} | ${r.why} |`),
].join('\n')
writeFileSync(`${OUT}/verifier-${stamp}.md`, md + '\n')
writeFileSync(`${OUT}/verifier-${stamp}.json`, JSON.stringify(results, null, 1))
console.log(`[engine-verifier] ${count('PASS')} PASS, ${count('FAIL')} FAIL, ${count('NOT JUDGED')} NOT JUDGED; ${OUT}/verifier-${stamp}.md`)
process.exitCode = count('FAIL') > 0 ? 1 : 0
