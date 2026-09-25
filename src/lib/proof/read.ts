import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { withBuildRetry } from '@/lib/supabase/build-retry'
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


/**
 * A READ THAT FAILED IS NOT AN ANSWER OF ZERO, AND IT IS NOT AN ANSWER OF
 * "THIS DOES NOT EXIST".
 *
 * FOUND BY DRIVING, 15 September 2026. GA5's drive reported
 * `desktop-1440.with-sales.renders` failing and the leading number rendering
 * at 0 pixels. The server log carries the cause, and it is not this page:
 *
 *     TypeError: fetch failed
 *       cause: ConnectTimeoutError (attempted 172.64.149.246:443, timeout: 10000ms)
 *       code: UND_ERR_CONNECT_TIMEOUT
 *     GET /admin/campaigns/<id>/proof 404 in 42s
 *
 * The laptop could not reach Supabase for about a minute. Every read in this
 * file was written `const { data } = await admin...`, discarding `error`, so:
 *
 *   the CAMPAIGN read came back null and the page called notFound(), telling
 *   the reader the campaign does not exist, permanently, because a socket did
 *   not open;
 *   the ORDERS read came back `[]`, and an empty order list is not an error
 *   anywhere downstream. It is ZERO REVENUE, printed as a figure, on the one
 *   page in this product whose stated law is that a figure which cannot name
 *   its source renders as WORDS and never as a zero.
 *
 * The second is the dangerous one, because it is silent and it is a number a
 * fee is defended with.
 *
 * THE PATTERN IS NOT NEW HERE. src/app/organisers/[handle]/page.tsx carries
 * the same post-mortem under the heading about a page that may never answer
 * that something does not exist because it could not ask (close-out UX6):
 * retry the transient with `withBuildRetry`, and when it still fails, THROW,
 * because a 500 says ask again where a 404 and a zero both say something
 * false.
 */
export class ProofReadFailed extends Error {
  constructor(what: string, cause: unknown) {
    super(`[proof/read] could not read ${what}; answering 500 rather than a figure this page cannot source`)
    this.name = 'ProofReadFailed'
    this.cause = cause
  }
}

/*
 * THE SHAPE IS INFERRED FROM THE QUERY, not declared here. supabase-js answers
 * a UNION of { data: T, error: null } and { data: null, error: PostgrestError },
 * so a parameter written `{ data: T | null; error: unknown }` infers T as never
 * and every field read off the row becomes a type error. Taking the whole
 * response as R and returning R['data'] keeps each caller's row type exactly as
 * the query describes it.
 */
async function mustRead<R extends { data: unknown; error: unknown }>(
  what: string,
  run: () => PromiseLike<R>,
): Promise<R['data']> {
  const { data, error } = await withBuildRetry(
    run as () => PromiseLike<{ data: unknown; error: unknown }>,
    { label: `proof/${what}` },
  )
  if (error) {
    captureException(error, { where: `lib/proof/read:${what}` })
    throw new ProofReadFailed(what, error)
  }
  return data as R['data']
}

/**
 * The same contract as `mustRead`, for a read that must return EVERY row.
 *
 * Supabase stops a response at 1,000 rows and says nothing about the ones it
 * left out. On this page that is not a missing row, it is a smaller number: an
 * event with more than a thousand orders in the window would have had its
 * revenue, its attributed share and its net ledger figure all computed from
 * the first thousand, and the page exists to DEFEND a fee with those figures.
 * The failure is wrapped as a `ProofReadFailed` like every other read here, so
 * the page shows its own honest failure rather than a plausible smaller total.
 */
async function mustReadEvery<T>(
  what: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  try {
    return await readEveryRow<T>(what, page)
  } catch (error) {
    captureException(error, { where: `lib/proof/read:${what}` })
    throw new ProofReadFailed(what, error)
  }
}

export async function readProof(campaignId: string, now = new Date()): Promise<ProofReadResult | null> {
  const admin = createAdminClient()

  const campaign = await mustRead('the campaign', () =>
    admin
      .from('marketing_campaign')
      .select('id, reference, name, event_id, organisation_id, created_at')
      .eq('id', campaignId)
      .maybeSingle(),
  )
  /* null HERE means the campaign genuinely is not there, and 404 is the truth. */
  if (!campaign) return null

  const [event, organisation] = await Promise.all([
    mustRead('the event', () => admin.from('events').select('id, title').eq('id', campaign.event_id).maybeSingle()),
    mustRead('the organisation', () =>
      admin.from('organisations').select('id, name').eq('id', campaign.organisation_id).maybeSingle(),
    ),
  ])

  const windowFrom = campaign.created_at
  const windowTo = now.toISOString()

  /* THE REVENUE. An error here would read as zero, so it is never an error here. */
  const orders = await mustReadEvery('the orders in the window', (from, to) =>
    admin
      .from('orders')
      .select('id, order_number, total_cents, status, created_at, currency')
      .eq('event_id', campaign.event_id)
      .gte('created_at', windowFrom)
      .lte('created_at', windowTo)
      .order('id', { ascending: true })
      .range(from, to),
  )

  const orderIds = orders.map(o => o.id)
  const attributions = new Map<string, ProofOrder['attribution']>()
  const reversals = new Map<string, ProofOrder['reversals']>()
  for (let i = 0; i < orderIds.length; i += 200) {
    const slice = orderIds.slice(i, i + 200)
    const [attrRows, revRows] = await Promise.all([
      mustRead('the attribution decisions', () =>
        admin
          .from('marketing_attribution')
          .select('order_id, campaign_id, decision, billable, rung, explanation')
          .in('order_id', slice)
          // One decision per order, and the slice is 200 orders.
          .limit(200),
      ),
      // An order can carry more than one reversal, so this one is paged rather
      // than bounded by the slice size.
      mustReadEvery('the attribution reversals', (from, to) =>
        admin
          .from('marketing_attribution_reversal')
          .select('id, order_id, reversed_amount_cents, reason')
          .in('order_id', slice)
          .order('id', { ascending: true })
          .range(from, to),
      ),
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

  // The send count is the cost side of the arithmetic this page publishes.
  const sendRows = await mustReadEvery('the sends', (from, to) =>
    admin
      .from('marketing_send')
      .select('id, channel_code, state')
      .eq('campaign_id', campaign.id)
      .order('id', { ascending: true })
      .range(from, to),
  )
  const sends: ProofSend[] = sendRows.map(s => ({ id: s.id, channelCode: s.channel_code, state: s.state }))

  const channelRows = await mustRead('the channel costs', () =>
    // The channel code table: email and sms today, bounded rather than ceilinged.
    admin.from('marketing_channel').select('code, cost_per_send_cents').limit(100),
  )
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
  /*
   * THE LEDGER IS THE ONE READ HERE THAT DOES NOT THROW, and the difference is
   * deliberate rather than an oversight. Every other read above feeds a figure
   * the page PRINTS, so a failure must become a 500. The ledger feeds the
   * reconciliation, and the page already has an honest answer for not having
   * it: the fee is WITHHELD and says so in words.
   *
   * What was wrong until 15 September 2026 is that it could not tell the two
   * apart. `const { data: slot }` discarded the error, so a ledger the page
   * could not READ looked exactly like an event the ledger does not HOLD, and
   * both withheld the fee with the same sentence. The withholding was right
   * either way; the silence was not, because nobody would ever learn the money
   * ledger had stopped answering.
   */
  let ledgerNetCents: number | null = null
  let ledgerEntryIds: string[] = []
  const { data: slot, error: slotError } = await admin
    .from('ledger_slots')
    .select('id')
    .eq('source_ref', campaign.event_id)
    .maybeSingle()
  if (slotError) {
    captureException(slotError, { where: 'lib/proof/read:ledger-slot' })
  } else if (slot) {
    try {
      // The net ledger figure this page prints. Paged, because a busy event's
      // entries pass a thousand and a short read would understate the net.
      const rows = await readEveryRow('the ledger entries in the window', (from, to) =>
        admin
          .from('ledger_entries')
          .select('id, amount_cents, occurred_at')
          .eq('slot_id', slot.id)
          .gte('occurred_at', windowFrom)
          .lte('occurred_at', windowTo)
          .order('id', { ascending: true })
          .range(from, to),
      )
      ledgerEntryIds = rows.map(e => String(e.id))
      ledgerNetCents = rows.reduce((total, e) => total + Number(e.amount_cents ?? 0), 0)
    } catch (entriesError) {
      captureException(entriesError, { where: 'lib/proof/read:ledger-entries' })
    }
  }

  let currency: string | null = orders[0]?.currency ?? null
  if (!currency) {
    const tier = await mustRead('the ticket currency', () =>
      admin.from('ticket_tiers').select('currency').eq('event_id', campaign.event_id).limit(1).maybeSingle(),
    )
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
