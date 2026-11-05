/**
 * THE BIG EVENT HUNT BY HAND (car 44; the CONTROLLER's 22:25b of 4 November 2026: 'its FIRST RUN on production done right
 * after it goes live (not waiting for the schedule), its log per city written'). The same run the cron does
 * (src/app/api/cron/big-event-hunt/route.ts): the hunt's sources only, each due, through the collection run.
 *
 *   scripts\ops\with-supabase-token.ps1 node node_modules/tsx/dist/cli.mjs scripts/ops/hunt-run.mts --target test
 *       a DRY RUN: reads the pages and plans; every write is captured and printed, nothing is written
 *   ... --target production --apply        the real run, after APPLY is typed, logged in C:\dev\PRODUCTION-WRITES.txt
 * The log per city is printed and written to C:\dev\EVIDENCE\CAR44\hunt-<target>-<stamp>.json.
 */
import Module from 'node:module'
import { appendFileSync, mkdirSync, readSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import type * as RunModule from '@/lib/listings/collect-run'
import type * as StoreModule from '@/lib/listings/collect-store'
import type * as DayModule from '@/lib/listings/headline-hunt-day'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const runMod = (await import('@/lib/listings/collect-run')) as typeof RunModule & { default?: typeof RunModule }
const storeMod = (await import('@/lib/listings/collect-store')) as typeof StoreModule & { default?: typeof StoreModule }
const dayMod = (await import('@/lib/listings/headline-hunt-day')) as typeof DayModule & { default?: typeof DayModule }
const { runCollection } = (runMod.default ?? runMod) as typeof RunModule
const { collectionStore } = (storeMod.default ?? storeMod) as typeof StoreModule
const { huntDay } = (dayMod.default ?? dayMod) as typeof DayModule

const TARGETS = { production: 'gndnldyfudbytbboxesk', test: 'vkapkibzokmfaxqogypq' } as const
// A production run that writes asks the platform preflight's own explicit opt in (ALLOW_PRODUCTION_SUPABASE=1) and APPLY.
if (process.argv.includes('production') && process.argv.includes('--apply') && process.env.ALLOW_PRODUCTION_SUPABASE !== '1') {
  console.error('[hunt-run] REFUSED: a production run that writes needs ALLOW_PRODUCTION_SUPABASE=1 set for this run, then APPLY typed')
  process.exit(1)
}
const LOG = 'C:/dev/PRODUCTION-WRITES.txt'
const args = process.argv.slice(2)
const target = args[args.indexOf('--target') + 1] as keyof typeof TARGETS
const apply = args.includes('--apply')
if (!(target in TARGETS)) {
  console.error('[hunt-run] REFUSED: --target must be test or production; there is no default')
  process.exit(1)
}
const token = process.env.SUPABASE_ACCESS_TOKEN ?? ''
if (!token) {
  console.error('[hunt-run] REFUSED: run it through scripts\\ops\\with-supabase-token.ps1')
  process.exit(1)
}
const ref = TARGETS[target]
const keys = (await (await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { name: string; api_key: string }[]
const service = keys.find((k) => k.name === 'service_role')?.api_key
if (!service) {
  console.error(`[hunt-run] REFUSED: the ${target} service key could not be read`)
  process.exit(1)
}
const db = createClient(`https://${ref}.supabase.co`, service, { auth: { persistSession: false } })
const real = collectionStore(db)
const captured: string[] = []
const store = apply
  ? real
  : {
      ...real,
      land: async (row: { title: string; venueName: string; decidedBy: string }) => (captured.push(`would land: ${row.title} @ ${row.venueName} (${row.decidedBy})`), true),
      record: async () => {},
      logRun: async () => {},
      addLinks: async () => {},
      publishPartnerNight: async () => {},
      publishHuntNight: async (row: { title: string }, _h: unknown, venue: string) => void captured.push(`would LIST: ${row.title} @ ${venue}`),
      confirmSeries: async () => {},
      expirePassed: async () => 0,
    }
if (apply) {
  process.stdout.write(`Type APPLY to run the big event hunt on ${target}: `)
  const buf = Buffer.alloc(64)
  let n = 0
  try {
    n = readSync(0, buf, 0, buf.length, null)
  } catch {
    n = 0
  }
  if (buf.subarray(0, n).toString('utf8').trim() !== 'APPLY') {
    console.error('[hunt-run] not applied')
    process.exit(1)
  }
}
const now = new Date()
const hunt = { ...store, sources: async () => (await real.sources()).filter((s) => s.hunt).map((s) => ({ ...s, lastCheckedAt: null })) } as typeof real
const result = await runCollection(hunt, fetch, now)
const byCity = await huntDay(db, result, now)
for (const s of result.sources) console.log(`[hunt-run] ${s.name}: ${s.outcome}`)
for (const c of byCity) console.log(`[hunt-run] ${c.citySlug}: ${c.newBigEvents} new big event(s) listed, ${c.waiting} waiting; upcoming by tier 1 ${c.upcomingByTier[1]}, 2 ${c.upcomingByTier[2]}, 3 ${c.upcomingByTier[3]}, 4 ${c.upcomingByTier[4]}`)
for (const c of captured.slice(0, 60)) console.log(`  ${c}`)
mkdirSync('C:/dev/EVIDENCE/CAR44', { recursive: true })
const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 13)
writeFileSync(`C:/dev/EVIDENCE/CAR44/hunt-${target}-${stamp}.json`, JSON.stringify({ target, applied: apply, at: now.toISOString(), result, byCity, captured }, null, 1))
if (apply && target === 'production') {
  appendFileSync(LOG, `${now.toISOString()} | hunt-run | production | the big event hunt's first run: ${byCity.map((c) => `${c.citySlug} ${c.newBigEvents} listed, ${c.waiting} waiting`).join('; ')}\n`)
}
console.log(`[hunt-run] ${apply ? 'WRITTEN' : 'DRY RUN, nothing written'}; log C:/dev/EVIDENCE/CAR44/hunt-${target}-${stamp}.json`)
