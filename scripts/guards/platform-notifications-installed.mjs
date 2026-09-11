/**
 * GUARD: THE OWNER CANNOT BE LEFT IN THE DARK BY THIS BUILD.
 *
 * THE INVARIANT, 10 September 2026 (close-out UX3). Five state changes must
 * write a notification record inside their own transaction, so that none of them
 * can complete unrecorded: a new organiser account, Stripe onboarding started,
 * Stripe charges enabled, an event published, and every paid order. The
 * enforcement is six database triggers plus the table they write to
 * (20260909000002_platform_notifications.sql).
 *
 * WHY A GUARD AND NOT A TEST. On 8 September 2026 a real outside organiser
 * signed up, built an event, set a price and published it on production, and the
 * owner received nothing. Every gate in this repository was green at the time,
 * and would have stayed green, because lint, typecheck, the suite and the build
 * read no database. A deploy onto a project where the migration never landed, or
 * where one trigger was dropped by hand, reproduces that silence exactly. This
 * refuses the build instead.
 *
 * HOW. One read-only RPC, platform_notification_guards(), added by
 * 20260909000003, which reads pg_trigger, pg_enum, pg_constraint, pg_class,
 * pg_proc and the information schema as SECURITY DEFINER and answers a jsonb of
 * named booleans. Granted to service_role and authenticated, never to anon, so
 * the guard uses the service key the build already holds, exactly as
 * event-lifecycle-installed and schema-ahead-of-code do.
 *
 *   PASS   every flag true
 *   FAIL   any flag false, naming each one and the migration to apply
 *   FAIL   the RPC does not exist (the migration is not applied) or errors
 *   SKIP   no real project URL (CI's typecheck build runs on a placeholder), or
 *          no service key to ask with, each stated by name
 *
 * Run standalone:  node --env-file=.env.local scripts/guards/platform-notifications-installed.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { declareWork } from '../lib/work-report.mjs'

const TAG = '[platform-notifications-installed]'
export const RPC = 'platform_notification_guards'
export const MIGRATIONS = [
  '20260909000002_platform_notifications.sql',
  '20260909000003_platform_notification_guards.sql',
]

/**
 * Every boolean the RPC must answer true. The six triggers are named
 * individually rather than counted, so a failure says WHICH state change went
 * silent instead of saying that one of them did.
 */
export const REQUIRED_FLAGS = [
  'table_present',
  'rls_enabled',
  'anon_cannot_read',
  'dedupe_unique',
  'kind_enum_complete',
  'state_enum_complete',
  'writer_is_security_definer',
  'trigger_organiser_created',
  'trigger_connect_transitions',
  'trigger_event_published',
  'trigger_event_published_insert',
  'trigger_order_paid',
  'trigger_order_paid_insert',
  'triggers_enabled',
]

/** What a reader needs to know when a flag comes back false. */
export const FLAG_MEANING = {
  table_present: 'platform_notifications does not exist, so nothing is being recorded at all',
  rls_enabled: 'row level security is off on platform_notifications, so the operations record is readable by any role holding a grant',
  anon_cannot_read: 'anon or authenticated holds a grant on platform_notifications, so one organiser could read the platform view of another',
  dedupe_unique: 'the dedupe_key unique constraint is gone, so a redelivered webhook can notify twice',
  kind_enum_complete: 'platform_notification_kind does not carry exactly the five kinds the close-out names',
  state_enum_complete: 'platform_notification_state does not carry the five delivery states',
  writer_is_security_definer: 'record_platform_notification is missing or is not SECURITY DEFINER, so a trigger firing under a caller without rights would silently record nothing',
  trigger_organiser_created: 'a new organiser account can be created with no record written',
  trigger_connect_transitions: 'Stripe onboarding can start, and charges can be enabled, with no record written',
  trigger_event_published: 'an event can be published with no record written',
  trigger_event_published_insert: 'an event can be inserted already published with no record written',
  trigger_order_paid: 'an order can be confirmed with no record written',
  trigger_order_paid_insert: 'an order can be inserted already confirmed with no record written',
  triggers_enabled: 'at least one platform_notify trigger is present but DISABLED, which looks installed and fires nothing',
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split(String.fromCharCode(10))) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

const REAL_PROJECT = /^https:\/\/[a-z0-9]{20,}\.supabase\.co\/?$/

/**
 * The decision, as a pure function of what the environment offers and what the
 * database answers, so the table above is testable without a network.
 */
export function decide({ url, serviceKey, answer }) {
  if (!url || !REAL_PROJECT.test(url)) {
    return {
      verdict: 'SKIP',
      reason: 'no real Supabase project URL in this build (CI typecheck uses a placeholder), nothing to ask',
    }
  }
  if (!serviceKey) {
    return {
      verdict: 'SKIP',
      reason: 'no SUPABASE_SERVICE_ROLE_KEY in this build, and the probe is not granted to anon',
    }
  }
  if (answer.error) {
    return {
      verdict: 'FAIL',
      reason: `${RPC}() could not be asked (${answer.error}); apply ${MIGRATIONS.join(' and ')} to this project`,
    }
  }
  const value = answer.value
  if (!value || typeof value !== 'object') {
    return {
      verdict: 'FAIL',
      reason: `${RPC}() answered ${JSON.stringify(value)} rather than its named flags; apply ${MIGRATIONS[1]}`,
    }
  }
  const failing = REQUIRED_FLAGS.filter((flag) => value[flag] !== true)
  if (failing.length === 0) {
    return {
      verdict: 'PASS',
      reason: `${REQUIRED_FLAGS.length} flags true: the five owner notifications cannot be bypassed on this project`,
    }
  }
  const detail = failing.map((f) => `${f} (${FLAG_MEANING[f] ?? 'no explanation recorded'})`).join('; ')
  return {
    verdict: 'FAIL',
    reason: `not in place: ${detail}. Apply ${MIGRATIONS.join(' and ')} to this project`,
  }
}

/**
 * Ask the project, read only. Returns { value } or { error }. A GET, not a POST:
 * PostgREST serves a STABLE function on GET, and this guard carries an admin
 * credential, so it must hold no write verb at all.
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

const invokedDirectly = process.argv[1] && /platform-notifications-installed\.mjs$/.test(process.argv[1])
if (invokedDirectly) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const ref = /^https:\/\/([a-z0-9]+)\./.exec(url)?.[1] ?? 'no project'
  const canAsk = Boolean(url && REAL_PROJECT.test(url) && serviceKey)
  const answer = canAsk ? await ask({ url, serviceKey }) : { error: 'not asked' }
  const { verdict, reason } = decide({ url, serviceKey, answer })
  const flagsTrue =
    answer.value && typeof answer.value === 'object'
      ? REQUIRED_FLAGS.filter((f) => answer.value[f] === true).length
      : 0
  declareWork('platform-notifications-installed', {
    did: { 'project URL read': 1, 'notification probe sent': canAsk ? 1 : 0 },
    found: { 'enforcement flag answered true': flagsTrue },
    zeroIsFine: {
      'notification probe sent':
        'no real project URL or no service key in this build; the SKIP below names which',
      'enforcement flag answered true':
        'the probe was not sent, so no flag was read; the SKIP below names why',
    },
  })
  console.log(`${TAG} ${verdict} - project ${ref}: ${reason}`)
  if (verdict === 'FAIL') process.exitCode = 1
}
