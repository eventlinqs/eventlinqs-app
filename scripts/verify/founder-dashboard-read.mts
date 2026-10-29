/**
 * THE FOUNDER DASHBOARD READ ON TEST, READ ONLY (the master mandate of 29 October 2026, section 14):
 * src/lib/admin/founder-dashboard.ts, the figures under /admin/today's queue, run against TEST and arranged as the page
 * arranges them. Writes nothing.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/founder-dashboard-read.mts
 *
 * Prints each section in the page's order with its figures (* marks one that needs a person) and what the platform has
 * done; the last line is the verdict: READ, or FAILED with the error.
 */
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'
import type * as DashModule from '@/lib/admin/founder-dashboard'
import type * as MathModule from '@/lib/admin/founder-dashboard-math'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

assertNotProduction()
if (!(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').includes('vkapkibzokmfaxqogypq')) {
  console.error('founder-dashboard-read runs on TEST only')
  process.exit(2)
}

const unwrap = <T,>(m: T & { default?: T }) => (m.default ?? m) as T
const dash = unwrap((await import('@/lib/admin/founder-dashboard')) as typeof DashModule & { default?: typeof DashModule })
const math = unwrap((await import('@/lib/admin/founder-dashboard-math')) as typeof MathModule & { default?: typeof MathModule })

try {
  for (const s of math.arrangeDashboard(await dash.readFounderDashboard())) {
    console.log(`${s.title}${s.needsYou > 0 ? ` (${s.needsYou} need you)` : ''}`)
    for (const f of s.figures) {
      console.log(`  ${f.attention ? '*' : ' '} ${f.label}: ${f.display ?? (f.value === null ? 'NOT COUNTED' : f.value)}${f.note ? ` (${f.note.slice(0, 140)})` : ''}`)
    }
    if (s.done.length > 0) console.log(`    done: ${s.done.join('; ')}`)
  }
  console.log('READ')
} catch (err) {
  console.log(`FAILED ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
