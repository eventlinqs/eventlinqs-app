/**
 * THE DAILY RUN, DRIVEN ON TEST WITH THE REAL STORE (the engine plan of 28 October 2026, parts A and E; window 4).
 *
 *   scripts\ops\with-supabase-token.ps1 node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify/supply-run-drive.mts
 *
 * Plants two sources (bp-drive: a partner's own verified daily feed at a borrowed venue with a category, and a feed
 * that is not a partner's), serves their pages from an injected fetch (no outside site is read), runs the collection
 * once through collectionStore against TEST, and reads back: the partner's night accepted by the rule and published as
 * a dated series with an organiser_submission check; its night at another venue and the stranger's night waiting with
 * their reasons; a run row per source, the failing one included. Then it removes every row it made and proves none is
 * left. TEST only.
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type { Fetcher } from '@/lib/listings/collect-run'
import type * as RunModule from '@/lib/listings/collect-run'
import type * as StoreModule from '@/lib/listings/collect-store'
import type * as FeedModule from '@/lib/listings/partner-feed'

/* src is CommonJS to tsx; read each module's exports whichever way the loader hands them over. */
const runMod = (await import('@/lib/listings/collect-run')) as typeof RunModule & { default?: typeof RunModule }
const storeMod = (await import('@/lib/listings/collect-store')) as typeof StoreModule & { default?: typeof StoreModule }
const feedMod = (await import('@/lib/listings/partner-feed')) as typeof FeedModule & { default?: typeof FeedModule }
const partnerSourceRow = feedMod.partnerSourceRow ?? feedMod.default!.partnerSourceRow
const runCollection = runMod.runCollection ?? runMod.default!.runCollection
const collectionStore = storeMod.collectionStore ?? storeMod.default!.collectionStore

const TEST_REF = 'vkapkibzokmfaxqogypq'
assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes(TEST_REF)) {
  console.error('supply-run-drive runs on TEST only')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const checks: string[] = []
let failed = 0
const check = (ok: boolean, line: string) => {
  checks.push(`${ok ? 'PASS' : 'FAIL'} ${line}`)
  if (!ok) failed += 1
}

const PARTNER = 'https://bp-drive-partner.example.com/events'
const STRANGER = 'https://bp-drive-stranger.example.com/events'
const BROKEN = 'https://bp-drive-broken.example.com/events'
const made = { sources: [] as string[], series: [] as string[] }

async function main() {
  const { data: venue } = await db
    .from('venues')
    .select('id, name, address, city_slug, cities:cities!inner(timezone)')
    .not('address', 'is', null)
    .order('created_at')
    .limit(1)
    .single()
  const { data: org } = await db.from('organisations').select('id, name').neq('slug', 'eventlinqs-listings').order('created_at').limit(1).single()
  const { data: cat } = await db.from('event_categories').select('id').order('created_at').limit(1).single()
  if (!venue || !org || !cat) throw new Error('TEST holds no venue with a city, partner organisation or category to borrow')

  const start = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000)
  start.setUTCHours(9, 30, 0, 0)
  const elsewhere = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const event = (name: string, at: Date, place: string, address: string | null, ticket: string) =>
    `<script type="application/ld+json">${JSON.stringify({
      '@type': 'Event',
      name,
      startDate: at.toISOString(),
      location: { name: place, ...(address ? { address } : {}) },
      offers: { url: ticket, availability: 'InStock', price: '25.00', priceCurrency: 'AUD' },
    })}</script>`
  const pages: Record<string, { status: number; body: string }> = {
    'https://bp-drive-partner.example.com/robots.txt': { status: 404, body: '' },
    'https://bp-drive-stranger.example.com/robots.txt': { status: 404, body: '' },
    'https://bp-drive-broken.example.com/robots.txt': { status: 404, body: '' },
    [PARTNER]:
      { status: 200, body: event('bp-drive partner night', start, venue.name as string, venue.address as string, 'https://bp-drive-partner.example.com/t/1') +
        event('bp-drive partner night away', elsewhere, 'bp-drive other hall', '9 bp-drive st, Geelong', 'https://bp-drive-partner.example.com/t/2') },
    [STRANGER]: { status: 200, body: event('bp-drive stranger night', start, 'bp-drive stranger hall', null, 'https://bp-drive-stranger.example.com/t/1') },
    [BROKEN]: { status: 503, body: '' },
  }
  const fetcher: Fetcher = async (u) => {
    const p = pages[u]
    if (!p) throw new Error(`the drive serves no page at ${u}`)
    return { status: p.status, text: async () => p.body }
  }

  const evidence = (k: string) => ({
    [`${k}_quote`]: 'bp-drive: the organiser said yes to EventLinqs reading this feed',
    [`${k}_url`]: 'https://bp-drive-partner.example.com/yes',
    [`${k}_read_on`]: '2026-10-28',
  })
  const readable = (name: string, page: string, extra: Record<string, unknown>) => ({
    name,
    kind: 'venue',
    page_url: page,
    collection: 'read',
    changes: 'daily',
    terms_url: 'https://bp-drive-partner.example.com/yes',
    terms_quote: 'bp-drive: read with permission',
    terms_read_on: '2026-10-28',
    may_subscribe: 'yes',
    ...evidence('may_subscribe'),
    permits_links: true,
    verification: 'verified',
    verified_on: '2026-10-28',
    ...extra,
  })
  function partnerRow() {
    const built = partnerSourceRow(
      {
        organisationId: org!.id as string,
        organisationName: `bp-drive ${org!.name as string}`,
        venueId: venue!.id as string,
        venueName: `bp-drive ${venue!.name as string}`,
        venueCitySlug: (venue!.city_slug as string | null) ?? null,
        categoryId: cat!.id as string,
        feedUrl: PARTNER,
        feedKind: 'page',
        yesUrl: 'https://bp-drive-partner.example.com/yes',
        yesWords: 'bp-drive: yes, read our events page for EventLinqs listings',
        yesOn: new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date()),
      },
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date()),
    )
    if ('refused' in built) throw new Error(`the partner row was refused by its builder: ${built.refused}`)
    return built.row
  }
  /* The partner row alone, planted exactly as the form on /admin/collected writes it (one row, one insert), so the
     database is seen to take that row; the other two together. */
  const { data: p, error: perr } = await db.from('listing_sources').insert(partnerRow()).select('id, page_url')
  if (perr) throw new Error(`the partner's source could not be planted: ${perr.message}`)
  const { data: others, error: serr } = await db
    .from('listing_sources')
    .insert([
      readable('bp-drive stranger feed', STRANGER, { source_type: 'subscription_feed' }),
      readable('bp-drive broken feed', BROKEN, { source_type: 'subscription_feed' }),
    ])
    .select('id, page_url')
  const srcs = [...(p ?? []), ...(others ?? [])]
  made.sources = srcs.map((s) => s.id as string)
  if (serr) throw new Error(`the drive's sources could not be planted: ${serr.message}`)
  const idOf = (page: string) => srcs.find((s) => s.page_url === page)!.id as string

  const real = collectionStore(db)
  const store = { ...real, sources: async () => (await real.sources()).filter((s) => made.sources.includes(s.id)) }
  const result = await runCollection(store, fetcher, new Date())
  for (const s of result.sources) console.log(`  outcome ${s.name}: ${s.outcome}`)
  check(result.read === 2 && result.skipped === 1, `read 2 sources, 1 not read (got read ${result.read}, skipped ${result.skipped})`)
  check(result.acceptedByRule === 1 && result.queued === 2, `1 accepted by the partner rule, 2 for review (got ${result.acceptedByRule} and ${result.queued})`)

  const { data: cands } = await db
    .from('listing_candidates')
    .select('id, title, status, decided_by, confidence, reasons, published_series_id, source_id')
    .in('source_id', made.sources)
  const byTitle = (t: string) => (cands ?? []).find((c) => c.title === t)
  const home = byTitle('bp-drive partner night')
  check(home?.status === 'accepted' && home.decided_by === 'partner_rule' && home.confidence === 'high' && !!home.published_series_id,
    `the partner's night at its own venue is accepted by the rule and published (${JSON.stringify(home && { status: home.status, decided_by: home.decided_by, series: !!home.published_series_id })})`)
  const away = byTitle('bp-drive partner night away')
  check(away?.status === 'waiting' && away.decided_by === 'person', `its night at another venue waits for a person (${away?.status}, ${away?.decided_by})`)
  const stranger = byTitle('bp-drive stranger night')
  check(stranger?.status === 'waiting' && stranger.decided_by === 'person' && (stranger.reasons as string[]).includes('no_venue_address'),
    `the stranger's night waits, saying why (${JSON.stringify(stranger?.reasons)})`)

  if (home?.published_series_id) {
    made.series.push(home.published_series_id as string)
    const { data: series } = await db
      .from('event_series')
      .select('rule, venue_id, organisation_id, category_id, listing_source, booking_links, summary')
      .eq('id', home.published_series_id)
      .single()
    check(series?.rule === 'once' && series.venue_id === venue.id && series.organisation_id === org.id && series.listing_source === 'organiser',
      `the series is a dated night at the partner's venue, held by its organisation (${JSON.stringify(series && { rule: series.rule, source: series.listing_source })})`)
    const links = (series?.booking_links ?? []) as { url: string; price_from_cents: number | null }[]
    check(links.length === 1 && links[0].url === 'https://bp-drive-partner.example.com/t/1' && links[0].price_from_cents === 2500,
      `its booking link and price came through (${JSON.stringify(links)})`)
    const { data: lc } = await db.from('listing_checks').select('reuse_basis, import_file').eq('series_id', home.published_series_id)
    check((lc ?? []).length === 1 && lc![0].reuse_basis === 'organiser_submission', `one listing check, basis organiser_submission (${JSON.stringify(lc)})`)
  }

  const { data: runs } = await db.from('listing_source_runs').select('source_id, succeeded, http_status, found, landed, queued, accepted_by_rule').in('source_id', made.sources)
  const runOf = (page: string) => (runs ?? []).find((r) => r.source_id === idOf(page))
  check((runs ?? []).length === 3, `one run row per source (${(runs ?? []).length})`)
  check(runOf(BROKEN)?.succeeded === false && runOf(BROKEN)?.http_status === 503 && runOf(BROKEN)?.landed === 0, `the failing source's run says so: 503, nothing landed`)
  check(runOf(PARTNER)?.accepted_by_rule === 1 && runOf(PARTNER)?.queued === 1, `the partner's run counts 1 by rule and 1 for review`)

  /* A second run the next day publishes nothing twice. */
  const again = await runCollection(store, fetcher, new Date(Date.now() + 20 * 60 * 60 * 1000))
  const { data: lc2 } = made.series.length ? await db.from('listing_checks').select('id').in('series_id', made.series) : { data: [] }
  check(again.landed === 0 && (lc2 ?? []).length === 1, `the next day's run lands nothing new and writes no second check (landed ${again.landed}, checks ${(lc2 ?? []).length})`)
}

/**
 * Series and listing checks are history the service role may not delete, so the drive removes its own through the
 * Management API (the token with-supabase-token.ps1 hands over), by id, and only while no event was made from them.
 */
async function removeSeries(ids: string[]) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('run the drive under scripts/ops/with-supabase-token.ps1 so it can remove the series it made')
  const list = ids.map((id) => `'${id.replace(/[^0-9a-f-]/g, '')}'::uuid`).join(', ')
  const query =
    `with c as (delete from public.listing_checks where series_id in (${list}) returning 1), ` +
    `e as (delete from public.event_series where id in (${list}) and name like 'bp-drive%' ` +
    `and not exists (select 1 from public.events where listing_series_id in (${list})) returning 1) ` +
    `select (select count(*) from c) as checks, (select count(*) from e) as series`
  const r = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!r.ok) throw new Error(`the series could not be removed: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
}

async function cleanup() {
  if (made.series.length) {
    await db.from('listing_candidates').update({ published_series_id: null }).in('published_series_id', made.series)
    await removeSeries(made.series)
  }
  if (made.sources.length) {
    await db.from('listing_candidates').delete().in('source_id', made.sources)
    await db.from('listing_sources').delete().in('id', made.sources)
  }
  const left = await Promise.all([
    db.from('listing_sources').select('id', { count: 'exact', head: true }).like('name', 'bp-drive%'),
    db.from('listing_candidates').select('id', { count: 'exact', head: true }).like('title', 'bp-drive%'),
    db.from('event_series').select('id', { count: 'exact', head: true }).like('name', 'bp-drive%'),
    made.sources.length ? db.from('listing_source_runs').select('id', { count: 'exact', head: true }).in('source_id', made.sources) : Promise.resolve({ count: 0 }),
  ])
  const counts = left.map((r) => (r as { count: number | null }).count ?? 0)
  check(counts.every((n) => n === 0), `cleanup: rows left (sources, candidates, series, runs) ${counts.join(', ')}`)
}

try {
  await main()
} catch (err) {
  check(false, `the drive stopped: ${err instanceof Error ? err.message : String(err)}`)
} finally {
  await cleanup()
}
console.log(`target TEST (${TEST_REF})`)
for (const c of checks) console.log(`  ${c}`)
console.log(failed === 0 ? `DRIVE PASSED, ${checks.length} checks` : `DRIVE FAILED, ${failed} of ${checks.length}`)
process.exitCode = failed === 0 ? 0 : 1
