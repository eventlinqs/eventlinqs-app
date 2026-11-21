/**
 * SEARCH REACH, GUARD A (the PM's order of 22 November 2026, 05:25): every published, not ended event is found by the
 * three names its page shows (title, shown organiser, venue), its season in the top three (the first page where the
 * name holds more than three seasons). Every judgement is src/lib/search/reach.ts; this file only reads and asks.
 *
 * TODAY'S ADAPTER asks the public results page (BASE/events?q=...) as a visitor does, so it judges the deployed code
 * path on www or on a preview. When the one search engine lands, the adapter becomes its own function (the same
 * engine every surface calls) and the guard runs in CI against TEST and hourly on production.
 *
 * Its requests say who they are (user agent 'EventLinqs-QA search-reach'), so the search log can leave them out.
 *
 *   node --import ./scripts/lib/src-alias-loader.mjs scripts/verify/search-reach.mjs \
 *     --base https://www.eventlinqs.com.au [--only <text in title or slug>] [--out <file.json>] [--concurrency 3]
 *
 * Reads the events through the public REST API with the public key (NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY), so it sees exactly what a visitor may. Exit 0: every event found; 1: any miss;
 * 2: it could not read (fails closed).
 */
import { writeFileSync } from 'node:fs'
import { judgeReach, reachQueries, resultSlugs, seasonKey, seasonsByName } from '../../src/lib/search/reach.ts'

const args = process.argv.slice(2)
const flag = (name, dflt = null) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt
}
const BASE = (flag('base') || '').replace(/\/$/, '')
const ONLY = (flag('only') || '').toLowerCase()
const OUT = flag('out')
const CONCURRENCY = Math.max(1, Math.min(6, Number(flag('concurrency', '3')) || 3))
const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const UA = 'EventLinqs-QA search-reach (+https://www.eventlinqs.com.au)'

if (!BASE || !URL_ || !KEY) {
  console.error('REFUSED: --base, NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required')
  process.exit(2)
}

async function readLiveEvents() {
  const now = new Date().toISOString()
  const select = 'id,slug,title,venue_name,listing_source,metadata,start_date,organisation:organisations(name,slug,short_name)'
  const rows = []
  for (let from = 0; ; from += 500) {
    const u = `${URL_}/rest/v1/events?select=${encodeURIComponent(select)}&status=eq.published&visibility=eq.public&end_date=gt.${encodeURIComponent(now)}&order=start_date.asc,id.asc`
    const r = await fetch(u, { headers: { apikey: KEY, authorization: `Bearer ${KEY}`, range: `${from}-${from + 499}`, 'range-unit': 'items' } })
    if (!r.ok) throw new Error(`the live events could not be read: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
    const page = await r.json()
    rows.push(...page)
    if (page.length < 500) break
  }
  return rows
}

async function search(q) {
  const r = await fetch(`${BASE}/events?q=${encodeURIComponent(q)}`, { headers: { 'user-agent': UA } })
  if (!r.ok) throw new Error(`search '${q}' answered HTTP ${r.status}`)
  return resultSlugs(await r.text())
}

let events
try {
  events = await readLiveEvents()
} catch (e) {
  console.error(String(e))
  process.exit(2)
}
const seasonOf = new Map(events.map((e) => [e.slug, seasonKey(e)]))
const counts = seasonsByName(events)
const judged = ONLY ? events.filter((e) => e.title.toLowerCase().includes(ONLY) || e.slug.includes(ONLY)) : events
const queries = [...new Set(judged.flatMap((e) => reachQueries(e).map((q) => q.q)))]
console.log(`${events.length} live events read; ${judged.length} judged; ${queries.length} distinct queries on ${BASE}`)

const answers = new Map()
const failures = []
let next = 0
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < queries.length) {
    const q = queries[next++]
    try {
      answers.set(q, await search(q))
    } catch (e) {
      failures.push(String(e))
    }
  }
}))
if (failures.length > 0) {
  console.error(`COULD NOT ASK ${failures.length} queries (fails closed): ${failures.slice(0, 3).join('; ')}`)
  process.exit(2)
}

const verdicts = judged.flatMap((e) => reachQueries(e).map((q) => judgeReach(e, q, answers.get(q.q) ?? [], seasonOf, counts)))
const misses = verdicts.filter((v) => !v.found)
const byKind = (k) => ({ judged: verdicts.filter((v) => v.kind === k).length, missed: misses.filter((v) => v.kind === k).length })
const summary = {
  base: BASE,
  read_at: new Date().toISOString(),
  events: events.length,
  judged: judged.length,
  queries: queries.length,
  crowded_names: [...counts].filter(([, n]) => n > 3).length,
  title: byKind('title'),
  organiser: byKind('organiser'),
  venue: byKind('venue'),
  misses: misses.map((v) => ({ kind: v.kind, q: v.q, slug: v.slug, needed: v.needed, at: v.at })),
}
if (OUT) writeFileSync(OUT, JSON.stringify(summary, null, 1))
for (const v of misses.slice(0, 40)) console.log(`MISS ${v.kind} '${v.q}' ${v.slug} (needed ${v.needed}, ${v.at ? `at ${v.at}` : 'not found'})`)
console.log(JSON.stringify({ title: summary.title, organiser: summary.organiser, venue: summary.venue, crowded_names: summary.crowded_names }))
console.log(misses.length === 0 ? 'REACH PASS: every judged event found' : `REACH FAIL: ${misses.length} of ${verdicts.length} judgements missed`)
process.exit(misses.length === 0 ? 0 : 1)
