/**
 * GUARD: THE EVENT LIFECYCLE IS ENFORCED ON THE DATABASE THIS BUILD RUNS AGAINST.
 *
 * THE INVARIANT, 6 September 2026 (close-out C13, docs/EVENT-LIFECYCLE.md).
 * Delete is refused in the database when an event has money records, a
 * deleted event leaves a tombstone so its URL answers 410, archived is a real
 * enum value, every foreign key onto events has an explicit delete rule,
 * checkout refuses any event that is not published, and every anonymous read
 * of events is gated on published or on the caller's organisation. None of
 * that is visible to lint, typecheck, the unit suite or a build: they read no
 * database. A project where migration 20260906000002 never landed, or where
 * somebody dropped the trigger by hand, would let the admin console delete an
 * event with orders, silently. That is the failure this refuses.
 *
 * HOW. One read-only RPC, event_lifecycle_guards(), which reads pg_enum,
 * pg_constraint, pg_trigger, pg_policy, pg_proc and the information schema as
 * SECURITY DEFINER and answers a jsonb of named booleans (plus the list of
 * NO ACTION foreign keys, which must be empty). Granted to service_role and
 * authenticated, never anon, so the guard needs the service key the build
 * already holds (schema-ahead-of-code and door-live-published use the same).
 *
 *   PASS   every flag true and no NO ACTION foreign key
 *   FAIL   any flag false, naming each one and the migration to apply
 *   FAIL   the RPC does not exist (the migration is not applied) or errors
 *   SKIP   no real project URL (CI's typecheck build), or no service key to
 *          ask with, each stated by name
 *
 * Proven on TEST on 6 September 2026 by dropping the delete-refusal trigger
 * through the CLI (FAIL, naming delete_refusal_trigger), then re-applying the
 * migration's definition (PASS): C:\dev\EVIDENCE\C13\guard-event-lifecycle-installed-*.txt.
 *
 * Run standalone:  node --env-file=.env.local scripts/guards/event-lifecycle-installed.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[event-lifecycle-installed]'
export const RPC = 'event_lifecycle_guards'
export const MIGRATIONS = ['20260906000001_event_status_archived.sql', '20260906000002_event_lifecycle_archive_delete.sql']

/** Every boolean the RPC must answer true. Kept in step with the migration by the unit test. */
export const REQUIRED_FLAGS = [
  'archived_in_enum',
  'archived_columns',
  'archived_pair_check',
  'tombstones_table',
  'tombstones_anon_columns_only',
  'delete_refusal_trigger',
  'tombstone_trigger',
  'parent_fk_set_null',
  'share_links_retire_allowed',
  'reservation_status_gate',
  'owner_delete_policy',
  'draft_only_delete_policy_gone',
  'anon_select_policies_gated',
  'door_reads_no_event_status',
]

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
    return { verdict: 'FAIL', reason: `${RPC}() could not be asked (${answer.error}); apply ${MIGRATIONS.join(' and ')} to this project` }
  }
  const value = answer.value
  if (!value || typeof value !== 'object') {
    return { verdict: 'FAIL', reason: `${RPC}() answered ${JSON.stringify(value)} rather than its named flags; apply ${MIGRATIONS[1]}` }
  }
  const failing = REQUIRED_FLAGS.filter((flag) => value[flag] !== true)
  const noAction = Array.isArray(value.no_action_fks) ? value.no_action_fks : ['(no_action_fks missing)']
  if (failing.length === 0 && noAction.length === 0) {
    return { verdict: 'PASS', reason: `${REQUIRED_FLAGS.length} flags true and every foreign key onto events carries a delete rule` }
  }
  const parts = []
  if (failing.length > 0) parts.push(`not in place: ${failing.join(', ')}`)
  if (noAction.length > 0) parts.push(`foreign keys onto events with NO ACTION: ${noAction.join(', ')}`)
  return { verdict: 'FAIL', reason: `${parts.join('; ')}. Apply ${MIGRATIONS.join(' and ')} to this project` }
}

/**
 * Ask the project, read only. Returns { value } or { error }. A GET, not a
 * POST: PostgREST serves a STABLE function on GET, and this guard carries an
 * admin credential, so it must hold no write verb at all.
 */
export async function ask({ url, serviceKey, fetchImpl = fetch }) {
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, '')}/rest/v1/rpc/${RPC}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' },
    })
    const text = await res.text()
    if (!res.ok) return { error: `HTTP ${res.status} ${text.slice(0, 160)}` }
    try {
      return { value: JSON.parse(text) }
    } catch {
      return { error: `unparseable answer ${text.slice(0, 80)}` }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*\/scripts\//, 'scripts/'))
if (isMain || (process.argv[1] && /event-lifecycle-installed\.mjs$/.test(process.argv[1]))) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const ref = /^https:\/\/([a-z0-9]+)\./.exec(url)?.[1] ?? 'no project'
  const canAsk = Boolean(url && REAL_PROJECT.test(url) && serviceKey)
  const answer = canAsk ? await ask({ url, serviceKey }) : { error: 'not asked' }
  const { verdict, reason } = decide({ url, serviceKey, answer })
  const flagsTrue = answer.value && typeof answer.value === 'object' ? REQUIRED_FLAGS.filter((f) => answer.value[f] === true).length : 0
  declareWork('event-lifecycle-installed', {
    did: { 'project URL read': 1, 'lifecycle probe sent': canAsk ? 1 : 0 },
    found: { 'enforcement flag answered true': flagsTrue },
    zeroIsFine: { 'lifecycle probe sent': 'no real project URL or no service key in this build; the SKIP below names which' },
  })
  console.log(`${TAG} ${verdict} - project ${ref}: ${reason}`)
  if (verdict === 'FAIL') process.exitCode = 1
}
