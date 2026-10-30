/**
 * DEMONSTRATION 18 OF THE SUPREME SPECIFICATION ON TEST: 'A failed job is logged and recoverable.' The job is the daily
 * collection run (src/app/api/cron/collection-run), its real run and store against the TEST database (never
 * production), the pages served by a stand in fetcher so no outside site is asked anything.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/failed-job-recovers-drive.mts
 *
 * One bp- weekly source whose page answers 503 on three daily runs, then 200 on the fourth. Each failure is logged
 * (listing_source_runs, with its outcome) and the source stays due the next day (dueSources: a failed source is read
 * again at the daily pace); after three failures in a row /admin/today's own rule lists it for the founder; on the
 * fourth day the read succeeds, its night lands for review, and the source leaves that list. Every row it made is
 * removed. Each check prints PASS or FAIL; the last line is the verdict.
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'
import type { Fetcher } from '@/lib/listings/collect-run'
import type * as RunModule from '@/lib/listings/collect-run'
import type * as StoreModule from '@/lib/listings/collect-store'
import type * as TodayMathModule from '@/lib/admin/today-math'

/* src is CommonJS to tsx; read each module's exports whichever way the loader hands them over. */
const runMod = (await import('@/lib/listings/collect-run')) as typeof RunModule & { default?: typeof RunModule }
const storeMod = (await import('@/lib/listings/collect-store')) as typeof StoreModule & { default?: typeof StoreModule }
const mathMod = (await import('@/lib/admin/today-math')) as typeof TodayMathModule & { default?: typeof TodayMathModule }
const runCollection = runMod.runCollection ?? runMod.default!.runCollection
const collectionStore = storeMod.collectionStore ?? storeMod.default!.collectionStore
const failuresInARow = mathMod.failuresInARow ?? mathMod.default!.failuresInARow
const SOURCE_FAILING_AFTER = mathMod.SOURCE_FAILING_AFTER ?? mathMod.default!.SOURCE_FAILING_AFTER

assertNotProduction()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('failed-job-recovers-drive runs on TEST only')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })
const stamp = Date.now().toString(36)
let fails = 0
const check = (name: string, ok: boolean, seen: unknown) => {
  if (!ok) fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(seen)}`}`)
}

const DAY = 86_400_000
const page = `https://bp-${stamp}.example.com/whats-on`
const start = new Date(Date.now() + 9 * DAY)
start.setUTCHours(9, 0, 0, 0)
const html = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'MusicEvent',
  name: `Bp Recovery Night ${stamp}`,
  startDate: start.toISOString(),
  location: { name: `Bp Recovery Hall ${stamp}`, address: '1 Bp Street, Geelong' },
})}</script>`
let pageUp = false
const asked: string[] = []
const fetcher: Fetcher = async (u) => {
  asked.push(u)
  if (u.endsWith('/robots.txt')) return { status: 200, text: async () => 'User-agent: *\nDisallow: /private' }
  if (u === page) return pageUp ? { status: 200, text: async () => html } : { status: 503, text: async () => 'Service Unavailable' }
  return { status: 404, text: async () => '' }
}

const made: string[] = []
const today = new Date().toISOString().slice(0, 10)
try {
  const { data: src, error } = await db
    .from('listing_sources')
    .insert({
      name: `bp-recovery ${stamp}`, kind: 'venue', city_slug: 'geelong', page_url: page, collection: 'read', changes: 'weekly',
      terms_url: `https://bp-${stamp}.example.com/terms`, terms_quote: 'bp-recovery: a stand in terms line', terms_read_on: today,
      may_scrape: 'yes', may_scrape_quote: 'bp-recovery: a stand in line allowing the read', may_scrape_url: `https://bp-${stamp}.example.com/terms`, may_scrape_read_on: today,
      verification: 'verified', verified_on: today, permits_links: true,
    }, { defaultToNull: false })
    .select('id')
    .single()
  if (error) throw error
  made.push(src.id as string)

  const store = collectionStore(db)
  const ours = async () => (await store.sources()).filter((s) => made.includes(s.id))
  const runs = async () => {
    const { data, error: e } = await db.from('listing_source_runs').select('ran_at, succeeded, outcome').eq('source_id', made[0]).order('ran_at', { ascending: false })
    if (e) throw e
    return (data ?? []) as { ran_at: string; succeeded: boolean; outcome: string }[]
  }
  const day0 = new Date()

  for (let d = 0; d < 3; d += 1) {
    asked.length = 0
    await runCollection({ ...store, sources: ours }, fetcher, new Date(day0.getTime() + d * DAY))
    const r = await runs()
    check(`day ${d + 1}: the source is read (due again after yesterday's failure)`, asked.includes(page), asked)
    check(`day ${d + 1}: the failure is LOGGED with its reason`, r.length === d + 1 && r[0].succeeded === false && r[0].outcome === 'the page answered 503: nothing read', r[0])
  }
  const { data: s3 } = await db.from('listing_sources').select('last_outcome, last_success_at').eq('id', made[0]).single()
  check('after three failures the source records the outcome and no successful collection', s3?.last_outcome === 'the page answered 503: nothing read' && s3?.last_success_at === null, s3)
  const r3 = await runs()
  check(`after three failures in a row /admin/today's own rule lists it (failuresInARow >= ${SOURCE_FAILING_AFTER})`, failuresInARow(r3) >= SOURCE_FAILING_AFTER, r3.map((r) => r.succeeded))
  const { count: none } = await db.from('listing_candidates').select('id', { count: 'exact', head: true }).in('source_id', made)
  check('a failed read lands nothing', (none ?? 0) === 0, none)

  pageUp = true
  asked.length = 0
  const fourth = await runCollection({ ...store, sources: ours }, fetcher, new Date(day0.getTime() + 3 * DAY))
  const r4 = await runs()
  check('day 4: the page is back, the source is read and the read SUCCEEDS', asked.includes(page) && r4[0].succeeded === true, r4[0])
  check("day 4: its night lands for review", fourth.landed === 1, fourth)
  check("day 4: it leaves /admin/today's failing list (failuresInARow 0)", failuresInARow(r4) === 0, r4.map((r) => r.succeeded))
  const { data: s4 } = await db.from('listing_sources').select('last_success_at, last_checked_at').eq('id', made[0]).single()
  check('day 4: the source records its last successful collection', s4?.last_success_at !== null && s4?.last_success_at === s4?.last_checked_at, s4)
  check('the run log keeps all four days: three failed, one succeeded', r4.length === 4 && r4.filter((r) => !r.succeeded).length === 3, r4.map((r) => r.succeeded))
} catch (err) {
  fails += 1
  console.log(`FAIL the drive stopped: ${err instanceof Error ? err.message : JSON.stringify(err)}`)
} finally {
  if (made.length > 0) await db.from('listing_sources').delete().in('id', made)
  const { count: c } = await db.from('listing_candidates').select('id', { count: 'exact', head: true }).in('source_id', made)
  const { count: r } = await db.from('listing_source_runs').select('id', { count: 'exact', head: true }).in('source_id', made)
  check('every row it made is gone (source, its runs and its night)', (c ?? 0) === 0 && (r ?? 0) === 0, { candidates: c, runs: r })
  console.log(fails === 0 ? 'DRIVE PASSED' : `DRIVE FAILED (${fails})`)
  process.exit(fails === 0 ? 0 : 1)
}
