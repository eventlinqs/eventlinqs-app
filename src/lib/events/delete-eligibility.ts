/**
 * MAY THIS EVENT BE DELETED? The interface's half of a rule the database owns.
 *
 * THE RULE (docs/EVENT-LIFECYCLE.md, close-out C13.2): delete is offered, and
 * permitted, only when the event has NEVER had a payment record of any kind.
 * Free tickets count as tickets, as Humanitix treats them. The records:
 *
 *   orders (any status), tickets (any status), paid squad members, discount
 *   code redemptions, refund requests, refunds.
 *
 * THE DATABASE ENFORCES IT. `refuse_event_delete_with_money()` is a BEFORE
 * DELETE trigger on events (migration 20260906000002). It fires for every role,
 * the service role and the admin console included, and there is no override.
 * This module never decides the delete; it reads the SAME count the trigger
 * reads (`event_money_record_counts`, one SQL function, one rule) so that the
 * button the organiser sees and the refusal the database gives cannot disagree.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: restate the rule in TypeScript by
 * counting tables itself. Two definitions of "a money record" is how a button
 * appears for an event the database then refuses, or worse, the reverse.
 */

export interface MoneyRecordCounts {
  orders: number
  tickets: number
  squad_members_paid: number
  discount_code_usages: number
  refund_requests: number
  refunds: number
  total: number
}

const COUNT_KEYS = [
  'orders',
  'tickets',
  'squad_members_paid',
  'discount_code_usages',
  'refund_requests',
  'refunds',
  'total',
] as const

/** What each non-zero count is called in the organiser's own words. */
const REASONS: Record<Exclude<keyof MoneyRecordCounts, 'total'>, (n: number) => string> = {
  orders: (n) => `${n} order${n === 1 ? '' : 's'}`,
  tickets: (n) => `${n} issued ticket${n === 1 ? '' : 's'}`,
  squad_members_paid: (n) => `${n} paid squad member${n === 1 ? '' : 's'}`,
  discount_code_usages: (n) => `${n} discount code redemption${n === 1 ? '' : 's'}`,
  refund_requests: (n) => `${n} refund request${n === 1 ? '' : 's'}`,
  refunds: (n) => `${n} refund${n === 1 ? '' : 's'}`,
}

export interface DeleteEligibility {
  deletable: boolean
  /** The non-zero counts, in words, for the sentence that explains a hidden Delete. */
  reasons: string[]
  counts: MoneyRecordCounts
}

/**
 * Turn the RPC's jsonb into typed counts, REFUSING a malformed shape. A missing
 * key must never read as zero: that is the one mistake that would offer Delete
 * on an event with orders.
 */
export function moneyCountsFromRpc(value: unknown): MoneyRecordCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('event_money_record_counts returned no object')
  }
  const out = {} as Record<(typeof COUNT_KEYS)[number], number>
  for (const key of COUNT_KEYS) {
    const raw = (value as Record<string, unknown>)[key]
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`event_money_record_counts.${key} is not a count: ${String(raw)}`)
    }
    out[key] = n
  }
  return out
}

/** The pure judgement. Deletable exactly when every count is zero. */
export function judgeDeleteEligibility(counts: MoneyRecordCounts): DeleteEligibility {
  const reasons: string[] = []
  for (const key of COUNT_KEYS) {
    if (key === 'total') continue
    const n = counts[key]
    if (n > 0) reasons.push(REASONS[key](n))
  }
  return { deletable: counts.total === 0 && reasons.length === 0, reasons, counts }
}

/** The sentence beside a hidden Delete control. */
export function deleteRefusalSentence(eligibility: DeleteEligibility): string {
  if (eligibility.deletable) return ''
  return `This event has ${eligibility.reasons.join(', ')}, so it cannot be deleted. Archive it instead.`
}

/**
 * The narrowest client shape this needs: any Supabase client with `.rpc`.
 * Structural on purpose, for the same TS2589 reason revalidate-event.ts gives.
 */
export interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

/** One event's counts, from the one SQL definition. Throws rather than guessing. */
export async function readMoneyRecordCounts(client: RpcClient, eventId: string): Promise<MoneyRecordCounts> {
  const { data, error } = await client.rpc('event_money_record_counts', { p_event_id: eventId })
  if (error) throw new Error(`event_money_record_counts failed: ${error.message}`)
  return moneyCountsFromRpc(data)
}

/** Many events' counts in one round trip, keyed by event id. Missing ids are absent, never zero. */
export async function readMoneyRecordCountsMany(
  client: RpcClient,
  eventIds: readonly string[],
): Promise<Map<string, MoneyRecordCounts>> {
  const out = new Map<string, MoneyRecordCounts>()
  if (eventIds.length === 0) return out
  const { data, error } = await client.rpc('event_money_record_counts_many', { p_event_ids: [...eventIds] })
  if (error) throw new Error(`event_money_record_counts_many failed: ${error.message}`)
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('event_money_record_counts_many returned no object')
  }
  for (const [id, counts] of Object.entries(data as Record<string, unknown>)) {
    out.set(id, moneyCountsFromRpc(counts))
  }
  return out
}

/**
 * The hint the trigger raises with. The action reads it to turn a refused
 * delete into the organiser's sentence rather than a Postgres message.
 */
export const DELETE_REFUSAL_HINT = 'EVENT_HAS_MONEY_RECORDS'

export function isMoneyRefusal(error: { hint?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false
  if (error.hint === DELETE_REFUSAL_HINT) return true
  return typeof error.message === 'string' && error.message.includes('event has money records')
}
