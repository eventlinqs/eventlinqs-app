import type { HealthResult } from '@/lib/health/result'
import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * EVERY PAID ORDER RECORDS WHERE ITS BUYER CAME FROM, ENFORCED ON LIVE (Lawal's order; the CONTROLLER's 15:35 of
 * 7 November 2026, (3)). Built is not proved: the attribution spine writes one marketing_attribution row per order
 * (20260913000060, the decision 'none' with its reason included) and the ledger writes each paid order item's sale entry
 * with the referrer and campaign the visit channel rule (growth_visit_channel) classifies; the backstop
 * (/api/cron/attribution-backstop) repairs a missed attribution row within the hour. This check is the live proof: the
 * health sentinel (every five minutes) turns CRITICAL when any paid order older than two hours lacks its attribution row
 * or its arrival channel (no sale ledger entry), and names every such order, so the founder hears the same hour.
 *
 * Two hours, not five minutes: the write path and the hourly backstop both get their chance first, so a red is a real
 * gap, never a race. Reversal (the CONTROLLER's 15:35): a false alarm twice in seven days moves this back to a daily read
 * back, with the reason posted.
 *
 * A paid order is the scorecard's: confirmed or partly refunded, above A$0.
 */
export const ATTRIBUTION_DUE_MS = 2 * 60 * 60 * 1000
/** The window read each run: a gap older than this has already alarmed for a week. */
export const ATTRIBUTION_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000

export type PaidOrderRecord = {
  id: string
  orderNumber: string
  createdAt: string
  hasAttribution: boolean
  /** Sale ledger entries across the order's items: each carries the arrival the channel rule reads. */
  saleEntries: number
}

const BASE = { id: 'order_attribution', label: 'Order attribution (where each buyer came from)', severity: 'critical' as const }

/** The verdict over the paid orders read. Pure. `readFault` is why the read failed, which is itself a red. */
export function attributionVerdict(orders: readonly PaidOrderRecord[] | null, now: Date, read: number, readFault?: string): HealthResult {
  if (!orders || readFault) {
    return {
      ...BASE,
      ok: false,
      detail: `The paid orders and their attribution could not be read: ${readFault ?? 'no answer'}. An unread gap is not a green.`,
      probableCause: 'The database refused or timed out the read.',
      action: 'Open /admin/health again in five minutes; if it stays red, the database check above says why.',
    }
  }
  const due = orders.filter((o) => now.getTime() - Date.parse(o.createdAt) >= ATTRIBUTION_DUE_MS)
  const young = orders.length - due.length
  const noRow = due.filter((o) => !o.hasAttribution).map((o) => o.orderNumber)
  const noChannel = due.filter((o) => o.saleEntries === 0).map((o) => o.orderNumber)
  const faulty = new Set([...noRow, ...noChannel])
  if (faulty.size === 0) {
    return {
      ...BASE,
      ok: true,
      detail: `${due.length} paid order(s) past two hours in the last 30 days each carry their attribution row and arrival channel${young ? `; ${young} younger than two hours, not yet judged` : ''} (${read} read).`,
    }
  }
  const parts = [
    noRow.length ? `no marketing_attribution row: ${noRow.join(', ')}` : '',
    noChannel.length ? `no arrival channel (no sale ledger entry): ${noChannel.join(', ')}` : '',
  ].filter(Boolean)
  return {
    ...BASE,
    ok: false,
    detail: `${faulty.size} of ${due.length} paid order(s) past two hours do not record where the buyer came from; ${parts.join('; ')}.`,
    probableCause: noRow.length
      ? 'The attribution write at checkout and the hourly backstop both missed these orders.'
      : 'The sale ledger entry was not written when the order was paid (the payment webhook path).',
    action: 'Run the attribution backstop now and read marketing_attribution_invariant_breaches; a sale with no ledger entry is a webhook fault to fix at its cause.',
  }
}

type Admin = ReturnType<typeof createAdminClient>

/** Production's paid orders of the last 30 days, each with its attribution row and its sale ledger entries. */
export async function checkOrderAttribution(admin: Admin, now: Date = new Date()): Promise<HealthResult> {
  try {
    const since = new Date(now.getTime() - ATTRIBUTION_LOOKBACK_MS).toISOString()
    const { data: orders, error } = await admin
      .from('orders')
      .select('id, order_number, created_at')
      .in('status', ['confirmed', 'partially_refunded'])
      .gt('total_cents', 0)
      .gte('created_at', since)
      .limit(2000)
    if (error) return attributionVerdict(null, now, 0, `orders: ${error.message}`)
    const list = (orders ?? []) as { id: string; order_number: string; created_at: string }[]
    if (list.length === 0) return attributionVerdict([], now, 0)
    const ids = list.map((o) => o.id)
    const withRow = new Set<string>()
    const itemsOf = new Map<string, string[]>()
    for (let i = 0; i < ids.length; i += 200) {
      const slice = ids.slice(i, i + 200)
      const a = await admin.from('marketing_attribution').select('order_id').in('order_id', slice)
      if (a.error) return attributionVerdict(null, now, list.length, `marketing_attribution: ${a.error.message}`)
      for (const r of (a.data ?? []) as { order_id: string }[]) withRow.add(r.order_id)
      const it = await admin.from('order_items').select('id, order_id').in('order_id', slice)
      if (it.error) return attributionVerdict(null, now, list.length, `order_items: ${it.error.message}`)
      for (const r of (it.data ?? []) as { id: string; order_id: string }[]) itemsOf.set(r.order_id, [...(itemsOf.get(r.order_id) ?? []), r.id])
    }
    const keys = [...itemsOf.values()].flat().map((id) => `sale:${id}`)
    const sold = new Set<string>()
    for (let i = 0; i < keys.length; i += 200) {
      const le = await admin.from('ledger_entries').select('occurrence_key').eq('kind', 'sale').in('occurrence_key', keys.slice(i, i + 200))
      if (le.error) return attributionVerdict(null, now, list.length, `ledger_entries: ${le.error.message}`)
      for (const r of (le.data ?? []) as { occurrence_key: string }[]) sold.add(r.occurrence_key)
    }
    const records: PaidOrderRecord[] = list.map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      createdAt: o.created_at,
      hasAttribution: withRow.has(o.id),
      saleEntries: (itemsOf.get(o.id) ?? []).filter((id) => sold.has(`sale:${id}`)).length,
    }))
    return attributionVerdict(records, now, list.length)
  } catch (err) {
    return attributionVerdict(null, now, 0, err instanceof Error ? err.message : String(err))
  }
}
