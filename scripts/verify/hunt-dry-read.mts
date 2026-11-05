/**
 * THE HUNT'S DRY READ, NO DATABASE (car 44b; the CONTROLLER's 11:45 of 5 November 2026: 'each with a dry read quoted as
 * found N, or the reason it cannot be read'). Each named hunt page is read through the collection run itself (robots
 * first, one page a second, a stop at 403 or 429, the collector's agent, the hunt's page cap) into a store held in
 * memory: nothing is written anywhere and no database is asked. Prints, per source, the nights found and the first few.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/verify/hunt-dry-read.mts https://www.mcg.org.au/sitemap.xml ...
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import type * as RunModule from '@/lib/listings/collect-run'
import type * as HuntModule from '@/lib/listings/headline-hunt'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const runMod = (await import('@/lib/listings/collect-run')) as typeof RunModule & { default?: typeof RunModule }
const huntMod = (await import('@/lib/listings/headline-hunt')) as typeof HuntModule & { default?: typeof HuntModule }
const { runCollection } = (runMod.default ?? runMod) as typeof RunModule
const { HUNT_PAGE_CAP, huntFor } = (huntMod.default ?? huntMod) as typeof HuntModule

const pages = process.argv.slice(2)
for (const pageUrl of pages) {
  const hunt = huntFor(pageUrl)
  const found: string[] = []
  const store = {
    sources: async () => [
      {
        id: 'dry', name: pageUrl, pageUrl, collection: 'read' as const, changes: 'weekly' as const, lastCheckedAt: null, lastSuccessAt: null,
        permits: { facts: true, descriptions: false, images: false, links: true }, verified: true, partner: false, partnerVenue: null,
        citySlug: hunt?.citySlug ?? null, hunt,
      },
    ],
    known: async () => [],
    venueAddresses: async () => new Map<string, string>(),
    heldLinks: async () => new Set<string>(),
    land: async (row: { title: string; startsAt: string; venueName: string; decidedBy: string; reasons: readonly string[] }) => {
      found.push(`${row.startsAt.slice(0, 16)} ${row.title.slice(0, 60)} @ ${row.venueName} [${row.decidedBy}${row.reasons.length ? `: ${row.reasons.join(', ')}` : ''}]`)
      return true
    },
    record: async () => {},
    addLinks: async () => {},
    logRun: async () => {},
    publishPartnerNight: async () => {},
    publishHuntNight: async () => 'published' as const,
    expirePassed: async () => 0,
  }
  const started = Date.now()
  const r = await runCollection(store as unknown as Parameters<typeof runCollection>[0], fetch, new Date(), Infinity, { pageCap: HUNT_PAGE_CAP })
  const s = r.sources[0]
  console.log(`${pageUrl} | ${hunt ? `hunt ${hunt.citySlug}` : 'NOT ON THE HUNT LIST'} | ${s?.outcome ?? 'not read'} | found ${found.length} | ${Math.round((Date.now() - started) / 1000)} s`)
  for (const f of found.slice(0, 6)) console.log(`    ${f}`)
}
