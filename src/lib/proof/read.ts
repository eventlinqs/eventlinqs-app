import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPricingRule } from '@/lib/payments/pricing-rules'
import { captureException } from '@/lib/observability/sentry'
import { composeProof, everyFigureIsSourced, type ProofOrder, type ProofResult, type ProofSend } from './compose'

/**
 * GATHERING THE ROWS THE PROOF PAGE RESTS ON.
 *
 * Every read here is a READ. Nothing in this file writes, nothing computes a
 * figure, and nothing owned by another lane is touched: the slot ledger, the
 * orders, the refunds and the payment path are lane A's and are read only.
 * The arithmetic is `compose.ts`, which is pure, so the figures can be tested
 * without any of this.
 *
 * THE WINDOW is the campaign's own life: from the moment it was created to now.
 * A campaign cannot be credited with a sale that happened before it existed,
 * and "produced elsewhere" only means anything against the same window, because
 * an event that has been on sale for three months against a campaign that ran
 * for one week would otherwise read as a campaign that produced almost nothing.
 */

export interface ProofReadResult {
  campaign: {
    id: string
    reference: string
    name: string
    eventId: string
    eventTitle: string
    organisationName: string
    windowFrom: string
    windowTo: string
    /*
     * READ, never written down. The page shows money and must never carry a
     * currency code of its own: it takes the one the orders were actually taken
     * in, or failing that the one the tickets are priced in. A campaign with
     * neither has no money to show and renders its empty state.
     */
    currency: string | null
  }
  result: ProofResult
  commissionPercent: number | null
  /** A figure the composer produced that cannot name its source. Always empty. */
  unsourced: string[]
}

export async function readProof(campaignId: string, now = new Date()): Promise<ProofReadResult | null> {
  const admin = createAdminClient()

  const { data: campaign } = await admin
    .from('marketing_campaign')
    .select('id, reference, name, event_id, organisation_id, created_at')
    .eq('id', campaignId)
    .maybeSingle()
  if (!campaign) return null

  const [{ data: event }, { data: organisation }] = await Promise.all([
    admin.from('events').select('id, title').eq('id', campaign.event_id).maybeSingle(),
    admin.from('organisations').select('id, name').eq('id', campaign.organisation_id).maybeSingle(),
  ])

  const windowFrom = campaign.created_at
  const windowTo = now.toISOString()

  const { data: orderRows } = await admin
    .from('orders')
    .select('id, order_number, total_cents, status, created_at, currency')
    .eq('event_id', campaign.event_id)
    .gte('created_at', windowFrom)
    .lte('created_at', windowTo)
  const orders = orderRows ?? []

  const orderIds = orders.map(o => o.id)
  const attributions = new Map<string, ProofOrder['attribution']>()
  const reversals = new Map<string, ProofOrder['reversals']>()
  for (let i = 0; i < orderIds.length; i += 200) {
    const slice = orderIds.slice(i, i + 200)
    const [{ data: attrRows }, { data: revRows }] = await Promise.all([
      admin
        .from('marketing_attribution')
        .select('order_id, campaign_id, decision, billable, rung, explanation')
        .in('order_id', slice),
      admin
        .from('marketing_attribution_reversal')
        .select('id, order_id, reversed_amount_cents, reason')
        .in('order_id', slice),
    ])
    for (const row of attrRows ?? []) {
      attributions.set(row.order_id, {
        campaignId: row.campaign_id,
        decision: row.decision as 'attributed' | 'none',
        billable: row.billable,
        rung: row.rung,
        explanation: row.explanation,
      })
    }
    for (const row of revRows ?? []) {
      reversals.set(row.order_id, [
        ...(reversals.get(row.order_id) ?? []),
        { id: row.id, amountCents: Number(row.reversed_amount_cents), reason: row.reason },
      ])
    }
  }

  const proofOrders: ProofOrder[] = orders.map(o => ({
    id: o.id,
    reference: o.order_number,
    totalCents: Number(o.total_cents),
    status: o.status,
    attribution: attributions.get(o.id) ?? null,
    reversals: reversals.get(o.id) ?? [],
  }))

  const { data: sendRows } = await admin
    .from('marketing_send')
    .select('id, channel_code, state')
    .eq('campaign_id', campaign.id)
  const sends: ProofSend[] = (sendRows ?? []).map(s => ({ id: s.id, channelCode: s.channel_code, state: s.state }))

  const { data: channelRows } = await admin.from('marketing_channel').select('code, cost_per_send_cents')
  const channelCostCents: Record<string, number | null> = {}
  for (const c of channelRows ?? []) {
    channelCostCents[c.code] = c.cost_per_send_cents === null ? null : Number(c.cost_per_send_cents)
  }

  /*
   * THE COMMISSION, through the platform's own fee resolver, scoped to this
   * organisation and this event so a client on different terms reads their own
   * rate. A missing rule is null rather than a default: GA5 says the fee is
   * withheld rather than shown partial, and a default IS a number somebody
   * would quote.
   */
  let commissionPercent: number | null = null
  try {
    const rule = await getPricingRule({
      ruleType: 'marketing_commission_percentage',
      countryCode: 'AU',
      currency: 'AUD',
      organisationId: campaign.organisation_id,
      eventId: campaign.event_id,
    })
    commissionPercent = rule.valueType === 'percentage' ? rule.value : null
  } catch {
    // PricingRuleNotFoundError, which is a real answer: no rate is configured.
    commissionPercent = null
  }

  /*
   * THE MONEY LEDGER, read only, and it is the reconciliation rather than the
   * revenue. It is keyed by SLOT, which is the event, and carries no campaign
   * dimension, so it can say what an event took and can never say which
   * campaign took it. An event it does not hold withholds the fee.
   */
  let ledgerNetCents: number | null = null
  let ledgerEntryIds: string[] = []
  try {
    const { data: slot } = await admin
      .from('ledger_slots')
      .select('id')
      .eq('source_ref', campaign.event_id)
      .maybeSingle()
    if (slot) {
      const { data: entries } = await admin
        .from('ledger_entries')
        .select('id, amount_cents, occurred_at')
        .eq('slot_id', slot.id)
        .gte('occurred_at', windowFrom)
        .lte('occurred_at', windowTo)
      const rows = entries ?? []
      ledgerEntryIds = rows.map(e => String(e.id))
      ledgerNetCents = rows.reduce((total, e) => total + Number(e.amount_cents ?? 0), 0)
    }
  } catch (error) {
    captureException(error, { where: 'lib/proof/read:ledger' })
    ledgerNetCents = null
  }

  let currency: string | null = orders[0]?.currency ?? null
  if (!currency) {
    const { data: tier } = await admin
      .from('ticket_tiers')
      .select('currency')
      .eq('event_id', campaign.event_id)
      .limit(1)
      .maybeSingle()
    currency = tier?.currency ?? null
  }

  const result = composeProof({
    campaignId: campaign.id,
    orders: proofOrders,
    sends,
    channelCostCents,
    commissionPercent,
    ledgerNetCents,
    ledgerEntryIds,
  })

  const { unsourced } = everyFigureIsSourced(result)

  return {
    campaign: {
      id: campaign.id,
      reference: campaign.reference,
      name: campaign.name,
      eventId: campaign.event_id,
      eventTitle: event?.title ?? 'an event that no longer exists',
      organisationName: organisation?.name ?? 'an organisation that no longer exists',
      windowFrom,
      windowTo,
      currency,
    },
    result,
    commissionPercent,
    unsourced,
  }
}

/**
 * CLOSE A MONTH: store the figures and their sources as at that date.
 *
 * A later reversal changes the live page and leaves this alone, which is the
 * whole point. An invoice raised in September is a statement about September,
 * and a chargeback in November corrects the current number without rewriting
 * what was true when the invoice went out.
 */
export async function closeMonth(params: {
  campaignId: string
  periodStart: string
  /**
   * EXCLUSIVE: the first day NOT in the period. A month closing on the 30th is
   * passed the 1st of the next month.
   *
   * This cost the drive a run. Reading it as inclusive and taking it as the
   * moment to measure at means measuring at MIDNIGHT of the last day, which
   * drops every sale made on it, and the last day of a month is exactly when a
   * campaign for an event that weekend has been selling.
   */
  periodEnd: string
  now?: Date
}): Promise<{ stored: boolean; reason?: string }> {
  const read = await readProof(params.campaignId, params.now ?? new Date(params.periodEnd))
  if (!read) return { stored: false, reason: 'no campaign with that id' }

  const { snapshotPayload } = await import('./compose')
  const payload = snapshotPayload(read.result)

  const admin = createAdminClient()
  const { error } = await admin.from('marketing_proof_snapshot').insert({
    campaign_id: params.campaignId,
    period_start: params.periodStart,
    period_end: params.periodEnd,
    figures: payload.figures,
    sources: payload.sources,
  })
  if (error) {
    if (error.code === '23505') return { stored: false, reason: 'this month is already closed for this campaign' }
    return { stored: false, reason: error.message }
  }
  return { stored: true }
}
