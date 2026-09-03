/**
 * EVERY COLUMN THAT STORES A COUNT OR A TOTAL OF ROWS IN ANOTHER TABLE.
 *
 * ============================================================================
 * THE CONTRACT (founder ruling, 25 August 2026)
 * ============================================================================
 *
 *   "Any column that stores a count or a total of rows in another table must
 *    either be maintained by a database trigger or not exist. Enumerate every
 *    such column, state for each whether it is trigger-maintained,
 *    application-maintained or unmaintained, and fix what can be fixed now."
 *
 * This file is that enumeration, and it is the SINGLE SOURCE for three things
 * that used to be three opinions:
 *
 *   1. scripts/guards/maintained-aggregates.mjs fails the build when a column is
 *      incremented in place and has no entry here.
 *   2. scripts/verify/aggregate-reconcile.mjs and /api/cron/aggregate-reconcile
 *      both read public.stored_aggregate_drift (migration 20260825000004) and
 *      report every disagreement, with the prose below attached to it.
 *   3. Anybody reading it learns what maintains each figure without grepping.
 *
 * ============================================================================
 * WHY A RECOMPUTE BEATS AN INCREMENT, EVERY TIME
 * ============================================================================
 *
 * An increment has to be correct on EVERY path that changes the underlying
 * rows, forever, including paths nobody thought of. A recompute has to be
 * correct once. `events.is_free` is the proof: its trigger fires on INSERT,
 * UPDATE and DELETE of ticket_tiers and recomputes from the whole set, and the
 * drift drive of 25 August 2026 found it following in both directions while six
 * increment-maintained figures did not.
 *
 * ============================================================================
 * THE FIELDS
 * ============================================================================
 *
 *   column        `table.column`, exactly as the guard's detector reports it.
 *   summarises    the table whose rows it claims to total, or null when it does
 *                 not summarise rows at all.
 *   maintenance   'trigger' | 'application' | 'unmaintained' | 'not-in-class'
 *   maintainedBy  prose naming the mechanism, so a reader can go and read it.
 *   reconciled    true when public.stored_aggregate_drift carries a branch for
 *                 it, so the recurring reconciliation can recount it. The
 *                 recount SQL lives in that VIEW, once, because it has two
 *                 callers on two transports (a direct-Postgres script and a
 *                 PostgREST cron) and writing it twice is the shape this whole
 *                 pass exists to remove.
 *   caveat        anything that makes the recount approximate, stated so a
 *                 disagreement is not read as a defect when it is a definition.
 *   decision      a dated ruling, where one exists.
 */

export const STORED_AGGREGATES = [
  /* ------------------------------------------------------------------ *
   * TRIGGER-MAINTAINED. The standard the rest are measured against.
   * ------------------------------------------------------------------ */
  {
    column: 'events.is_free',
    summarises: 'public.ticket_tiers',
    maintenance: 'trigger',
    maintainedBy:
      'trg_update_event_is_free, AFTER INSERT OR DELETE OR UPDATE on ticket_tiers, RECOMPUTES from the whole tier set (migration 20260101000001).',
    reconciled: true,
    caveat:
      'An event that has NEVER had a tier touched has never fired the trigger, so it keeps the INSERT default rather than the recomputed value. The recount and the trigger share one definition, COALESCE(MAX(price),0)=0, which is true over an empty tier set, so a tier-less event reads as disagreeing. Found by the first reconciliation run on 25 August 2026: 1 of 117 events on TEST. Whether "no tiers at all" should mean free is a product question and is NOT answered by silently changing the definition here.',
    decision: null,
  },
  {
    column: 'event_addons.sold_count',
    summarises: 'public.order_items',
    maintenance: 'trigger',
    maintainedBy:
      'trg_recompute_addon_sold_count on order_items and trg_recompute_addon_sold_counts_for_order on orders, both RECOMPUTE from confirmed order items (migration 20260825000001).',
    reconciled: true,
    caveat: null,
    decision:
      'Was written by NOTHING before 25 August 2026, while the checkout capped an addon at total_capacity minus it. A capped addon could be sold without limit.',
  },
  {
    column: 'organisations.total_event_count',
    summarises: 'public.events',
    maintenance: 'trigger',
    maintainedBy:
      'trg_recompute_org_event_count on events, AFTER INSERT OR DELETE OR UPDATE OF organisation_id, RECOMPUTES count(*) (migration 20260825000003).',
    reconciled: true,
    caveat: null,
    decision:
      'Until 25 August 2026 this was incremented by connect-ledger on the first confirmed order for an event and decremented by NOTHING, anywhere. The production purge deleted 46 events and the counter kept counting them. The increment is removed and a recompute trigger replaces it; the meaning changes from "events that ever sold" to "events", which is what the column name says and what nothing was reading anyway.',
  },

  /* ------------------------------------------------------------------ *
   * TRIGGER ON THE RELEASE PATH, DB FUNCTION ON THE ACQUIRE PATH.
   * ------------------------------------------------------------------ */
  {
    column: 'discount_codes.reserved_uses',
    summarises: 'public.discount_code_claims',
    maintenance: 'application',
    maintainedBy:
      'claim_discount_use increments it under the discount row lock; release_discount_claim and convert_discount_claim each decrement it, and BOTH are gated on a DELETE ... RETURNING from discount_code_claims so a release with nothing held is a no-op; release_expired_discount_claims sweeps holds whose reservation is no longer active, called by the reservation-expire cron beside release_expired_seat_reservations (migration 20260829000003).',
    reconciled: true,
    caveat:
      'It is derivable exactly: reserved_uses must equal the number of discount_code_claims rows for that code. The claims table is the source and the counter is the cache, so a drift is always the counter being wrong, never the table.',
    decision:
      'Added 29 August 2026 to close a money hole that 20260829000001 did not: current_uses only moves after an order is CONFIRMED, so two buyers who both read it as available were both GRANTED the discount and only one advanced the counter. The counter was bounded; the money was not, and for guests it was unbounded entirely because there is no user_id to count against. reserved_uses makes the cap current_uses + reserved_uses, which is the same sold_count + reserved_count shape the seat inventory already uses, so the hold refuses the next buyer BEFORE anybody has paid. Driven by scripts/verify/discount-claim-drive.mjs: eight simultaneous buyers at one remaining use, one winner.',
  },
  {
    column: 'ticket_tiers.reserved_count',
    summarises: 'public.reservations',
    maintenance: 'application',
    maintainedBy:
      'create_reservation increments it under a row lock; on_reservation_released, AFTER UPDATE OR DELETE on reservations, returns it (migration 20260825000001); the expire sweeper returns it on the expired path.',
    reconciled: true,
    caveat:
      'The acquire path is the capacity check that stops two buyers taking one seat, so it is a row-locked decision rather than a recompute. Rewriting it is the oversell path and belongs in its own pass.',
    decision:
      'The DELETE path drifted until 25 August 2026: the trigger was AFTER UPDATE only, so a deleted active reservation held its seats forever.',
  },

  /* ------------------------------------------------------------------ *
   * ACCEPTED AS THEY ARE, BY FOUNDER RULING, 25 AUGUST 2026.
   * Reconciled anyway, so a drift is visible while it is unfixed.
   * The ruling and the evidence: docs/perf/ACCEPTED-STORED-DRIFTS-2026-08-25.md
   * ------------------------------------------------------------------ */
  {
    column: 'ticket_tiers.sold_count',
    summarises: 'public.tickets',
    maintenance: 'application',
    maintainedBy: 'confirm_order increments under a row lock; reconcile_refund decrements.',
    reconciled: true,
    caveat:
      'For a RESERVED-SEATING event the truth lives in public.seats, not in tickets, so a disagreement on a seated tier may be a definition rather than a defect. Seeded demo tiers also carry a sold_count with no tickets behind it by construction.',
    decision:
      'FOUNDER RULING 25 August 2026: stays as it is. It is the oversell figure, held under a row lock, and rewriting how it is maintained belongs in its own pass rather than in an audit. Reconciled here so a drift is visible while it is unfixed.',
  },
  {
    column: 'discount_codes.current_uses',
    summarises: 'public.discount_code_usages',
    maintenance: 'application',
    maintainedBy: 'confirm_order increments it. NOTHING decrements it, anywhere.',
    reconciled: true,
    caveat: null,
    decision:
      'FOUNDER RULING 25 August 2026: stays as it is. When a discount is consumed is a checkout decision, not a cleanup. Driven 25 August 2026: deleting the order that consumed a code left current_uses at 1 against a truth of 0, so a code capped at 3 read 2 uses left when 3 were left. Reconciled here so that is visible.',
  },

  /* ------------------------------------------------------------------ *
   * DEFERRED, WITH THE REASON. Each needs a money-path function edited,
   * which is the same class the founder deferred for sold_count.
   * ------------------------------------------------------------------ */
  {
    column: 'organisations.total_volume_cents',
    summarises: 'public.orders',
    maintenance: 'application',
    maintainedBy:
      'recordOrderConfirmedLedger increments; reconcile_refund decrements by the refunded amount less processing.',
    reconciled: true,
    caveat:
      'A PARTIAL refund reduces the stored figure and leaves the order confirmed at its original total, so the recount is deliberately the gross of confirmed orders and will read higher than the stored value wherever a partial refund has happened. That is a definition difference, not drift; a whole-number gap on an organisation with no refunds is drift.',
    decision:
      'DEFERRED 25 August 2026. Converting it to a recompute changes its meaning on partial refunds and requires editing reconcile_refund, a live money-path function. Nothing reads it: every occurrence in src/ and in the migrations is a write or a CHECK constraint, and since 25 August 2026 src/lib/admin/organisers.ts counts the rows instead of rendering it.',
  },
  {
    column: 'organisations.hold_amount_cents',
    summarises: 'public.payout_holds',
    maintenance: 'application',
    maintainedBy:
      'recordOrderConfirmedLedger increments; reconcile_refund, the event-disbursement function and the chargeback function each adjust it.',
    reconciled: true,
    caveat:
      'The recount is unreleased reserve holds. A hold released by a path that clears released_at differently would read as a gap.',
    decision:
      'DEFERRED 25 August 2026. Four separate money-path writers, three of them SQL functions on the payout path. Nothing reads it: every occurrence is a write or a CHECK. Driven 25 August 2026: deleting the payout_hold rows it totals left it at 5000 against a truth of 0.',
  },

  /* ------------------------------------------------------------------ *
   * NOT IN THE CLASS. Listed rather than omitted, because a silently
   * excluded column is how an enumeration stops being one.
   * ------------------------------------------------------------------ */
  {
    column: 'tickets.scan_count',
    summarises: null,
    maintenance: 'not-in-class',
    maintainedBy: 'scan_ticket increments it in the same transaction as the ticket_scans audit row.',
    reconciled: false,
    caveat: null,
    decision:
      'NOT A SUMMARY OF ROWS. ticket_scans logs EVERY attempt including failures and not-founds; scan_count counts successful admits only. They answer different questions and neither is a copy of the other.',
  },
  {
    column: 'tier_access_codes.current_uses',
    summarises: null,
    maintenance: 'application',
    maintainedBy:
      'redeem_tier_access_codes increments it under a row lock, and refuses a code that has reached max_uses (migration 20260825000003).',
    reconciled: false,
    caveat:
      'There is no usages table for access codes, so there are no rows to recount against. It counts redemption EVENTS, which is why it is application-maintained rather than a recompute.',
    decision:
      'Found by the enumeration of 25 August 2026 rather than by anyone hitting it. NOTHING wrote this column: not a trigger, not a function, not a line of TypeScript. validateAccessCode refused a code when current_uses >= max_uses, so an organiser who capped a code at 50 had a code redeemable without limit. Fixed the same day.',
  },
  {
    column: 'organisations.founding_bonus_months',
    summarises: null,
    maintenance: 'not-in-class',
    maintainedBy: 'src/lib/founding/invites.ts, on a referral being accepted.',
    reconciled: false,
    caveat: null,
    decision:
      'NOT A SUMMARY OF ROWS. It is an AWARD: months granted to an organiser for a referral. There is no set of rows it claims to total, so there is nothing it can disagree with. Registered so the guard can say that out loud rather than fall silent on it.',
  },
  {
    column: 'payout_holds.amount_cents',
    summarises: null,
    maintenance: 'not-in-class',
    maintainedBy: 'reconcile_refund reduces the hold proportionally on a partial refund.',
    reconciled: false,
    caveat: null,
    decision:
      "NOT A SUMMARY OF ROWS. It is the hold row's OWN balance, not a total over other rows. organisations.hold_amount_cents is the figure that totals these, and that one IS reconciled above and does drift.",
  },
  {
    column: 'digest_sends.event_count',
    summarises: null,
    maintenance: 'not-in-class',
    maintainedBy: 'written once, by the send that created the row.',
    reconciled: false,
    caveat: null,
    decision:
      'A HISTORICAL RECORD of what one send contained, not a live aggregate. It is supposed to keep saying what was true at send time even after the events change.',
  },
  {
    column: 'digest_sends.recipient_count',
    summarises: null,
    maintenance: 'not-in-class',
    maintainedBy: 'written once, by the send that created the row.',
    reconciled: false,
    caveat: null,
    decision: 'Same as digest_sends.event_count: a log row.',
  },
  {
    column: 'discount_codes.max_uses',
    summarises: null,
    maintenance: 'not-in-class',
    maintainedBy: 'set by the organiser.',
    reconciled: false,
    caveat: null,
    decision: 'A LIMIT the organiser chooses, not a count of anything.',
  },
  {
    column: 'tier_access_codes.max_uses',
    summarises: null,
    maintenance: 'not-in-class',
    maintainedBy: 'set by the organiser.',
    reconciled: false,
    caveat: null,
    decision: 'A LIMIT the organiser chooses, not a count of anything.',
  },
]

/** Columns the guard must find an entry for when it sees an in-place increment. */
export const REGISTERED_COLUMNS = new Set(STORED_AGGREGATES.map(a => a.column))

/** Everything public.stored_aggregate_drift carries a branch for. */
export const RECONCILABLE = STORED_AGGREGATES.filter(a => a.reconciled)

/** A one-line verdict per column, for any reporter that wants it. */
export function verdictLines() {
  return STORED_AGGREGATES.map(
    a => `${a.maintenance.toUpperCase().padEnd(13)} ${a.column.padEnd(38)} ${a.summarises ?? '(summarises nothing)'}`,
  )
}
