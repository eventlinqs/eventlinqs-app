/**
 * ITEM 19 ON TEST: the collection run's real store against the TEST database (never production), the pages served by
 * a stand in fetcher so no outside site is asked anything.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/collection-run-drive.mts
 *
 * It registers two bp- sources (one whose terms allow reading, one 'ask'), runs the week, reads back what landed,
 * runs again (nothing new lands, the review state is kept), checks the database's refusals, and removes every row it
 * made. Each check prints PASS or FAIL; the last line is the verdict.
 */
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import { createClient } from '@supabase/supabase-js'
import type { Fetcher } from '@/lib/listings/collect-run'
import type * as RunModule from '@/lib/listings/collect-run'
import type * as StoreModule from '@/lib/listings/collect-store'

/* src is CommonJS to tsx; read each module's exports whichever way the loader hands them over. */
const runMod = (await import('@/lib/listings/collect-run')) as typeof RunModule & { default?: typeof RunModule }
const storeMod = (await import('@/lib/listings/collect-store')) as typeof StoreModule & { default?: typeof StoreModule }
const runCollection = runMod.runCollection ?? runMod.default!.runCollection
const collectionStore = storeMod.collectionStore ?? storeMod.default!.collectionStore

assertNotProduction()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('collection-run-drive runs on TEST only')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })
const stamp = Date.now().toString(36)
let fails = 0
const check = (name: string, ok: boolean, seen: unknown) => {
  if (!ok) fails += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `: ${JSON.stringify(seen)}`}`)
}

const page = `https://bp-${stamp}.example.com/whats-on`
const start = new Date(Date.now() + 9 * 86_400_000)
start.setUTCHours(9, 0, 0, 0)
const html = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'MusicEvent', name: `Bp Drive Trio ${stamp}`, startDate: start.toISOString(), location: { name: `Bp Drive Hall ${stamp}`, address: '1 Bp Street, Geelong' }, offers: { url: `https://events.humanitix.com/bp-${stamp}`, price: 25, priceCurrency: 'AUD', availability: 'InStock' } },
    { '@type': 'ComedyEvent', name: `Bp Drive Comedy ${stamp}`, startDate: new Date(start.getTime() + 86_400_000).toISOString(), location: { name: `Bp Drive Hall ${stamp}` } },
  ],
})}</script>`
const asked: string[] = []
const fetcher: Fetcher = async (u) => {
  asked.push(u)
  if (u.endsWith('/robots.txt')) return { status: 200, text: async () => 'User-agent: *\nDisallow: /private' }
  if (u === page) return { status: 200, text: async () => html }
  return { status: 404, text: async () => '' }
}

const made: string[] = []
const today = new Date().toISOString().slice(0, 10)
try {
  const { data: src, error } = await db
    .from('listing_sources')
    .insert([
      {
        name: `bp-drive ${stamp}`, kind: 'venue', city_slug: 'geelong', page_url: page, collection: 'read', terms_url: `https://bp-${stamp}.example.com/terms`, terms_quote: 'bp-drive: a stand in terms line', terms_read_on: today,
        /* The register's answers (20261028140001): scraping answered yes with its evidence, verified, facts and links. */
        may_scrape: 'yes', may_scrape_quote: 'bp-drive: a stand in line allowing the read', may_scrape_url: `https://bp-${stamp}.example.com/terms`, may_scrape_read_on: today,
        verification: 'verified', verified_on: today, permits_links: true,
      },
      { name: `bp-drive ask ${stamp}`, kind: 'promoter', page_url: `https://bp-ask-${stamp}.example.com/`, collection: 'ask' },
    ], { defaultToNull: false })
    .select('id, collection')
  if (error) throw error
  made.push(...(src ?? []).map((s) => s.id as string))

  const { error: refused } = await db.from('listing_sources').insert({ name: `bp-drive bad ${stamp}`, kind: 'venue', page_url: `https://bp-bad-${stamp}.example.com/`, collection: 'read' })
  check('the database refuses a source read without its terms quoted', refused?.code === '23514', refused)

  const now = new Date()
  const store = collectionStore(db)
  const ours = async () => (await store.sources()).filter((s) => made.includes(s.id))
  const first = await runCollection({ ...store, sources: ours }, fetcher, now)
  check('the read source is read: robots.txt first, then its page', JSON.stringify(asked) === JSON.stringify([`https://bp-${stamp}.example.com/robots.txt`, page]), asked)
  check('the ask source is never fetched', !asked.some((a) => a.includes('bp-ask-')), asked)
  check('two events land for review', first.landed === 2, first)

  const { data: landed } = await db.from('listing_candidates').select('id, kind, status, title, links').in('source_id', made)
  check('both wait as new listings', (landed ?? []).length === 2 && (landed ?? []).every((c) => c.status === 'waiting' && c.kind === 'new'), landed)
  const trio = (landed ?? []).find((c) => String(c.title).startsWith('Bp Drive Trio'))
  check('the trio carries its Humanitix link and its price', JSON.stringify(trio?.links) === JSON.stringify([{ url: `https://events.humanitix.com/bp-${stamp}`, availability: 'on_sale', priceFromCents: 2500 }]), trio)

  const { data: src0 } = await db.from('listing_sources').select('last_checked_at, last_outcome, last_success_at').eq('id', made[0]).single()
  check('the source records its check', src0?.last_outcome === 'read: 2 event(s) found, 2 new for review' && src0.last_checked_at !== null, src0)
  check('the source records its last successful collection', src0?.last_success_at !== null && src0?.last_success_at === src0?.last_checked_at, src0)

  await db.from('listing_candidates').update({ status: 'refused', refused_because: 'Not for EventLinqs', reviewed_at: now.toISOString() }).eq('id', trio!.id)
  const { error: undue } = await db.from('listing_sources').update({ last_checked_at: null, last_success_at: null }).eq('id', made[0])
  if (undue) throw undue
  const second = await runCollection({ ...store, sources: ours }, fetcher, now)
  const { data: again } = await db.from('listing_candidates').select('id, status').in('source_id', made)
  check('a second run lands nothing it already found, and keeps the review', second.landed === 0 && (again ?? []).length === 2 && (again ?? []).some((c) => c.status === 'refused'), { second, again })

  const { error: halfReview } = await db.from('listing_candidates').update({ status: 'accepted' }).eq('id', (again ?? []).find((c) => c.status === 'waiting')!.id)
  check('the database refuses a review with no moment', halfReview?.code === '23514', halfReview)
} catch (err) {
  fails += 1
  console.log(`FAIL the drive stopped: ${err instanceof Error ? err.message : JSON.stringify(err)}`)
} finally {
  if (made.length > 0) await db.from('listing_sources').delete().in('id', made)
  const { count } = await db.from('listing_candidates').select('id', { count: 'exact', head: true }).in('source_id', made)
  check('every row it made is gone', (count ?? 0) === 0, count)
  console.log(fails === 0 ? 'DRIVE PASSED' : `DRIVE FAILED (${fails})`)
  process.exit(fails === 0 ? 0 : 1)
}
