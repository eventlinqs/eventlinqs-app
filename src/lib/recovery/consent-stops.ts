import { createAdminClient } from '@/lib/supabase/admin'
import { addressesStoppedForFacilitatedMail } from '@/lib/consent/facilitated-stop'
import { suppress, suppressedAddresses } from '@/lib/fillrate/read'

/**
 * THE SECOND HALF OF THE ADAPTER: EVENTLINQS TELLS THE ENGINE WHO HAS SAID STOP.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS CLOSES, measured on TEST on 20 September 2026.
 *
 * A person who unsubscribes is told, and `suppression_events` holds as the
 * evidence behind the sentence, that the withdrawal covers "every EventLinqs
 * facilitated message on every channel". The abandoned-checkout recovery sender
 * decided who to mail from `recovery_suppressions` and nothing else, so no
 * withdrawal ever reached it: not from the preferences page, not from the
 * digest unsubscribe page, not from the Gmail one-click button. Measured the
 * same day: 147 distinct people carried a suppression event, and
 * `recovery_suppressions` held 19 rows.
 *
 * The message that was still going out is commercial mail by the engine's own
 * account of itself. `deliver()` refuses to send one without an unsubscribe link
 * because "The Spam Act 2003 (Cth) requires a functional unsubscribe on every
 * commercial message".
 *
 * ---------------------------------------------------------------------------
 * WHY THE BRIDGE IS HERE AND NOT INSIDE THE ENGINE, which is the whole design.
 *
 * Close-out D2: "The engine reads the ledger and nothing else. It must never
 * import from, query, or reference an EventLinqs table, model or type. If it
 * cannot be pointed at a gym's ledger rows tomorrow with only a new adapter, it
 * is built wrong." `scripts/guards/fillrate-reads-only-the-ledger.mjs` holds
 * that with a declared allowlist of imports and of tables, and
 * `suppression_events`, `consent_events` and `marketing_tenants` are on neither.
 *
 * The obvious fix, teaching `suppressedAddresses()` to read the consent ledger,
 * would have broken the invariant that makes the engine worth having, and the
 * guard would have been right to refuse it. So the flow is inverted: the ENGINE
 * keeps owning its own suppression table and reading only that, and EVENTLINQS,
 * as the source system, is responsible for keeping it true. Point the engine at
 * a gym tomorrow and this file is replaced by that gym's equivalent; nothing
 * inside `src/lib/fillrate` changes. That is the same boundary
 * `src/lib/recovery/links.ts` already sits on.
 *
 * ---------------------------------------------------------------------------
 * WHY IT RUNS BEFORE EVERY SWEEP RATHER THAN AT THE MOMENT OF WITHDRAWAL.
 *
 * Writing the row inside the withdrawal path would have been fewer lines and
 * would have been wrong in three ways. It would have covered only withdrawals
 * taken AFTER the change, leaving the 147 people already on the ledger
 * unprotected for ever unless somebody remembered a backfill. It would have put
 * a write to the engine's table inside a consent transaction, so a failure
 * there either loses the stop or fails a person's unsubscribe. And it would have
 * needed repeating in every future path that can record a withdrawal.
 *
 * Reconciling before the sweep is self-healing instead: it is idempotent, it
 * covers every withdrawal however it was recorded and whenever, and the worst
 * case of a failed run is the run before it already having done the work. It
 * runs immediately before the only thing that reads the list, so the window in
 * which the two stores can disagree is the length of one sweep.
 *
 * IT ADDS AND NEVER REMOVES. A suppression in the engine's table that the
 * consent ledger has no record of is not a mistake to be tidied up: it is
 * somebody who pressed the recovery message's own stop link, which writes here
 * and not to the marketing ledger, or a bounce, or a complaint. Reconciling in
 * the other direction would silently re-subscribe all of them.
 */

/** What one reconciliation did, so a cron log says something a person can read. */
export interface ConsentStopSyncResult {
  /** Addresses the consent ledger says have stopped facilitated mail. */
  stopped: number
  /** Of those, the ones the engine did not already know about. */
  added: number
  /** Of those, the ones it already held. */
  alreadyHeld: number
}

/**
 * Copy every facilitated-marketing withdrawal into the engine's suppression
 * list. Safe to run at any time and on every sweep.
 *
 * THROWS RATHER THAN REPORTING A PARTIAL SYNC. Both reads underneath page and
 * throw on a failed page, and a half-copied stop list is the exact defect this
 * file exists to end: it would look like a successful reconciliation and would
 * leave named people mailable. The caller decides whether a sweep may proceed
 * without one; it may not, and `recovery-sweep` does not.
 */
export async function syncConsentStopsIntoRecovery(
  db = createAdminClient(),
): Promise<ConsentStopSyncResult> {
  const stopped = await addressesStoppedForFacilitatedMail(db)
  if (stopped.size === 0) return { stopped: 0, added: 0, alreadyHeld: 0 }

  const alreadyHeldSet = await suppressedAddresses(db)

  let added = 0
  let alreadyHeld = 0
  for (const address of stopped) {
    if (alreadyHeldSet.has(address)) {
      alreadyHeld += 1
      continue
    }
    /*
     * `unsubscribed` rather than a reason of its own, and that is a decision
     * about the reversal condition rather than about tidiness. `sendingRates`
     * counts the reasons on this table to decide whether the sequence should be
     * cut or stopped, and it counts `unsubscribed` and `complained` and ignores
     * anything else. A person who unsubscribed from EventLinqs marketing IS an
     * unsubscribe against this engine's sending reputation, and inventing a
     * fourth reason here would have hidden every one of them from the brake.
     */
    await suppress(address, 'unsubscribed', db)
    added += 1
  }

  return { stopped: stopped.size, added, alreadyHeld }
}
