/**
 * THE NUMBERS THE REVERSAL CONDITION IS JUDGED ON. Close-out D2.
 *
 *     "Track unsubscribe and complaint rates. Above 2 percent unsubscribes or
 *      0.1 percent complaints, cut to a single message at 2 hours and report.
 *      Above 0.3 percent complaints, stop all sends immediately and report."
 *
 * Measured, never configured. Both are counts out of the engine's own record of
 * what it sent, so the condition is evaluated by the build on every sweep rather
 * than by somebody remembering to look. `sequenceLengthFor` in `due.ts` turns
 * these three numbers into a sequence length, and that function is pure so every
 * boundary in the paragraph above can be executed by a test.
 *
 * WHY THE DENOMINATOR IS SENDS AND NOT PEOPLE. A rate per message is what a
 * sending reputation is actually judged on by the receiving side, and it is the
 * stricter of the two readings: three messages to one person who then complains
 * counts once against three rather than once against one.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { SOURCE_SYSTEM } from '@/lib/ledger/types'

type Db = ReturnType<typeof createAdminClient>

export type SendingRates = { sent: number; unsubscribed: number; complained: number }

export async function sendingRates(db: Db = createAdminClient()): Promise<SendingRates> {
  const [{ count: sent }, suppressions] = await Promise.all([
    db.from('recovery_sends').select('id', { count: 'exact', head: true }).eq('source_system', SOURCE_SYSTEM),
    db.from('recovery_suppressions').select('reason').eq('source_system', SOURCE_SYSTEM),
  ])

  let unsubscribed = 0
  let complained = 0
  for (const row of (suppressions.data ?? []) as Array<{ reason: string }>) {
    if (row.reason === 'unsubscribed') unsubscribed += 1
    else if (row.reason === 'complained') complained += 1
  }

  return { sent: sent ?? 0, unsubscribed, complained }
}

/**
 * HOW MANY ABANDONMENTS HAVE EVER BEEN RECORDED, which is the one number that
 * decides whether a holdout starts existing. `holdoutIsDue` in `due.ts` holds the
 * threshold; this reads the count it is compared against, so nobody has to
 * remember to check.
 */
export async function cumulativeAbandonments(db: Db = createAdminClient()): Promise<number> {
  const { count } = await db
    .from('ledger_entries')
    .select('id', { count: 'exact', head: true })
    .eq('source_system', SOURCE_SYSTEM)
    .eq('kind', 'demand')
    .eq('demand_action', 'checkout_abandoned')
  return count ?? 0
}
