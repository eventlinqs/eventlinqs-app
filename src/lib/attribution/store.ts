import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { normaliseSubjectEmail } from '@/lib/consent/purposes'
import { captureException } from '@/lib/observability/sentry'
import { readAttributionConfig } from './config'
import {
  emailIdentityKey,
  resolveAttribution,
  type AttributionDecision,
  type ResolverClick,
  type ResolverOrder,
  type ResolverSignal,
} from './resolve'

/**
 * RESOLVING AN ORDER AND STORING THE DECISION.
 *
 * The pure resolver decides; this file feeds it and writes what it decided.
 * The split is deliberate: everything that could be wrong about the ARITHMETIC
 * is testable without a database, and everything that could be wrong about the
 * READS is here, in one place, where it can be read in one sitting.
 *
 * ONE ROW PER ORDER, NEVER TWO, is the database's job: `order_id` is the
 * primary key of `marketing_attribution`. This file upserts, so resolving an
 * order twice updates the decision rather than racing to insert a second row.
 *
 * WHY THE DECISION IS RE-RESOLVED RATHER THAN PATCHED. A late click, a
 * corrected identity or a changed window all produce a different answer, and an
 * attribution is a statement about what we believe now, carrying the model
 * version that produced it. Nothing accumulates.
 */

interface OrderRow {
  id: string
  order_number: string
  event_id: string
  guest_email: string | null
  user_id: string | null
  created_at: string
}

/** Identity keys for the buyer. Email today; the shape takes more. */
async function buyerIdentityKeys(order: OrderRow, emailByUser: Map<string, string>): Promise<string[]> {
  const raw = order.guest_email ?? (order.user_id ? emailByUser.get(order.user_id) ?? null : null)
  if (!raw) return []
  const normalised = normaliseSubjectEmail(raw)
  return normalised ? [emailIdentityKey(normalised)] : []
}

/**
 * Every click on a campaign for these events, with its recipient's identity
 * keys attached. One read per table rather than one per order, because the
 * backfill runs this over every order on the platform.
 */
async function loadClicksForEvents(eventIds: string[]): Promise<Map<string, ResolverClick[]>> {
  const admin = createAdminClient()
  const byEvent = new Map<string, ResolverClick[]>()
  if (eventIds.length === 0) return byEvent

  const campaigns: { id: string; event_id: string; name: string; attribution_window_days: number }[] = []
  for (let i = 0; i < eventIds.length; i += 100) {
    const { data, error } = await admin
      .from('marketing_campaign')
      .select('id, event_id, name, attribution_window_days')
      .in('event_id', eventIds.slice(i, i + 100))
      // One campaign per event on this path; the slice is 100 events.
      .limit(100)
    if (error) throw new Error(`marketing_campaign read failed: ${error.message}`)
    campaigns.push(...(data ?? []))
  }
  if (campaigns.length === 0) return byEvent

  const campaignById = new Map(campaigns.map(c => [c.id, c]))
  const clicks: {
    id: string
    campaign_id: string
    channel_code: string
    partner_id: string | null
    recipient_id: string | null
    occurred_at: string
  }[] = []
  const ids = campaigns.map(c => c.id)
  for (let i = 0; i < ids.length; i += 100) {
    /*
     * MANY CLICKS PER CAMPAIGN, so the slice size bounds the campaigns and
     * nothing bounds the rows. A truncated click list is an order that cannot
     * find the click that earned it, which reads on the proof page as a
     * campaign that sold nothing.
     */
    clicks.push(
      ...(await readEveryRow('marketing_click', (from, to) =>
        admin
          .from('marketing_click')
          .select('id, campaign_id, channel_code, partner_id, recipient_id, occurred_at')
          .in('campaign_id', ids.slice(i, i + 100))
          .order('id', { ascending: true })
          .range(from, to),
      )),
    )
  }

  const channelNames = new Map<string, string>()
  {
    // The channel code table, bounded rather than left to a silent ceiling.
    const { data } = await admin.from('marketing_channel').select('code, display_name').limit(100)
    for (const row of data ?? []) channelNames.set(row.code, row.display_name)
  }

  // Recipient identity, one read for every recipient any of these clicks names.
  const recipientIds = [...new Set(clicks.map(c => c.recipient_id).filter((v): v is string => Boolean(v)))]
  const keysByRecipient = new Map<string, string[]>()
  for (let i = 0; i < recipientIds.length; i += 100) {
    const { data, error } = await admin
      .from('marketing_recipient')
      .select('id, audience_members(email)')
      .in('id', recipientIds.slice(i, i + 100))
      // Keyed by id, so at most the 100 asked for.
      .limit(100)
    if (error) throw new Error(`marketing_recipient read failed: ${error.message}`)
    for (const row of data ?? []) {
      /*
       * PostgREST types an embedded one-to-one as an ARRAY when the
       * relationship is inferred from a foreign key rather than declared
       * unique, and it returns one at runtime too. Reading it as an object
       * would leave every recipient with NO identity key, rung 3 would never
       * fire for anybody, and the cross device case this ladder exists to solve
       * would fail silently while every test that did not drive it passed.
       */
      const embedded = row.audience_members as unknown as { email: string } | { email: string }[] | null
      const member = Array.isArray(embedded) ? embedded[0] ?? null : embedded
      const normalised = member?.email ? normaliseSubjectEmail(member.email) : ''
      keysByRecipient.set(row.id, normalised ? [emailIdentityKey(normalised)] : [])
    }
  }

  for (const click of clicks) {
    const campaign = campaignById.get(click.campaign_id)
    if (!campaign) continue
    const list = byEvent.get(campaign.event_id) ?? []
    list.push({
      id: click.id,
      campaignId: campaign.id,
      campaignName: campaign.name,
      channelCode: click.channel_code,
      channelName: channelNames.get(click.channel_code) ?? click.channel_code,
      partnerId: click.partner_id,
      recipientId: click.recipient_id,
      recipientIdentityKeys: click.recipient_id ? keysByRecipient.get(click.recipient_id) ?? [] : [],
      occurredAt: click.occurred_at,
      campaignWindowDays: campaign.attribution_window_days,
    })
    byEvent.set(campaign.event_id, list)
  }
  return byEvent
}

/**
 * Click ids already spent as a BILLING BASIS by another order.
 *
 * Read from the stored attributions rather than tracked in memory, so a
 * backfill and a live resolution agree with each other and a re-run does not
 * spend a click twice.
 */
async function spentClickIds(excludeOrderId: string | null): Promise<Set<string>> {
  const admin = createAdminClient()
  /*
   * EVERY CLICK ALREADY SPENT, AND THIS ONE IS MONEY.
   *
   * A click missing from this set reads as unspent, and an unspent click can
   * be attributed to a SECOND order. Past a thousand billable attributions an
   * unbounded read would have started handing the same click out twice, which
   * is a double charge defended by a proof page quoting the same click.
   */
  const data = await readEveryRow('the spent clicks', (from, to) =>
    admin
      .from('marketing_attribution')
      .select('order_id, click_id')
      .eq('billable', true)
      .not('click_id', 'is', null)
      .order('order_id', { ascending: true })
      .range(from, to),
  )
  const out = new Set<string>()
  for (const row of data) {
    if (excludeOrderId && row.order_id === excludeOrderId) continue
    if (row.click_id) out.add(row.click_id)
  }
  return out
}

export interface StoredAttribution extends AttributionDecision {
  orderId: string
  orderReference: string
}

/**
 * Resolve and store ONE order. Used by the confirmation path and by the admin
 * reader's re-resolve. Never throws at the caller: a purchase and a page render
 * must not fail because attribution could not be written.
 */
export async function resolveAndStoreOrder(orderId: string): Promise<StoredAttribution | null> {
  try {
    const admin = createAdminClient()
    const { data: order, error } = await admin
      .from('orders')
      .select('id, order_number, event_id, guest_email, user_id, created_at')
      .eq('id', orderId)
      .maybeSingle()
    if (error) throw new Error(`orders read failed: ${error.message}`)
    if (!order) return null

    const emailByUser = new Map<string, string>()
    if (order.user_id) {
      const { data: profile } = await admin.from('profiles').select('id, email').eq('id', order.user_id).maybeSingle()
      if (profile?.email) emailByUser.set(profile.id, profile.email)
    }

    const [config, captureEnabled, clicksByEvent, spent] = await Promise.all([
      readAttributionConfig(),
      isFeatureEnabled('marketing_attribution_capture_enabled'),
      loadClicksForEvents([order.event_id]),
      spentClickIds(orderId),
    ])

    const { data: signalRow } = await admin
      .from('marketing_order_signal')
      .select('click_id, query_identifiers, cookie_present')
      .eq('order_id', orderId)
      .maybeSingle()

    const decision = resolveOne({
      order: order as OrderRow,
      buyerKeys: await buyerIdentityKeys(order as OrderRow, emailByUser),
      clicks: clicksByEvent.get(order.event_id) ?? [],
      signalRow,
      config,
      captureEnabled,
      spent,
    })

    await writeDecision(order as OrderRow, decision)
    return { ...decision, orderId: order.id, orderReference: order.order_number }
  } catch (err) {
    captureException(err)
    return null
  }
}

function resolveOne(input: {
  order: OrderRow
  buyerKeys: string[]
  clicks: ResolverClick[]
  signalRow: { click_id: string | null; query_identifiers: unknown; cookie_present: boolean } | null
  config: Awaited<ReturnType<typeof readAttributionConfig>>
  captureEnabled: boolean
  spent: Set<string>
}): AttributionDecision {
  const query = (input.signalRow?.query_identifiers ?? {}) as { click?: string | null }
  const resolverOrder: ResolverOrder = {
    id: input.order.id,
    reference: input.order.order_number,
    buyerIdentityKeys: input.buyerKeys,
    placedAt: input.order.created_at,
  }
  const signal: ResolverSignal | null = input.signalRow
    ? {
        clickIdFromCookie: input.signalRow.cookie_present ? input.signalRow.click_id : null,
        clickIdFromQuery: typeof query.click === 'string' ? query.click : null,
        cookiePresent: input.signalRow.cookie_present,
      }
    : null

  return resolveAttribution({
    order: resolverOrder,
    signal,
    clicks: input.clicks,
    config: {
      modelName: input.config.modelName,
      modelVersion: input.config.modelVersion,
      rungFourConfidence: input.config.rungFourConfidence,
    },
    spentClickIds: [...input.spent],
    // An order placed while the switch was off still gets a record, saying so.
    captureDisabled: !input.captureEnabled && input.clicks.length === 0,
  })
}

async function writeDecision(order: OrderRow, decision: AttributionDecision): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from('marketing_attribution').upsert(
    {
      order_id: order.id,
      decision: decision.decision,
      rung: decision.rung,
      model_name: decision.modelName,
      model_version: decision.modelVersion,
      campaign_id: decision.campaignId,
      channel_code: decision.channelCode,
      partner_id: decision.partnerId,
      recipient_id: decision.recipientId,
      click_id: decision.clickId,
      forwarded: decision.forwarded,
      confidence: decision.confidence,
      candidate_clicks: decision.candidateClicks,
      explanation: decision.explanation,
      reason: decision.reason,
      resolved_at: new Date().toISOString(),
    },
    { onConflict: 'order_id' },
  )
  if (error) throw new Error(`marketing_attribution write failed for ${order.order_number}: ${error.message}`)
}

/**
 * THE BACKFILL. Every order on the platform gets a record, including the ones
 * that predate this item, which resolve to none with the reason recorded.
 *
 * The invariant GA3 asks for is "one record per order", across the whole table
 * rather than only for new orders, and a count that is only true going forward
 * is a count somebody will one day quote wrongly.
 */
export async function backfillAttributions(options: { onlyMissing?: boolean } = {}): Promise<{
  ordersConsidered: number
  written: number
  attributed: number
  none: number
  byRung: Record<number, number>
}> {
  const admin = createAdminClient()
  const onlyMissing = options.onlyMissing ?? true

  /*
   * THIS LOOP USED TO BE WRITTEN BY HAND HERE, AND IT CARRIED BOTH OF THE
   * DEFECTS `readEveryRow` EXISTS FOR. It advanced by the page size rather
   * than by the rows received, so a project whose ceiling had been lowered
   * below 1,000 would have stopped after one page believing it had read
   * everything; and it ordered by `created_at` alone, which is not a total
   * order, so two orders sharing a timestamp across a page boundary could be
   * returned twice or skipped entirely.
   */
  const orders = (await readEveryRow('orders', (from, to) =>
    admin
      .from('orders')
      .select('id, order_number, event_id, guest_email, user_id, created_at')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  )) as OrderRow[]

  const existing = new Set<string>()
  {
    // Which orders already have a decision. A short read here re-decides an
    // order that was already decided.
    const data = await readEveryRow('the existing attributions', (from, to) =>
      admin.from('marketing_attribution').select('order_id').order('order_id', { ascending: true }).range(from, to),
    )
    for (const row of data) existing.add(row.order_id)
  }

  const todo = onlyMissing ? orders.filter(o => !existing.has(o.id)) : orders
  const eventIds = [...new Set(todo.map(o => o.event_id))]
  const [config, captureEnabled, clicksByEvent] = await Promise.all([
    readAttributionConfig(),
    isFeatureEnabled('marketing_attribution_capture_enabled'),
    loadClicksForEvents(eventIds),
  ])

  const emailByUser = new Map<string, string>()
  const userIds = [...new Set(todo.map(o => o.user_id).filter((v): v is string => Boolean(v)))]
  for (let i = 0; i < userIds.length; i += 200) {
    const { data } = await admin
      .from('profiles')
      .select('id, email')
      .in('id', userIds.slice(i, i + 200))
      // Keyed by id, so at most the 200 asked for.
      .limit(200)
    for (const p of data ?? []) if (p.email) emailByUser.set(p.id, p.email)
  }

  const signals = new Map<string, { click_id: string | null; query_identifiers: unknown; cookie_present: boolean }>()
  {
    // The signal that identifies which click an order came from. A truncated
    // read is an order silently attributed to nobody.
    const data = await readEveryRow('the order signals', (from, to) =>
      admin
        .from('marketing_order_signal')
        .select('order_id, click_id, query_identifiers, cookie_present')
        .order('order_id', { ascending: true })
        .range(from, to),
    )
    for (const row of data) signals.set(row.order_id, row)
  }

  const spent = await spentClickIds(null)
  const byRung: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let attributed = 0
  let none = 0

  // Oldest first, so "already spent" means spent by an earlier sale rather than
  // by whichever row a query happened to return first.
  for (const order of todo) {
    const decision = resolveOne({
      order,
      buyerKeys: await buyerIdentityKeys(order, emailByUser),
      clicks: clicksByEvent.get(order.event_id) ?? [],
      signalRow: signals.get(order.id) ?? null,
      config,
      captureEnabled,
      spent,
    })
    await writeDecision(order, decision)
    byRung[decision.rung] += 1
    if (decision.decision === 'attributed') {
      attributed += 1
      if (decision.clickId && decision.rung <= 3) spent.add(decision.clickId)
    } else none += 1
  }

  return { ordersConsidered: orders.length, written: todo.length, attributed, none, byRung }
}
