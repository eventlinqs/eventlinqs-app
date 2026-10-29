/**
 * D9 READ ON TEST, READ ONLY (the master mandate of 29 October 2026, section 9): src/lib/growth/supply-scorecard.ts, the
 * reader behind /admin/growth's supply by city, run against TEST so each figure comes from a real database. Writes
 * nothing.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/supply-scorecard-read.mts
 *
 * Prints each city's figures and gaps; the last line is the verdict: READ, or FAILED with the error.
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as SupplyModule from '@/lib/growth/supply-scorecard'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

assertNotProduction()
if (!(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('vkapkibzokmfaxqogypq')) {
  console.error('supply-scorecard-read runs on TEST only')
  process.exit(2)
}

const unwrap = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const supply = unwrap((await import('@/lib/growth/supply-scorecard')) as typeof SupplyModule & { default?: typeof SupplyModule })

try {
  const s = await supply.readSupplyScorecard()
  console.log(`read at ${s.readAt}; waiting with no city ${s.waitingWithNoCity}`)
  for (const c of s.cities) {
    console.log(
      `  ${c.city.padEnd(12)} verified ${c.verifiedUpcoming}, new ${c.newThisWeek}, expiring ${c.expiringSoon}, cancelled ${c.cancelledThisWeek}, awaiting ${c.awaitingVerification}, own imagery ${c.withApprovedImagery}, organisers ${c.activeOrganisers}, recurring ${c.recurringSuppliers}; gaps: ${c.gaps.join(', ') || 'none'}`,
    )
  }
  console.log('READ')
} catch (err) {
  console.log(`FAILED ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
