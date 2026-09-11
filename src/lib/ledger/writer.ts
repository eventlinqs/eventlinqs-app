/**
 * THE ENGINE'S WRITER. Close-out D1.
 *
 * It hands a slot and an entry to `public.record_ledger_entry` and nothing else.
 * It knows no industry vocabulary and it never will: everything it receives is
 * already in the ledger's own language, and the mapping that produced it lives
 * in `adapter.ts`, which is the only file in this directory allowed to speak the
 * source system's terms.
 *
 * WHY IT NEVER THROWS INTO ITS CALLER. Every call site is on somebody's money:
 * a confirmed order, a refund, a checkout. If a ledger write could raise, an
 * outage in the analytics half would become a sale that failed, and this table
 * is worth exactly nothing measured against somebody's purchase. So a failure is
 * REPORTED and swallowed, never propagated.
 *
 * THAT IS NOT A HOLE. The guarantee is not "the write cannot fail", it is "a
 * failure is never silent and never costs a sale". A swallowed failure is
 * counted, logged with its cause, and reported to the error sink, and the drive
 * reads the rows back rather than trusting the return value.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { SOURCE_SYSTEM, type Entry, type Slot } from './types'

/** What a write attempt did, for a caller that wants to know and a drive that must. */
export type WriteOutcome =
  | { ok: true; id: number | null; duplicate: boolean }
  | { ok: false; reason: string }

/** The shape `record_ledger_entry` reads. Kept beside the SQL that reads it. */
function slotPayload(slot: Slot): Record<string, unknown> {
  return {
    source_system: slot.sourceSystem || SOURCE_SYSTEM,
    source_ref: slot.sourceRef,
    organisation_id: slot.organisationId,
    category: slot.category,
    subcategory: slot.subcategory,
    capacity: slot.capacity ?? '',
    on_sale_at: slot.onSaleAt ?? '',
    slot_at: slot.slotAt,
    postcode: slot.postcode ?? '',
  }
}

function entryPayload(entry: Entry): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind: entry.kind,
    occurrence_key: entry.occurrenceKey,
  }
  const put = (key: string, value: unknown) => {
    if (value === undefined || value === null) return
    out[key] = value
  }
  put('occurred_at', entry.occurredAt)
  put('inventory_class', entry.inventoryClass)
  put('inventory_class_ref', entry.inventoryClassRef)
  put('quantity', entry.quantity)
  put('amount_cents', entry.amountCents)
  put('unit_amount_cents', entry.unitAmountCents)
  put('referrer', entry.referrer)
  put('utm_source', entry.utmSource)
  put('utm_medium', entry.utmMedium)
  put('utm_campaign', entry.utmCampaign)
  put('device', entry.device)
  put('buyer_hash', entry.buyerHash)
  if (entry.returningBuyer !== undefined && entry.returningBuyer !== null) {
    out.returning_buyer = entry.returningBuyer
  }
  put('old_price_cents', entry.oldPriceCents)
  put('new_price_cents', entry.newPriceCents)
  put('inventory_action', entry.inventoryAction)
  put('demand_action', entry.demandAction)
  put('visitor_hash', entry.visitorHash)
  put('contact_email', entry.contactEmail)
  put('final_sold', entry.finalSold)
  put('final_revenue_cents', entry.finalRevenueCents)
  put('fill_percent', entry.fillPercent)
  put('attended', entry.attended)
  put('no_shows', entry.noShows)
  return out
}

export { slotPayload, entryPayload }

/**
 * Write one row. Idempotent on the occurrence key, so a retry is free and a
 * redelivered message is not a second sale.
 */
export async function write(slot: Slot, entry: Entry): Promise<WriteOutcome> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('record_ledger_entry', {
      p_slot: slotPayload(slot),
      p_entry: entryPayload(entry),
    })
    if (error) {
      report(`${entry.kind} ${entry.occurrenceKey}`, error.message)
      return { ok: false, reason: error.message }
    }
    // null means the occurrence key was already there, which is the idempotent
    // path and is a success, not a fault.
    return { ok: true, id: typeof data === 'number' ? data : null, duplicate: data === null }
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    report(`${entry.kind} ${entry.occurrenceKey}`, reason)
    return { ok: false, reason }
  }
}

/**
 * SAY SO, TWICE: on the console, and to the error sink.
 *
 * The sink is reached by a DYNAMIC import, for two reasons and neither is
 * stylistic. It keeps the error SDK off this module's import graph, which
 * matters because this module is reached from the checkout path. And it lets the
 * same code run outside the framework: the backfill loads this file through a
 * plain Node loader, where a static `@sentry/nextjs` import fails at module
 * instantiation and takes the whole script with it. Measured, on the first run
 * of the backfill.
 *
 * A sink that cannot be loaded is REPORTED on the console rather than swallowed:
 * the console line above has already carried the real fault, and losing the
 * second channel must not hide the first.
 *
 * EXPORTED so the adapter reports its own faults down the same two channels.
 * The guarantee this file states is that a ledger fault never costs a sale, and
 * a guarantee that only covered the final INSERT would be worth nothing: every
 * recorder reads a row or two before it gets there, and a read that throws
 * would reach the caller just the same.
 */
export function report(what: string, why: string): void {
  console.error(`[ledger] refused to record ${what}: ${why}`)
  void import('@/lib/observability/sentry')
    .then(({ captureException }) => {
      captureException(new Error(`ledger write failed: ${what}: ${why}`), { area: 'ledger' })
    })
    .catch(sinkError => {
      console.error(
        `[ledger] and the error sink could not be reached to report it: ${
          sinkError instanceof Error ? sinkError.message : String(sinkError)
        }`,
      )
    })
}
