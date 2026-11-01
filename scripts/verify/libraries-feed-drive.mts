/**
 * THE LIBRARIES FEED IS READ AND ITS NIGHTS REACH REVIEW (the CONTROLLER's 17:04 of 1 November 2026), on TEST, never
 * production. The collection run's own code and real store, against the TEST database; the Geelong Regional Libraries
 * source alone is offered to the run, made due now; the live calendar feed is read once with the collector's own agent
 * (robots.txt first, stop on 403 or 429). Nothing is published: every night lands waiting for a person at
 * /admin/collected. Read only on the library's side; on TEST it writes candidates and one run row, as the cron does.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/libraries-feed-drive.mts
 *
 * Each check prints PASS or FAIL; the last line is the verdict.
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'
import type * as RunModule from '@/lib/listings/collect-run'
import type * as StoreModule from '@/lib/listings/collect-store'

const runMod = (await import('@/lib/listings/collect-run')) as typeof RunModule & { default?: typeof RunModule }
const storeMod = (await import('@/lib/listings/collect-store')) as typeof StoreModule & { default?: typeof StoreModule }
const runCollection = runMod.runCollection ?? runMod.default!.runCollection
const collectionStore = storeMod.collectionStore ?? storeMod.default!.collectionStore

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('libraries-feed-drive runs on TEST only')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })
const NAME = 'Geelong Regional Libraries'

let failures = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
}

const { data: src } = await db.from('listing_sources').select('id').eq('name', NAME).single()
const sourceId = src!.id as string
const countBy = async () => {
  const { data } = await db.from('listing_candidates').select('status, kind, change').eq('source_id', sourceId)
  const by: Record<string, number> = {}
  for (const r of data ?? []) by[`${r.status}/${r.kind}/${r.change ?? '-'}`] = (by[`${r.status}/${r.kind}/${r.change ?? '-'}`] ?? 0) + 1
  return { by, total: (data ?? []).length }
}
const before = await countBy()
console.log(`before: ${before.total} candidate(s) ${JSON.stringify(before.by)}`)

const real = collectionStore(db)
const store: typeof real = {
  ...real,
  async sources() {
    const all = await real.sources()
    return all.filter((s) => s.id === sourceId).map((s) => ({ ...s, lastCheckedAt: null }))
  },
}
const started = new Date()
const result = await runCollection(store, fetch, started, started.getTime() + 240_000)
const mine = result.sources.find((s) => s.sourceId === sourceId)
console.log(`run: ${mine?.outcome ?? 'not read'}`)

check('the feed was read, and only the Libraries source', result.read === 1 && !!mine && /^read:/.test(mine.outcome), mine?.outcome)
const { data: run } = await db
  .from('listing_source_runs')
  .select('ran_at, http_status, found, landed, queued, accepted_by_rule, succeeded')
  .eq('source_id', sourceId)
  .gte('ran_at', started.toISOString())
  .order('ran_at', { ascending: false })
  .limit(1)
  .maybeSingle()
check('the run is logged with the feed answering 200 and nights found', !!run && run.succeeded && run.http_status === 200 && run.found > 0, JSON.stringify(run))
check('nothing accepted without a person', !!run && run.accepted_by_rule === 0 && (mine?.acceptedByRule ?? 0) === 0)

const after = await countBy()
console.log(`after: ${after.total} candidate(s) ${JSON.stringify(after.by)}`)
const { data: fresh } = await db
  .from('listing_candidates')
  .select('title, starts_at, venue_name, venue_address, status, kind, change, confidence, reasons, page_url')
  .eq('source_id', sourceId)
  .eq('status', 'waiting')
  .gt('starts_at', started.toISOString())
  .order('starts_at')
check('upcoming nights wait for a person', (fresh ?? []).length > 0, `${(fresh ?? []).length} upcoming waiting`)
const otherCity = (fresh ?? []).filter((c) => c.change === 'venue_changed')
check('no library night is judged a moved venue against another night (judge fix 993d847d)', otherCity.length === 0, `${otherCity.length} venue_changed`)
const noPage = (fresh ?? []).filter((c) => !c.page_url)
check('every waiting night cites its own page on the library site', noPage.length === 0, `${noPage.length} without a page`)
for (const c of (fresh ?? []).slice(0, 5)) console.log(`  ${c.starts_at} ${c.title} @ ${c.venue_name} | ${c.confidence} | ${c.page_url}`)

const acceptedBefore = Object.entries(before.by).filter(([k]) => k.startsWith('accepted/')).reduce((n, [, v]) => n + v, 0)
const acceptedAfter = Object.entries(after.by).filter(([k]) => k.startsWith('accepted/')).reduce((n, [, v]) => n + v, 0)
check('nothing was accepted or published by the run', acceptedAfter === acceptedBefore, `${acceptedBefore} before, ${acceptedAfter} after`)

console.log(failures === 0 ? 'LIBRARIES FEED DRIVE PASSED' : `LIBRARIES FEED DRIVE FAILED: ${failures} check(s)`)
process.exit(failures === 0 ? 0 : 1)
