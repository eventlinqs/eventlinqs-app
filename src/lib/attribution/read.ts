import 'server-only'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatMoney } from '@/lib/money/format'
import { formatPlatformDate } from '@/lib/dates/event-time'
import { readAttributionConfig } from './config'
import { RUNG, type Rung } from './resolve'
import { isCompletedSale } from './reversal'

/**
 * READING ONE ATTRIBUTION BACK, AS A STATEMENT RATHER THAN A DUMP.
 *
 * Everything a fee argument needs is turned into a sentence HERE rather than in
 * the page, for the same reason GA2 keeps its explanation beside its weight: a
 * screen that composes its own wording is a screen that starts saying something
 * slightly different from the record it is describing.
 */

export interface CandidateClickView {
  clickId: string
  sentence: string
}

export interface ReversalView {
  id: string
  reason: string
  amountLabel: string
  reversedAt: string
  source: string
}

export interface AttributionView {
  orderReference: string
  decision: 'attributed' | 'none'
  rung: Rung
  modelName: string
  modelVersion: string
  confidence: number
  campaignName: string | null
  channelName: string | null
  partnerName: string | null
  recipientLabel: string | null
  forwarded: boolean
  billable: boolean
  billableSentence: string
  orderStateSentence: string
  explanation: string
  resolvedAt: string
  candidateClicks: CandidateClickView[]
  reversals: ReversalView[]
}

export interface AttributionSummary {
  orders: number
  attributions: number
  attributed: number
  billable: number
  reversed: number
  modelName: string
  modelVersion: string
  windowDays: number
}

export async function readAttributionSummary(): Promise<AttributionSummary> {
  const admin = createAdminClient()
  const config = await readAttributionConfig()
  const counts = await Promise.all([
    admin.from('orders').select('id', { count: 'exact', head: true }),
    admin.from('marketing_attribution').select('order_id', { count: 'exact', head: true }),
    admin.from('marketing_attribution').select('order_id', { count: 'exact', head: true }).eq('decision', 'attributed'),
    admin.from('marketing_attribution').select('order_id', { count: 'exact', head: true }).eq('billable', true),
    admin.from('marketing_attribution_reversal').select('id', { count: 'exact', head: true }),
  ])
  return {
    orders: counts[0].count ?? 0,
    attributions: counts[1].count ?? 0,
    attributed: counts[2].count ?? 0,
    billable: counts[3].count ?? 0,
    reversed: counts[4].count ?? 0,
    modelName: config.modelName,
    modelVersion: config.modelVersion,
    windowDays: config.attributionWindowDays,
  }
}

/**
 * The sentence that answers "so are we charging for this or not", which is the
 * only question anybody opens this screen to ask.
 */
function billableSentence(input: {
  decision: 'attributed' | 'none'
  rung: Rung
  billable: boolean
  reversalCount: number
  orderStatus: string
}): string {
  if (input.decision === 'none') {
    return 'Nothing is charged for this sale, because no campaign is credited with it.'
  }
  if (input.reversalCount > 0) {
    return 'Nothing is charged for this sale. It was credited to a campaign and then taken back, and a reversal of any size takes the whole sale off the invoice.'
  }
  if (input.rung > RUNG.RECIPIENT_IDENTITY) {
    return 'Nothing is charged for this sale. A campaign click happened nearby, which is worth recording, but nothing ties this buyer to it and an observation is not a basis for a fee.'
  }
  if (!isCompletedSale(input.orderStatus)) {
    return 'Nothing is charged for this sale yet, because the order has not completed. The credit stands and becomes chargeable if it does.'
  }
  return input.billable
    ? 'This sale is chargeable: it is tied to a campaign click by evidence, and nothing has been taken back.'
    : 'This sale is not chargeable.'
}

function orderStateSentence(status: string): string {
  switch (status) {
    case 'confirmed':
      return 'Paid and confirmed'
    case 'partially_refunded':
      return 'Paid, partly refunded'
    case 'refunded':
      return 'Refunded in full'
    case 'cancelled':
      return 'Cancelled'
    case 'expired':
      return 'Expired before payment'
    case 'pending':
      return 'Started, not yet paid'
    default:
      return status
  }
}

export async function readAttributionForOrder(reference: string): Promise<AttributionView | null> {
  const admin = createAdminClient()
  const trimmed = reference.trim().toUpperCase()
  if (!trimmed) return null

  /*
   * THROUGH THE DOOR, BECAUSE THIS SCREEN ANSWERS WHO EARNED A SALE.
   *
   * null from the order read made /admin/attribution say the order number is
   * not known. A failed attribution read made it say the order was never
   * attributed. A failed reversal read made a reversed attribution look live.
   * All three were discarded errors and all three are statements about money.
   */
  const order = await readOrThrow('attribution order lookup', () =>
    admin
      .from('orders')
      .select('id, order_number, status, currency')
      .eq('order_number', trimmed)
      .maybeSingle(),
  )
  if (!order) return null

  const row = await readOrThrow('attribution decision', () =>
    admin
      .from('marketing_attribution')
      .select(
        'order_id, decision, rung, model_name, model_version, confidence, campaign_id, channel_code, partner_id, recipient_id, forwarded, billable, explanation, resolved_at, candidate_clicks',
      )
      .eq('order_id', order.id)
      .maybeSingle(),
  )

  const reversalRows = await readOrThrow('attribution reversals', () =>
    admin
      .from('marketing_attribution_reversal')
      .select('id, reason, reversed_amount_cents, reversed_at, source')
      .eq('order_id', order.id)
      .order('reversed_at', { ascending: false })
      // One order's reversals. Bounded far above anything real, and stated here
      // rather than left to the server's invisible 1,000-row ceiling.
      .limit(500),
  )

  const reversals: ReversalView[] = (reversalRows ?? []).map(r => ({
    id: r.id,
    reason: r.reason,
    amountLabel: formatMoney(Number(r.reversed_amount_cents), order.currency),
    reversedAt: r.reversed_at,
    source: r.source,
  }))

  if (!row) {
    /*
     * AN ORDER WITH NO RECORD IS REPORTED, NOT HIDDEN. The guard fails the
     * build when one exists, so this branch should be unreachable; if it is
     * ever reached the screen says exactly that rather than rendering an empty
     * page that reads like "no campaign produced it".
     */
    return {
      orderReference: order.order_number,
      decision: 'none',
      rung: RUNG.NONE,
      modelName: 'none',
      modelVersion: 'none',
      confidence: 1,
      campaignName: null,
      channelName: null,
      partnerName: null,
      recipientLabel: null,
      forwarded: false,
      billable: false,
      billableSentence:
        'This order has NO stored attribution decision, which should be impossible. Run the attribution backfill and report it: every order is meant to carry exactly one.',
      orderStateSentence: orderStateSentence(order.status),
      explanation: 'No decision is stored for this order.',
      resolvedAt: new Date().toISOString(),
      candidateClicks: [],
      reversals,
    }
  }

  const [campaign, channel, partner, recipient] = await Promise.all([
    row.campaign_id
      ? admin.from('marketing_campaign').select('name').eq('id', row.campaign_id).maybeSingle()
      : Promise.resolve({ data: null }),
    row.channel_code
      ? admin.from('marketing_channel').select('display_name').eq('code', row.channel_code).maybeSingle()
      : Promise.resolve({ data: null }),
    row.partner_id
      ? admin.from('marketing_partner').select('name').eq('id', row.partner_id).maybeSingle()
      : Promise.resolve({ data: null }),
    row.recipient_id
      ? admin
          .from('marketing_recipient')
          .select('channel_code, audience_members(email)')
          .eq('id', row.recipient_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  /*
   * PostgREST types an embedded one-to-one as an ARRAY here, because the
   * relationship is inferred from a foreign key rather than declared unique.
   * Both shapes are handled rather than cast away: a cast that guesses wrongly
   * is how a name silently becomes undefined on the one screen that has to be
   * right.
   */
  const embedded = recipient.data
    ? (recipient.data as unknown as { audience_members?: { email: string } | { email: string }[] | null }).audience_members
    : null
  const recipientMember = Array.isArray(embedded) ? embedded[0] ?? null : embedded ?? null

  const candidates = (row.candidate_clicks ?? []) as {
    clickId: string
    occurredAt: string
    insideWindow: boolean
    alreadySpent: boolean
  }[]

  return {
    orderReference: order.order_number,
    decision: row.decision as 'attributed' | 'none',
    rung: row.rung as Rung,
    modelName: row.model_name,
    modelVersion: row.model_version,
    confidence: Number(row.confidence),
    campaignName: campaign.data?.name ?? null,
    channelName: (channel.data as { display_name: string } | null)?.display_name ?? null,
    partnerName: (partner.data as { name: string } | null)?.name ?? null,
    recipientLabel: recipientMember?.email ?? null,
    forwarded: row.forwarded,
    billable: row.billable,
    billableSentence: billableSentence({
      decision: row.decision as 'attributed' | 'none',
      rung: row.rung as Rung,
      billable: row.billable,
      reversalCount: reversals.length,
      orderStatus: order.status,
    }),
    orderStateSentence: orderStateSentence(order.status),
    explanation: row.explanation,
    resolvedAt: row.resolved_at,
    candidateClicks: candidates.map(c => ({
      clickId: c.clickId,
      sentence: candidateSentence(c),
    })),
    reversals,
  }
}

function candidateSentence(click: {
  occurredAt: string
  insideWindow: boolean
  alreadySpent: boolean
}): string {
  const when = formatPlatformDate(click.occurredAt)
  if (!click.insideWindow) {
    return `Opened on ${when}, outside the attribution window, so it could not be credited.`
  }
  if (click.alreadySpent) {
    return `Opened on ${when}, inside the window, but already credited to an earlier sale. One click backs one sale.`
  }
  return `Opened on ${when}, inside the window and available to be credited.`
}
