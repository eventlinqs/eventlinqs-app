/**
 * GUARD: THE DOOR'S LIVE FEED IS PUBLISHED ON THE DATABASE THIS BUILD RUNS AGAINST.
 *
 * THE INVARIANT, 5 September 2026 (B2, Scope v5 3.13). Two doors on one event
 * see each other's admissions because ticket_scans is in the supabase_realtime
 * publication (migration 20260905000002). Nothing else in the gate set can
 * see a publication: lint, typecheck, build and the unit tests read no
 * database, and schema-ahead-of-code probes columns, not publications. A
 * later migration that recreates the table, or a project where the migration
 * was never applied, leaves every door silently alone: the channel subscribes,
 * says SUBSCRIBED, and never receives a row. That is the failure this refuses.
 *
 * HOW. One read-only RPC, door_realtime_enabled(), which reads
 * pg_publication_tables as SECURITY DEFINER and answers true or false. It is
 * granted to service_role and authenticated, never anon, so the guard needs the
 * service key the build already holds (schema-ahead-of-code uses the same
 * credentials). Decisions:
 *
 *   PASS   the RPC answers true
 *   FAIL   the RPC answers false (the table is not published)
 *   FAIL   the RPC does not exist (the migration is not applied) or errors
 *   SKIP   no real project URL (CI's typecheck build), or no service key to ask
 *          with, each stated by name, because a guard that cannot look must say
 *          so rather than pass by silence
 *
 * Proven on TEST on 5 September 2026 by dropping ticket_scans from the
 * publication through the CLI (FAIL, naming the migration), then adding it back
 * (PASS): C:\dev\EVIDENCE\B2\guard-door-live-published-proof.txt.
 *
 * Run standalone:  node --env-file=.env.local scripts/guards/door-live-published.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[door-live-published]'
export const RPC = 'door_realtime_enabled'
export const MIGRATION = '20260905000002_door_realtime.sql'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split(String.fromCharCode(10))) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const REAL_PROJECT = /^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/

/**
 * The decision, as a pure function of what the environment offers and what
 * the database answers, so the table above is testable without a network.
 */
export function decide({ url, serviceKey, answer }) {
  if (!url || !REAL_PROJECT.test(url)) {
    return { verdict: 'SKIP', reason: 'no real Supabase project URL in this build (CI typecheck uses a placeholder), nothing to ask' }
  }
  if (!serviceKey) {
    return { verdict: 'SKIP', reason: 'no SUPABASE_SERVICE_ROLE_KEY in this build, and the probe is not granted to anon' }
  }
  if (answer.error) {
    return { verdict: 'FAIL', reason: `${RPC}() could not be asked (${answer.error}); apply ${MIGRATION} to this project` }
  }
  if (answer.value === true) return { verdict: 'PASS', reason: 'ticket_scans is in the supabase_realtime publication' }
  return { verdict: 'FAIL', reason: `ticket_scans is NOT in the supabase_realtime publication on this project; every door's live feed would be silent. Apply ${MIGRATION}` }
}

/**
 * Ask the project, read only. Returns { value } or { error }.
 *
 * A GET, not a POST: PostgREST serves a STABLE function on GET, and this guard
 * carries an admin credential, so it must hold no write verb at all. That is
 * what no-unguarded-production-write reads for, and a probe that runs inside
 * every production build cannot take the production-write preflight instead.
 */
export async function ask({ url, serviceKey, fetchImpl = fetch }) {
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/rpc/${RPC}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    })
    const text = await res.text()
    if (!res.ok) return { error: `HTTP ${res.status} ${text.slice(0, 160)}` }
    return { value: text.trim() === 'true' }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*\/scripts\//, 'scripts/'))
if (isMain || (process.argv[1] && /door-live-published\.mjs$/.test(process.argv[1]))) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const ref = /^https:\/\/([a-z0-9]+)\./.exec(url)?.[1] ?? 'no project'
  const canAsk = Boolean(url && REAL_PROJECT.test(url) && serviceKey)
  const answer = canAsk ? await ask({ url, serviceKey }) : { error: 'not asked' }
  const { verdict, reason } = decide({ url, serviceKey, answer })
  // What this guard did, in numbers that move (steps-declare-work): the URL is
  // read every time; the probe is sent only when there is a real project and a
  // key to ask with, and a SKIP says so by name below.
  declareWork('door-live-published', {
    did: { 'project URL read': 1, 'publication probe sent': canAsk ? 1 : 0 },
    found: { 'published table': answer.value === true ? 1 : 0 },
    zeroIsFine: { 'publication probe sent': 'no real project URL or no service key in this build; the SKIP below names which' },
  })
  console.log(`${TAG} ${verdict} - project ${ref}: ${reason}`)
  // exitCode rather than exit(): on Windows a hard exit while the fetch socket is
  // still open reports a crash code instead of 1 (seen 5 September 2026).
  if (verdict === 'FAIL') process.exitCode = 1
}
