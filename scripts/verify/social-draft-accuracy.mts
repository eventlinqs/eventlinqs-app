/**
 * EVERY DRAFT OF THE WEEK AGAINST ITS LISTING (the release checklist of 28 October 2026, A2), read only, on TEST
 * (never production): store.pieceDependencies, the check that stands before every approval (J15), run over every piece
 * of the week's campaign, with each reason it gives printed beside its piece.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/social-draft-accuracy.mts [--site <origin>]
 *
 * What it judges: each night still published, public and not ended; its title, date and time, admission chip and the
 * slide's words as the night holds them now; its outside ticket page answering; every image usable now; the creative
 * refusals and the visual QA at every format. With --site, each piece's own page is fetched from that deployment and
 * must list every night it advertises. Without it the pages are NOT JUDGED: a stand in answers for EventLinqs' own
 * pages, so no page of ours is fetched and no share link (/e/) is ever followed, and the run says so on its last line.
 * Writes nothing.
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as StoreModule from '@/lib/social/store'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const storeMod = (await import('@/lib/social/store')) as typeof StoreModule & { default?: typeof StoreModule }
const store = (storeMod.default ?? storeMod) as typeof StoreModule

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!url.includes('vkapkibzokmfaxqogypq') || url.includes('gndnldyfudbytbboxesk')) {
  console.error('social-draft-accuracy runs on TEST only')
  process.exit(2)
}
const at = process.argv.indexOf('--site')
const site = at > 0 ? process.argv[at + 1] ?? null : null
if (site && /eventlinqs\.com(\.au)?/.test(site)) {
  console.error('--site names a TEST deployment, never production')
  process.exit(2)
}
const db = createClient(url, key, { auth: { persistSession: false } })
const now = new Date()

/* Without --site: our own pages answer from a stand in that lists every slug; anything else is fetched for real. */
const { data: slugs } = await db.from('events').select('slug').limit(5000)
const listing = `<html>${(slugs ?? []).map((e) => `<a href="/events/${e.slug}">x</a>`).join('')}</html>`
const STAND_IN = 'http://localhost:9'
const fetcher = (async (u: string | URL | Request, init?: RequestInit) => {
  const href = String(u instanceof Request ? u.url : u)
  if (href.startsWith(STAND_IN)) return new Response(listing, { status: 200 })
  if (/eventlinqs\.com(\.au)?/.test(new URL(href).host)) return new Response('', { status: 200 })
  return fetch(href, { ...init, headers: { 'user-agent': 'EventLinqs-QA-crawler' } })
}) as typeof fetch

const campaign = await store.readCampaign(db, now)
if (!campaign) {
  console.log('NO CAMPAIGN this week on TEST')
  process.exit(1)
}
console.log(`CAMPAIGN ${campaign.campaignId}, week of ${campaign.weekStart}, ${campaign.pieces.length} piece(s), checked ${now.toISOString()}`)
let clean = 0
const reasons = new Map<string, number>()
for (const p of campaign.pieces) {
  const issues = await store.pieceDependencies(db, p.id, now, { siteOrigin: site ?? STAND_IN, fetcher })
  if (issues.length === 0) clean += 1
  console.log(`${issues.length === 0 ? 'CLEAN' : 'HELD '} ${p.kind} ${p.city}${p.partnerName ? ` (${p.partnerName})` : ''}: ${issues.length === 0 ? 'nothing to hold it' : issues.join(' | ')}`)
  for (const i of issues) {
    const kind = i.replace(/^[^:]*: /, '')
    reasons.set(kind, (reasons.get(kind) ?? 0) + 1)
  }
}
console.log(`SUMMARY ${clean} of ${campaign.pieces.length} piece(s) clean; reasons: ${[...reasons].map(([k, n]) => `${n} x ${k}`).join('; ') || 'none'}`)
console.log(site ? `PAGES JUDGED on ${site}` : 'PAGES NOT JUDGED: a stand in answered for EventLinqs pages (run with --site <a TEST deployment>)')
