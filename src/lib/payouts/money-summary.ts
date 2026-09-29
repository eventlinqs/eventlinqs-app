/**
 * THE ORGANISER'S MONEY, READ FROM THE LEDGER. Close-out MONEY FIX B7.
 *
 *     "THE ORGANISER SEES THE SAME FACTS ON SCREEN: sales, refunds, payouts and
 *      next payout date on their dashboard, read from the ledger, never typed."
 *
 * WHY THE LEDGER AND NOT THE ORDERS. The organiser's home screen showed revenue
 * summed from `orders.total_cents`, which is what the BUYER paid, fee included,
 * and says nothing about what is owed onward, what came back out as refunds or
 * what has already left. organiser_balance_ledger is the record the money path
 * itself writes and pays from: the webhook credits the organiser's share on
 * `order_confirmed`, reconcile_refund debits `refund_from_balance` and
 * `refund_from_reserve`, and disburse_transfer debits `payout` when it claims an
 * event's funds for the transfer. Summing those rows is the same arithmetic the
 * disbursement uses (organiser_event_available_balance), so this screen and the
 * transfer cannot disagree about a cent.
 *
 * THE NEXT PAYOUT DATE IS THE CRON'S OWN RULE, NOT A SECOND ONE. The
 * event-disbursement cron (src/lib/payments/event-transfer.ts,
 * runEventDisbursements) transfers an event's held funds once the event has
 * ended and payout_schedule_days have passed, to an organisation whose
 * payout_status is active with a connected account, and never while the event
 * is postponed or cancelled (NON_DISBURSABLE_EVENT_STATUSES). This module states
 * that rule as a date: end_date plus the same buffer, read from the same pricing
 * rule through the same resolver, with the same fallback. A test holds the two
 * together by running the cron's query against a recording client.
 *
 * THE ROW CEILING. Every read is paged (readEveryRow), because an unbounded
 * select stops at 1,000 rows without an error, and an organiser past that line
 * would be shown a total that is quietly wrong in their own favour or against it.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { getPayoutScheduleDays } from '@/lib/payments/pricing-rules'
import { NON_DISBURSABLE_EVENT_STATUSES } from '@/lib/refunds/postponement'

/** v1 is AUD-only, mirrored from src/lib/payouts/queries.ts LEDGER_CURRENCY. */
export const MONEY_CURRENCY = 'AUD'

/** The cron's fallback when the pricing rule cannot be read (event-transfer.ts). */
export const DISBURSEMENT_BUFFER_FALLBACK_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

export const SALE_REASONS = ['order_confirmed'] as const
export const REFUND_REASONS = [
  'refund_from_balance',
  'refund_from_reserve',
  'refund_from_gateway',
  'refund_platform_float',
] as const
export const PAYOUT_REASONS = ['payout'] as const

export interface MoneyLedgerRow {
  event_id: string | null
  delta_cents: number
  reason: string
  reference_id: string | null
  /**
   * The refunds row a refund entry belongs to (metadata.refund_id, written by
   * reconcile_refund). One refund can write two rows, from the reserve and
   * from the balance, so refunds are counted by this and never by row.
   */
  refund_id?: string | null
}

export interface MoneyEvent {
  id: string
  title: string
  end_date: string | null
  status: string
  timezone: string | null
}

export type NextPayout =
  /** Due at a known instant: the event has ended plus the buffer, or will. */
  | { state: 'scheduled' | 'due'; dueAt: string; amountCents: number; eventId: string; eventTitle: string; timezone: string | null }
  /** Money is held for an event the cron will not pay while it stays in this status. */
  | { state: 'held_event'; amountCents: number; eventId: string; eventTitle: string; eventStatus: string }
  /** Money is held because the organisation cannot be paid yet. */
  | { state: 'held_setup'; amountCents: number }

export interface OrganiserMoneySummary {
  currency: string
  /** The organiser's share credited on each confirmed sale. */
  salesCents: number
  /** Orders those credits belong to. */
  salesCount: number
  /** What refunds took back out of the organiser's share, as a positive amount. */
  refundedCents: number
  refundCount: number
  /** What has been claimed for transfer to the organiser, as a positive amount. */
  paidOutCents: number
  /** Everything the platform still holds for the organiser, all events. */
  heldCents: number
  nextPayout: NextPayout | null
}

/**
 * When the cron will first transfer an event's funds: end_date plus the
 * buffer, in whole calendar days, exactly as runEventDisbursements compares
 * `end_date <= now - bufferDays`. Null when the event has no end date, which
 * the cron's `lte('end_date', ...)` never selects.
 */
export function disbursementDueAt(endDateIso: string | null, bufferDays: number): Date | null {
  if (!endDateIso) return null
  const end = Date.parse(endDateIso)
  if (!Number.isFinite(end)) return null
  return new Date(end + bufferDays * DAY_MS)
}

/** Pure: the four facts, from the ledger rows and the events they name. */
export function summariseMoney(input: {
  rows: MoneyLedgerRow[]
  events: MoneyEvent[]
  bufferDays: number
  canBePaid: boolean
  now: Date
}): OrganiserMoneySummary {
  const { rows, events, bufferDays, canBePaid, now } = input
  let salesCents = 0
  let refundedCents = 0
  let paidOutCents = 0
  const refunds = new Set<string>()
  const saleOrders = new Set<string>()
  const perEvent = new Map<string, number>()
  let heldCents = 0

  for (const row of rows) {
    const delta = Number(row.delta_cents)
    heldCents += delta
    if (row.event_id) perEvent.set(row.event_id, (perEvent.get(row.event_id) ?? 0) + delta)
    if ((SALE_REASONS as readonly string[]).includes(row.reason)) {
      salesCents += delta
      if (row.reference_id) saleOrders.add(row.reference_id)
    } else if ((REFUND_REASONS as readonly string[]).includes(row.reason)) {
      refundedCents -= delta
      // A row with no refund id still counts once, under its own key.
      refunds.add(row.refund_id ?? `row:${refunds.size}:${row.reason}:${delta}`)
    } else if ((PAYOUT_REASONS as readonly string[]).includes(row.reason)) {
      paidOutCents -= delta
    }
  }

  const byId = new Map(events.map((e) => [e.id, e]))
  const owed = [...perEvent.entries()].filter(([, cents]) => cents > 0)
  let nextPayout: NextPayout | null = null

  if (owed.length > 0 && !canBePaid) {
    nextPayout = { state: 'held_setup', amountCents: owed.reduce((s, [, c]) => s + c, 0) }
  } else if (owed.length > 0) {
    const held = (NON_DISBURSABLE_EVENT_STATUSES as readonly string[])
    let best: { due: Date; eventId: string; cents: number } | null = null
    let heldEvent: { eventId: string; cents: number; status: string } | null = null
    for (const [eventId, cents] of owed) {
      const event = byId.get(eventId)
      if (!event) continue
      if (held.includes(event.status)) {
        if (!heldEvent) heldEvent = { eventId, cents, status: event.status }
        continue
      }
      const due = disbursementDueAt(event.end_date, bufferDays)
      if (!due) continue
      if (!best || due.getTime() < best.due.getTime()) best = { due, eventId, cents }
    }
    if (best) {
      const event = byId.get(best.eventId)!
      nextPayout = {
        state: best.due.getTime() <= now.getTime() ? 'due' : 'scheduled',
        dueAt: best.due.toISOString(),
        amountCents: best.cents,
        eventId: best.eventId,
        eventTitle: event.title,
        timezone: event.timezone,
      }
    } else if (heldEvent) {
      nextPayout = {
        state: 'held_event',
        amountCents: heldEvent.cents,
        eventId: heldEvent.eventId,
        eventTitle: byId.get(heldEvent.eventId)!.title,
        eventStatus: heldEvent.status,
      }
    }
  }

  return {
    currency: MONEY_CURRENCY,
    salesCents,
    salesCount: saleOrders.size,
    refundedCents,
    refundCount: refunds.size,
    paidOutCents,
    heldCents,
    nextPayout,
  }
}

/** The buffer the cron uses, read the way the cron reads it. */
export async function disbursementBufferDays(): Promise<number> {
  try {
    return await getPayoutScheduleDays('AU', 'AUD')
  } catch {
    return DISBURSEMENT_BUFFER_FALLBACK_DAYS
  }
}

/**
 * Read and summarise one organisation's money. The caller has already proved
 * the viewer owns `organisationId`; the client is the service role because the
 * ledger carries no organiser read policy.
 */
export async function getOrganiserMoneySummary(
  admin: SupabaseClient,
  organisationId: string,
  now: Date = new Date(),
): Promise<OrganiserMoneySummary> {
  const rows = await readEveryRow<MoneyLedgerRow>(
    'this organisation’s ledger rows',
    (from, to) =>
      admin
        .from('organiser_balance_ledger')
        .select('event_id, delta_cents, reason, reference_id, refund_id:metadata->>refund_id')
        .eq('organisation_id', organisationId)
        .eq('currency', MONEY_CURRENCY)
        .order('id', { ascending: true })
        .range(from, to),
  )

  const eventIds = [...new Set(rows.map((r) => r.event_id).filter((id): id is string => Boolean(id)))]
  const events: MoneyEvent[] = []
  for (const chunk of chunkInFilterValues(eventIds)) {
    const page = await readEveryRow<MoneyEvent>(
      'the events that money belongs to',
      (from, to) =>
        admin
          .from('events')
          .select('id, title, end_date, status, timezone')
          .in('id', chunk)
          .order('id', { ascending: true })
          .range(from, to),
    )
    events.push(...page)
  }

  const { data: org, error: orgError } = await admin
    .from('organisations')
    .select('payout_status, stripe_account_id')
    .eq('id', organisationId)
    .maybeSingle()
  if (orgError) throw new Error(`could not read the organisation's payout posture: ${orgError.message}`)
  const canBePaid = org?.payout_status === 'active' && Boolean(org?.stripe_account_id)

  return summariseMoney({ rows, events, bufferDays: await disbursementBufferDays(), canBePaid, now })
}
