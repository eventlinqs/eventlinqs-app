import { createAdminClient } from '@/lib/supabase/admin'

/**
 * THE MONITOR'S MEMORY OF HOW LONG A STRIPE REQUIREMENT HAS BEEN WAITING.
 * Close-out S1. The only module that reads or writes
 * public.connect_requirement_watch, which a registered guard enforces.
 *
 * WHY IT HAS TO EXIST AT ALL. S1 asks for AMBER when "anything sits in
 * pending_verification for more than 3 days". Stripe publishes WHAT is pending
 * and never WHEN it started: the Account object carries no per-requirement
 * timestamp of any kind (https://docs.stripe.com/api/accounts/object, fetched
 * 2026-09-11), and `requirements.current_deadline` is Stripe's deadline for
 * `currently_due`, not an age for `pending_verification`. So either something on
 * this side remembers the first sighting or that rule cannot be answered and has
 * to be reported as not built. It is answered.
 *
 * WHY THE AGE AND NOT THE PRESENCE. pending_verification is the ORDINARY state
 * of an account whose document Stripe is currently reading. Reporting it on
 * sight would warn about every organiser who ever uploads identification, which
 * is precisely the failure S1 exists to remove.
 *
 * WHY A MONITOR IS ALLOWED TO WRITE HERE. The health layer's read-only contract
 * is stated in src/lib/health/payment-checks.ts as "READ-ONLY against the
 * payment engine ... nothing mutates orders, seats, or money", and this writes
 * to none of those. It writes only to the monitor's own scratch table, which
 * holds no money, no person and no decision. Every write is wrapped so that a
 * failure degrades the AGE to unknown and never the CHECK to broken: a monitor
 * that goes down because its notebook is full is worse than one with no
 * notebook.
 */

const BUCKET = 'pending_verification' as const
export const WATCH_TABLE = 'connect_requirement_watch' as const

/** accountId -> (requirement -> whole days the monitor has watched it wait). */
export type PendingAges = Map<string, Map<string, number>>

function wholeDaysSince(iso: string, now: number): number {
  const started = Date.parse(iso)
  if (!Number.isFinite(started)) return 0
  return Math.max(0, Math.floor((now - started) / 86_400_000))
}

/**
 * Record what is pending right now and return how long each has been pending.
 *
 * `observed` maps a connected account id to the requirement strings currently in
 * its `requirements.pending_verification`. An account present with an EMPTY list
 * is not the same as an account absent: present-and-empty means everything has
 * cleared and its rows must go, so a requirement that returns is timed from its
 * new beginning rather than from a wait that ended weeks ago.
 *
 * Never throws. On any database failure it returns the ages it managed to read,
 * which for a total failure is an empty map, and an unknown age is treated as
 * age zero by the caller. That fails towards silence on ONE amber clause rather
 * than towards a false alarm, which is the direction this whole item exists to
 * fail in.
 */
export async function observePendingVerification(
  observed: Map<string, string[]>,
  opts: { now?: number } = {},
): Promise<PendingAges> {
  const now = opts.now ?? Date.now()
  const ages: PendingAges = new Map()
  if (observed.size === 0) return ages

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (err) {
    console.warn(`[requirement-watch] no admin client, requirement ages unknown: ${String(err).slice(0, 120)}`)
    return ages
  }

  const nowIso = new Date(now).toISOString()
  const rows = [...observed.entries()].flatMap(([stripe_account_id, requirements]) =>
    requirements.map(requirement => ({ stripe_account_id, bucket: BUCKET, requirement, last_seen_at: nowIso })),
  )

  // Insert what is new and refresh what is not. first_seen_at is deliberately
  // absent from the payload: on conflict Postgres updates only the columns given,
  // so the original sighting stands. The database refuses to move it in any case
  // (trigger connect_requirement_watch_first_seen_fixed), because the invariant
  // matters more than this one caller's good behaviour.
  if (rows.length > 0) {
    const { error } = await admin
      .from(WATCH_TABLE)
      .upsert(rows, { onConflict: 'stripe_account_id,bucket,requirement' })
    if (error) {
      console.warn(`[requirement-watch] could not record what is pending: ${error.message}`)
    }
  }

  // Drop what has cleared, one account at a time, so an account whose list is
  // now empty is cleaned as thoroughly as one whose list merely shrank.
  for (const [accountId, requirements] of observed) {
    const clear = admin.from(WATCH_TABLE).delete().eq('stripe_account_id', accountId).eq('bucket', BUCKET)
    const { error } = requirements.length === 0
      ? await clear
      : await clear.not('requirement', 'in', `(${requirements.map(r => `"${r.replace(/"/g, '')}"`).join(',')})`)
    if (error) {
      console.warn(`[requirement-watch] could not clear resolved requirements for ${accountId}: ${error.message}`)
    }
  }

  const { data, error } = await admin
    .from(WATCH_TABLE)
    .select('stripe_account_id, requirement, first_seen_at')
    .eq('bucket', BUCKET)
    .in('stripe_account_id', [...observed.keys()])
  if (error) {
    console.warn(`[requirement-watch] could not read requirement ages: ${error.message}`)
    return ages
  }

  for (const row of data ?? []) {
    const perAccount = ages.get(row.stripe_account_id) ?? new Map<string, number>()
    perAccount.set(row.requirement, wholeDaysSince(row.first_seen_at, now))
    ages.set(row.stripe_account_id, perAccount)
  }
  return ages
}
