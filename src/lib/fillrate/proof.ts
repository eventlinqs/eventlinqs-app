/**
 * WHAT THE ENGINE ACTUALLY RECOVERED. Close-out D2, the third of three.
 *
 *     "On the organiser dashboard: how many abandoned, how many emailed, how
 *      many returned, and revenue recovered in dollars. This panel is the
 *      product. It is what a future standalone Fillrate customer pays for."
 *
 * FOUR NUMBERS, AND EVERY ONE OF THEM IS COUNTED RATHER THAN ESTIMATED.
 *
 *   abandoned   demand rows on this slot with `checkout_abandoned` and an address
 *   emailed     rows in the engine's own send record for this slot
 *   returned    people who were emailed and then bought, in that order
 *   recovered   the money on those sales, in cents
 *
 * HOW "RETURNED" IS ESTABLISHED, and why it is not a click.
 *
 * A click is a measurement of a link, not of a sale: it counts a person who
 * opened the message on their phone, forwarded it to themselves and bought on a
 * laptop as nothing, and it counts a mail scanner as a person. So a recovery is
 * a SALE row on the same slot, whose `buyer_hash` matches the address the engine
 * wrote to, occurring AFTER the message went. Nothing about it depends on a
 * cookie, a redirect or a parameter surviving a paste.
 *
 * WHY IT IS DELIBERATELY THE LOOSER OF THE TWO READINGS, stated so nobody
 * later reads it as more than it is. It is post hoc: somebody who was going to
 * buy anyway and happened to be emailed first counts as recovered. The close-out
 * says so and says what fixes it: "Do NOT build a holdout yet. At current volume
 * it would withhold from two or three people and prove nothing. Add it
 * automatically at 300 cumulative abandonments." That number is
 * `HOLDOUT_THRESHOLD_ABANDONMENTS` in `due.ts`, and `holdoutDue` below is the
 * build watching for it. Until then this is a RAW recovery rate and the panel
 * calls it one.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { identityHash } from '@/lib/ledger/identity'
import { SOURCE_SYSTEM } from '@/lib/ledger/types'
import { HOLDOUT_THRESHOLD_ABANDONMENTS, holdoutIsDue } from './due'

/** Re-exported so the panel can name the threshold without a second literal. */
export { HOLDOUT_THRESHOLD_ABANDONMENTS }

type Db = ReturnType<typeof createAdminClient>

export type RecoveryProof = {
  abandoned: number
  emailed: number
  /** Distinct people written to, which is what a recovery rate is out of. */
  peopleEmailed: number
  returned: number
  recoveredCents: number
  /** Offers made from the waiting list, and how they ended. */
  offered: number
  claimed: number
  lapsed: number
  /** True once the engine has enough history for a holdout to mean anything. */
  holdoutDue: boolean
  cumulativeAbandonments: number
}

export const EMPTY_PROOF: RecoveryProof = {
  abandoned: 0,
  emailed: 0,
  peopleEmailed: 0,
  returned: 0,
  recoveredCents: 0,
  offered: 0,
  claimed: 0,
  lapsed: 0,
  holdoutDue: false,
  cumulativeAbandonments: 0,
}

/**
 * The four numbers for ONE slot, read out of the ledger and the engine's own
 * record, and nothing else.
 */
export async function proofForSlot(
  slotId: string,
  db: Db = createAdminClient(),
  now: Date = new Date(),
): Promise<RecoveryProof> {
  const [abandonRows, sendRows, saleRows, holdRows] = await Promise.all([
    db
      .from('ledger_entries')
      .select('contact_email')
      .eq('slot_id', slotId)
      .eq('kind', 'demand')
      .eq('demand_action', 'checkout_abandoned')
      .not('contact_email', 'is', null),
    db.from('recovery_sends').select('contact_email, sent_at').eq('slot_id', slotId),
    db
      .from('ledger_entries')
      .select('buyer_hash, amount_cents, occurred_at')
      .eq('slot_id', slotId)
      .eq('kind', 'sale')
      .not('buyer_hash', 'is', null),
    db.from('recovery_holds').select('claimed_at, released_at, expires_at').eq('slot_id', slotId),
  ])

  const abandoned = (abandonRows.data ?? []).length
  const sends = (sendRows.data ?? []) as Array<{ contact_email: string; sent_at: string }>
  const sales = (saleRows.data ?? []) as Array<{ buyer_hash: string; amount_cents: number | null; occurred_at: string }>
  const holds = (holdRows.data ?? []) as Array<{
    claimed_at: string | null
    released_at: string | null
    expires_at: string
  }>

  /*
   * THE EARLIEST MESSAGE PER PERSON, because a recovery is a sale after the
   * FIRST message rather than after the last. Using the last would refuse to
   * count somebody who came back between message two and message three, which is
   * exactly the behaviour the sequence is built to produce.
   */
  const firstSentByHash = new Map<string, number>()
  const peopleEmailed = new Set<string>()
  for (const send of sends) {
    const address = send.contact_email.trim().toLowerCase()
    peopleEmailed.add(address)
    const fingerprint = identityHash(address)
    if (!fingerprint) continue
    const at = Date.parse(send.sent_at)
    if (!Number.isFinite(at)) continue
    const existing = firstSentByHash.get(fingerprint)
    if (existing === undefined || at < existing) firstSentByHash.set(fingerprint, at)
  }

  const returnedHashes = new Set<string>()
  let recoveredCents = 0
  for (const sale of sales) {
    const sentAt = firstSentByHash.get(sale.buyer_hash)
    if (sentAt === undefined) continue
    const boughtAt = Date.parse(sale.occurred_at)
    if (!Number.isFinite(boughtAt) || boughtAt < sentAt) continue
    returnedHashes.add(sale.buyer_hash)
    recoveredCents += typeof sale.amount_cents === 'number' ? sale.amount_cents : 0
  }

  let claimed = 0
  let lapsed = 0
  for (const hold of holds) {
    if (hold.claimed_at) claimed += 1
    else if (hold.released_at || Date.parse(hold.expires_at) <= now.getTime()) lapsed += 1
  }

  const { count: cumulative } = await db
    .from('ledger_entries')
    .select('id', { count: 'exact', head: true })
    .eq('source_system', SOURCE_SYSTEM)
    .eq('kind', 'demand')
    .eq('demand_action', 'checkout_abandoned')

  const cumulativeAbandonments = cumulative ?? 0

  return {
    abandoned,
    emailed: sends.length,
    peopleEmailed: peopleEmailed.size,
    returned: returnedHashes.size,
    recoveredCents,
    offered: holds.length,
    claimed,
    lapsed,
    holdoutDue: holdoutIsDue(cumulativeAbandonments),
    cumulativeAbandonments,
  }
}

/**
 * The same four numbers, found by the SOURCE SYSTEM's own identifier rather than
 * by the ledger's slot id, because that is what a page has in its hands.
 *
 * A source ref with no slot returns null rather than a row of zeros. Something
 * that predates the ledger has not recovered nothing; there was nothing there to
 * measure, and the panel says one of those and not the other.
 */
export async function proofForSourceRef(
  sourceRef: string,
  db: Db = createAdminClient(),
  now: Date = new Date(),
): Promise<RecoveryProof | null> {
  const { data: slot, error } = await db
    .from('ledger_slots')
    .select('id')
    .eq('source_system', SOURCE_SYSTEM)
    .eq('source_ref', sourceRef)
    .maybeSingle()
  if (error) throw new Error(`the engine could not find a slot for ${sourceRef}: ${error.message}`)
  if (!slot) return null
  return proofForSlot(String((slot as { id: string }).id), db, now)
}
