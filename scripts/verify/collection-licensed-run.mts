/**
 * ITEM 19 ON REAL, LICENSED SOURCES (the project manager's 12:26 of 28 October 2026, ruling (2)): register the sources in
 * docs/walk-in/collection-sources-28oct.json, each with its five permission answers quoted and dated, its permitted
 * content, its verification and its owner (the release checklist's D2 to D4; 20261028140001), then run the weekly
 * collection once over them with the real fetch, so it lands their events for review.
 *
 *   node --env-file=<env file> node_modules/tsx/dist/cli.mjs scripts/verify/collection-licensed-run.mts <sources.json> [--dry-run] [--production]
 *
 * --dry-run writes nothing anywhere: the sources are read from the file, the feeds are fetched (robots.txt first) and
 * what WOULD land is printed. Without it the sources are registered (upsert by page_url) and the run lands its finds as
 * waiting candidates; nothing is published, a person accepts or refuses each on /admin/collected. TEST unless
 * --production is given, and a production write is the founder's YES and window 4's log, never this script's choice.
 * At the end it reads back, per source, how many candidates wait for review, how many carry an image or a description
 * (none may, from a facts only source), and the source's last successful collection.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type { CandidateRow, CollectionStore, Fetcher } from '@/lib/listings/collect-run'
import type * as RunModule from '@/lib/listings/collect-run'
import type * as StoreModule from '@/lib/listings/collect-store'

/* src is CommonJS to tsx; read each module's exports whichever way the loader hands them over. */
const runMod = (await import('@/lib/listings/collect-run')) as typeof RunModule & { default?: typeof RunModule }
const storeMod = (await import('@/lib/listings/collect-store')) as typeof StoreModule & { default?: typeof StoreModule }
const runCollection = runMod.runCollection ?? runMod.default!.runCollection
const collectionStore = storeMod.collectionStore ?? storeMod.default!.collectionStore

const TEST_REF = 'vkapkibzokmfaxqogypq'
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
const file = process.argv[2]
const dry = process.argv.includes('--dry-run')
const production = process.argv.includes('--production')
if (!file) {
  console.error('usage: collection-licensed-run.mts <sources.json> [--dry-run] [--production]')
  process.exit(2)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!production) {
  assertNotProduction()
  if (!url.includes(TEST_REF) || url.includes(PRODUCTION_REF)) {
    console.error('without --production this runs on TEST only')
    process.exit(2)
  }
}
console.log(`target ${url.replace(/^https:\/\/([a-z0-9]+)\..*$/, '$1')}${dry ? ', DRY RUN: nothing is written' : ''}`)

type Answer = 'yes' | 'no' | 'unknown'
type SourceRow = {
  name: string
  kind: string
  city_slug: string
  page_url: string
  collection: 'read'
  terms_url: string
  terms_quote: string
  terms_read_on: string
  changes: 'weekly' | 'monthly' | 'rarely'
  source_type: string
  may_scrape: Answer
  may_use_dataset: Answer
  may_subscribe: Answer
  may_redistribute_facts: Answer
  may_reuse_media: Answer
  permits_facts: boolean
  permits_descriptions: boolean
  permits_images: boolean
  permits_links: boolean
  verification: string
  verified_on: string
  licence_owner: string | null
  contact: string | null
  [evidence: string]: unknown
}
const rows = JSON.parse(readFileSync(file, 'utf8')) as SourceRow[]
const db = createClient(url, key, { auth: { persistSession: false } })

const fetcher: Fetcher = async (u, init) => {
  const r = await fetch(u, { ...init, redirect: 'follow' })
  return { status: r.status, text: () => r.text() }
}

const permitsOf = (r: SourceRow) => ({ facts: r.permits_facts, descriptions: r.permits_descriptions, images: r.permits_images, links: r.permits_links })

const real = collectionStore(db)
let store: CollectionStore
let ids: Map<string, string>
const wouldLand: CandidateRow[] = []
if (dry) {
  ids = new Map(rows.map((r, i) => [`dry-${i}`, r.name]))
  store = {
    sources: async () =>
      rows.map((r, i) => ({ id: `dry-${i}`, name: r.name, pageUrl: r.page_url, collection: 'read', changes: r.changes, lastCheckedAt: null, lastSuccessAt: null, permits: permitsOf(r), verified: true, partner: false, partnerVenue: null })),
    known: (now) => real.known(now),
    heldLinks: (id) => real.heldLinks(id),
    land: async (row) => (wouldLand.push(row), true),
    record: async () => undefined,
    addLinks: async () => undefined,
    logRun: async () => undefined,
    publishPartnerNight: async () => undefined,
  }
} else {
  const { data, error } = await db.from('listing_sources').upsert(rows, { onConflict: 'page_url' }).select('id, name')
  if (error) throw new Error(`the sources could not be registered: ${error.message}`)
  ids = new Map((data ?? []).map((s) => [s.id as string, s.name as string]))
  console.log(`registered ${ids.size} source(s)`)
  store = { ...real, sources: async () => (await real.sources()).filter((s) => ids.has(s.id)) }
}

const now = new Date()
const result = await runCollection(store, fetcher, now)
for (const s of result.sources) console.log(`SOURCE ${s.name}: ${s.outcome}`)
console.log(`RESULT read ${result.read}, skipped ${result.skipped}, landed ${result.landed}${dry ? ' (would land)' : ''}`)
if (dry) {
  for (const r of wouldLand.slice(0, 12)) console.log(`  would land: ${r.title} | ${r.startsAt} | ${r.venueName} | image ${r.imageUrl ?? 'none'} | description ${r.description ? 'kept' : 'none'}`)
} else {
  for (const [id, name] of ids) {
    const waiting = await db.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('source_id', id).eq('status', 'waiting')
    const media = await db.from('listing_candidates').select('id', { count: 'exact', head: true }).eq('source_id', id).or('image_url.not.is.null,description.not.is.null')
    const { data: src } = await db.from('listing_sources').select('last_success_at, last_checked_at, source_type, acquisition_order').eq('id', id).single()
    if (waiting.error || media.error) throw new Error(`the read back failed: ${(waiting.error ?? media.error)!.message}`)
    console.log(
      `WAITING ${name}: ${waiting.count ?? 0} waiting for review, ${media.count ?? 0} with an image or description, ` +
        `last success ${src?.last_success_at ?? 'never'}, ${src?.source_type} (order ${src?.acquisition_order})`,
    )
  }
}
process.exit(result.read > 0 && result.landed > 0 ? 0 : 1)
