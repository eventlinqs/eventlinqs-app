import { createAdminClient } from '@/lib/supabase/admin'
import { activateWaitlist } from '@/lib/fillrate/engine'
import { eventLinqsLinks } from '@/lib/recovery/links'
import { slotById } from '@/lib/fillrate/read'
import { HOLD_MINUTES } from '@/lib/fillrate/waitlist'

/**
 * WHEN A UNIT FREES UP, WHO IS TOLD. Close-out D2, the second of three.
 *
 * TWO HALVES, AND THE SPLIT IS THE WHOLE POINT.
 *
 *   THE INVENTORY HOLD is this platform's. `promote_waitlist` atomically moves
 *   waiting entries to `notified` and writes a `waitlist_notifications` row with
 *   an expiry, against a real event and a real ticket tier. Only a system that
 *   owns the inventory can do that, and it is unchanged: it was proven, it is on
 *   a money path, and D2 gave no reason to touch it.
 *
 *   THE MESSAGE is the recovery engine's. The engine reads the ledger, decides
 *   who is next in join order, records the offer against the exact
 *   `waitlist_join` row that authorised it, honours the suppression list, and
 *   writes to them in the slot's own vocabulary. Point it at a gym and the same
 *   code offers a class.
 *
 * WHY THERE IS EXACTLY ONE SENDER NOW. Until 11 September 2026 this file built
 * its own Resend client and composed its own email. Two senders for one freed
 * unit is two emails, so the composition and the send moved into the engine and
 * this file kept the half only it can do.
 *
 * A DEFECT THIS FIXED, which predates D2 and was never reported. The old sender
 * resolved the recipient through `profiles`, and skipped anybody it could not
 * find there with a bare `continue`. The ledger's `waitlist_join` row carries
 * the address that was actually used, so the engine reaches everybody who
 * joined, and a person the old path silently dropped now hears about their spot.
 *
 * Returns the number of entries the inventory hold promoted, unchanged, because
 * every caller counts released units with it.
 */
export async function promoteWaitlist(
  eventId: string,
  tierId: string,
  quantityAvailable: number,
  windowMinutes = HOLD_MINUTES
): Promise<number> {
  if (quantityAvailable <= 0) return 0

  const adminClient = createAdminClient()

  // 1. The inventory hold. Atomically finds waiting entries, sets status =
  //    'notified', and writes waitlist_notifications rows with
  //    expires_at = NOW() + windowMinutes.
  const { data: promotedCount, error: rpcError } = await adminClient.rpc('promote_waitlist', {
    p_event_id: eventId,
    p_ticket_tier_id: tierId,
    p_quantity_available: quantityAvailable,
    p_notification_window_minutes: windowMinutes,
  })

  if (rpcError) {
    console.error('[waitlist] promote_waitlist RPC error:', rpcError)
    return 0
  }

  const count = (promotedCount as number) ?? 0
  if (count === 0) return 0

  console.log(`[waitlist] promoted ${count} entries for event ${eventId} tier ${tierId}`)

  // 2. The message. Handed to the engine, which is the only sender.
  try {
    await tellTheWaitingList(eventId, tierId, count, windowMinutes)
  } catch (err) {
    /*
     * NEVER FATAL TO THE HOLD. The units are already held for these people and
     * the hold expires by its own clock, so a messaging outage costs a
     * notification, never an inventory state nobody can get out of. It speaks
     * rather than being swallowed: a waiting list that silently stops writing to
     * people is indistinguishable from a waiting list nobody is on.
     */
    console.error(`[waitlist] the recovery engine could not write to the list for event ${eventId}:`, err)
  }

  return count
}

/**
 * THE HANDOVER. Maps this platform's event to the ledger's slot and asks the
 * engine to do the rest.
 *
 * The slot is found by `source_ref`, which is the event's own id: that is the
 * one column the ledger keeps as a pointer back, and it is carried as data
 * rather than as a foreign key precisely so the ledger can outlive the table it
 * points at. No slot means this event predates the ledger, in which case there
 * is nobody in the engine's queue and there is nothing to send.
 */
async function tellTheWaitingList(
  eventId: string,
  tierId: string,
  unitsFree: number,
  windowMinutes: number,
): Promise<void> {
  const adminClient = createAdminClient()
  const { data: slotRow, error } = await adminClient
    .from('ledger_slots')
    .select('id')
    .eq('source_ref', eventId)
    .maybeSingle()
  if (error) throw new Error(`could not find the slot for event ${eventId}: ${error.message}`)
  if (!slotRow) {
    console.log(`[waitlist] event ${eventId} has no ledger slot, so the engine has nobody queued`)
    return
  }

  const slot = await slotById(String((slotRow as { id: string }).id))
  if (!slot) return

  const { data: tier } = await adminClient.from('ticket_tiers').select('name').eq('id', tierId).maybeSingle()
  const inventoryClass = (tier as { name: string | null } | null)?.name ?? null

  const result = await activateWaitlist(
    { slot, unitsFree, inventoryClass },
    eventLinqsLinks,
    new Date(),
  )
  console.log(
    `[waitlist] the engine offered ${result.offered}, released ${result.released} lapsed hold(s), failed ${result.failed}, window ${windowMinutes} minutes`,
  )
  for (const [reason, howMany] of Object.entries(result.passedOver)) {
    console.log(`[waitlist]   ${howMany} passed over: ${reason}`)
  }
}
