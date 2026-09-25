import 'server-only'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAndStoreOrder } from './store'

/**
 * THE BACKSTOP. The attribution invariant heals itself, on a schedule.
 *
 * WHY THIS EXISTS, and it is a defect found in GA3's own work rather than a new
 * feature. GA3 states the invariant: every order carries exactly one stored
 * decision, including the ones no campaign produced, because "an order with no
 * record is a sale nobody can account for six months later, and it is invisible
 * to every report because reports join". A registered blocking guard checks it
 * on every build.
 *
 * A GUARD IS NOT A GUARANTEE. The guard reads whatever database the build
 * environment points at; in CI that is a placeholder with nothing behind it, so
 * it SKIPS; on production nothing runs it at all. So on the one database where
 * the invariant is money, the only thing defending it was the write-time path,
 * and that path can miss in three ways that nothing would ever notice:
 *
 *   1. `resolveAndStoreOrder` catches every error and returns null. A dropped
 *      packet on any one of its six reads leaves the order with no record, for
 *      ever, and the buyer's purchase succeeds so nobody looks.
 *   2. It runs in `afterResponse`, after the response has been sent. A process
 *      that is recycled between the response and the callback loses it silently.
 *   3. `marketing_attribution_capture_enabled` off means no clicks are read; an
 *      order written while a deploy is mid-flight can miss the writer entirely.
 *
 * The healer already existed as an ops script somebody runs when a build goes
 * red. That is a person standing in for a product guarantee. This is the same
 * repair, scheduled, so the invariant is true because the platform keeps it
 * true rather than because a build noticed.
 *
 * IT READS THE SAME DEFINITION THE GUARD READS. Both ask
 * `public.marketing_attribution_invariant_breaches` what is unrecorded. There
 * is exactly one definition of a breach, in SQL, so the gate and the healer can
 * never disagree about what needs repairing.
 *
 * IT REPAIRS THROUGH THE SAME RESOLVER THE REQUEST USES. `resolveAndStoreOrder`
 * is the one per-order path, so a healed record is identical to one written at
 * checkout, carrying the same model name and version. A second implementation
 * of the decision would be a second answer to argue with on an invoice.
 *
 * IT NEVER REPORTS SUCCESS WHEN IT COULD NOT LOOK. Every read throws. A cron
 * that answers "nothing to heal" because the database was unreachable is the
 * exact shape this repository has spent weeks removing, and it would be worse
 * here than elsewhere, because the thing it hides is a gap in an invoice.
 *
 * IT VERIFIES BY OBSERVING, NOT BY TRUSTING ITS OWN CALL. After repairing it
 * re-asks the view, so "healed" means the row is there, not that a write
 * returned without an error.
 */

/**
 * THE GRACE, and it is correctness rather than leniency.
 *
 * The signal is written inside the request and the RESOLUTION is handed to
 * `afterResponse`, deliberately: six reads are not something a buyer should
 * wait on to be told about their own purchase. So between the order insert and
 * the resolver finishing there is a window, BY DESIGN, in which an order
 * genuinely has no record and nothing is wrong.
 *
 * THIS IS THE ONE PLACE THAT NUMBER IS WRITTEN DOWN. The build guard that fails
 * on the same invariant reads it out of this file rather than carrying its own
 * copy, so the gate and the healer tolerate exactly the same window. Two
 * numbers would eventually differ, and the failure that produces is a build
 * that reds on an order the healer was deliberately leaving alone.
 */
export const RESOLUTION_GRACE_MS = 5 * 60 * 1000

/**
 * The most orders one run will repair. A cap rather than an unbounded loop,
 * because each repair is a handful of reads and a cron that grows without limit
 * is a cron that will one day be killed mid-run and heal nothing at all. When
 * the cap is hit the result SAYS so, so a backlog is visible rather than
 * absorbed into a number that always looks the same.
 */
export const BACKSTOP_MAX_PER_RUN = 500

/** The breach clause this heals. The other three are faults, not gaps. */
export const NO_RECORD_BREACH = 'order has no attribution record'

export interface BackstopResult {
  /** Orders the view reports with no attribution record, before any repair. */
  unrecorded: number
  /** Of those, the ones still inside the resolution window and left alone. */
  withinGrace: number
  /** Orders this run tried to repair. */
  attempted: number
  /** Of those, the ones the view then confirmed carry a record. */
  healed: number
  /** References of the orders that are still unrecorded after the attempt. */
  unhealed: string[]
  /** True when there were more to repair than one run will take. */
  capped: boolean
}

interface BreachRow {
  order_id: string | null
  order_reference: string | null
}

async function unrecordedOrders(): Promise<BreachRow[]> {
  const admin = createAdminClient()
  /*
   * EVERY BREACH, NOT THE FIRST THOUSAND. This is the list of orders with no
   * attribution record at all, and the backstop heals exactly what it reads:
   * a truncated read leaves the remainder unrecorded for ever while reporting
   * that it healed everything it found.
   */
  const data = await readEveryRow('marketing_attribution_invariant_breaches', (from, to) =>
    admin
      .from('marketing_attribution_invariant_breaches')
      .select('order_id, order_reference')
      .eq('breach', NO_RECORD_BREACH)
      .order('order_id', { ascending: true })
      .range(from, to),
  )
  return data.filter((row): row is BreachRow & { order_id: string } => Boolean(row.order_id))
}

/**
 * Repair every order that has no attribution record and is past the resolution
 * window. Throws rather than reporting an empty answer when it cannot read.
 */
export async function healUnrecordedOrders(now: Date = new Date()): Promise<BackstopResult> {
  const breaches = await unrecordedOrders()
  if (breaches.length === 0) {
    return { unrecorded: 0, withinGrace: 0, attempted: 0, healed: 0, unhealed: [], capped: false }
  }

  const admin = createAdminClient()
  const ids = breaches.map(row => row.order_id as string)
  const cutoff = new Date(now.getTime() - RESOLUTION_GRACE_MS).toISOString()

  const young = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin
      .from('orders')
      .select('id')
      .in('id', ids.slice(i, i + 200))
      .gt('created_at', cutoff)
      // Keyed by id, so at most the 200 asked for.
      .limit(200)
    if (error) throw new Error(`orders read failed: ${error.message}`)
    for (const row of data ?? []) young.add(row.id)
  }

  const due = breaches.filter(row => !young.has(row.order_id as string))
  const capped = due.length > BACKSTOP_MAX_PER_RUN
  const batch = capped ? due.slice(0, BACKSTOP_MAX_PER_RUN) : due

  for (const row of batch) {
    // resolveAndStoreOrder never throws by design; the confirmation below is
    // what decides whether it worked, so its return value is not the evidence.
    await resolveAndStoreOrder(row.order_id as string)
  }

  const stillMissing = new Set((await unrecordedOrders()).map(row => row.order_id as string))
  const unhealed = batch
    .filter(row => stillMissing.has(row.order_id as string))
    .map(row => row.order_reference ?? (row.order_id as string))

  return {
    unrecorded: breaches.length,
    withinGrace: young.size,
    attempted: batch.length,
    healed: batch.length - unhealed.length,
    unhealed,
    capped,
  }
}
