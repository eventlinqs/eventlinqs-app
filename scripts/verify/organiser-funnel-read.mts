/**
 * THE ORGANISER FUNNEL READ ON TEST, READ ONLY (part H, 29 October 2026): src/lib/growth/organiser-funnel.ts, the reader
 * behind /admin/growth's organisers section, run against TEST so each stage's count comes from a real database. It
 * writes nothing.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/organiser-funnel-read.mts
 *
 * Prints each stage and its share of the one before, then events per active organiser by month. A stage whose table is
 * not on TEST reads NOT COUNTED. The last line is the verdict: READ, or FAILED with the error.
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as FunnelModule from '@/lib/growth/organiser-funnel'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

assertNotProduction()
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!url.includes('vkapkibzokmfaxqogypq')) {
  console.error('organiser-funnel-read runs on TEST only')
  process.exit(2)
}

const unwrap = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const funnel = unwrap((await import('@/lib/growth/organiser-funnel')) as typeof FunnelModule & { default?: typeof FunnelModule })

try {
  const f = await funnel.readOrganiserFunnel()
  console.log(`read at ${f.readAt}`)
  for (const s of f.steps) {
    const share = s.fromBefore === null ? '' : `, ${Math.round(s.fromBefore * 100)} percent of the step before`
    console.log(`  ${s.stage.padEnd(11)} ${s.organisers === null ? 'NOT COUNTED' : String(s.organisers)}${share}`)
  }
  for (const m of f.months) {
    console.log(`  ${m.month}: ${m.activeOrganisers} active, ${m.nights} public nights, ${m.perActive === null ? 'none active' : m.perActive.toFixed(1) + ' each'}`)
  }
  console.log('READ')
} catch (err) {
  console.log(`FAILED ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
