import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Admin payout cockpit data access. Read-only helpers over the service-role
 * client. The authoritative available balance comes from the
 * organiser_available_balance RPC (the same figure disburse_payout enforces);
 * holds and payout history are read from their tables. All disbursement writes
 * flow through createPayout / voidPayoutById (the payout service), never here.
 *
 * v1 is AUD-only (AU launch); the balance figure is per org in AUD. Multi-
 * currency rollups are a later concern.
 */

export const PAYOUT_CURRENCY = 'AUD'

export interface PayoutOrgRow {
  id: string
  name: string
  slug: string | null
  payoutStatus: string
  stripeAccountConnected: boolean
  availableCents: number
  onHoldCents: number
  pendingCount: number
  lastPayoutAt: string | null
  lastPayoutStatus: string | null
}

export interface PayoutHoldRow {
  id: string
  amountCents: number
  currency: string
  holdType: string
  releaseAt: string
  releasedAt: string | null
  reasonText: string | null
}

export interface PayoutHistoryRow {
  id: string
  amountCents: number
  currency: string
  status: string
  stripePayoutId: string | null
  initiatedBy: string | null
  reversedAt: string | null
  createdAt: string
}

export interface PayoutOrgDetail {
  id: string
  name: string
  slug: string | null
  payoutStatus: string
  stripeAccountConnected: boolean
  availableCents: number
  onHoldCents: number
  holds: PayoutHoldRow[]
  payouts: PayoutHistoryRow[]
}

export interface PayoutSummary {
  totalAvailableCents: number
  totalOnHoldCents: number
  pendingCount: number
  paidCount: number
}

const PAGE_SIZE = 25

async function availableFor(db: ReturnType<typeof createAdminClient>, orgId: string): Promise<number> {
  const { data, error } = await db.rpc('organiser_available_balance', {
    p_organisation_id: orgId,
    p_currency: PAYOUT_CURRENCY,
  })
  if (error) throw new Error(`organiser_available_balance: ${error.message}`)
  return Number(data ?? 0)
}

export async function listOrgsForPayouts(opts: { search?: string; page?: number }): Promise<{
  rows: PayoutOrgRow[]
  page: number
  hasMore: boolean
}> {
  const db = createAdminClient()
  const page = Math.max(opts.page ?? 1, 1)
  const from = (page - 1) * PAGE_SIZE

  let query = db
    .from('organisations')
    .select('id, name, slug, payout_status, stripe_account_id')
    .order('name', { ascending: true })
    .range(from, from + PAGE_SIZE)

  const search = opts.search?.trim()
  if (search) query = query.ilike('name', `%${search}%`)

  const { data, error } = await query
  if (error) throw new Error(`listOrgsForPayouts: ${error.message}`)

  const all = (data ?? []) as Array<Record<string, unknown>>
  const hasMore = all.length > PAGE_SIZE
  const orgs = all.slice(0, PAGE_SIZE)
  const ids = orgs.map(o => o.id as string)

  // Bulk holds (unreleased) + payouts for the visible page, aggregated in JS.
  const holdByOrg = new Map<string, number>()
  const lastPayout = new Map<string, { at: string; status: string }>()
  const pendingByOrg = new Map<string, number>()

  if (ids.length > 0) {
    const { data: holds } = await db
      .from('payout_holds')
      .select('organisation_id, amount_cents')
      .in('organisation_id', ids)
      .eq('currency', PAYOUT_CURRENCY)
      .is('released_at', null)
    for (const h of holds ?? []) {
      const oid = h.organisation_id as string
      holdByOrg.set(oid, (holdByOrg.get(oid) ?? 0) + Number(h.amount_cents ?? 0))
    }

    const { data: payouts } = await db
      .from('payouts')
      .select('organisation_id, status, created_at')
      .in('organisation_id', ids)
      .order('created_at', { ascending: false })
    for (const p of payouts ?? []) {
      const oid = p.organisation_id as string
      if (!lastPayout.has(oid)) lastPayout.set(oid, { at: p.created_at as string, status: p.status as string })
      if (p.status === 'pending' || p.status === 'in_transit') {
        pendingByOrg.set(oid, (pendingByOrg.get(oid) ?? 0) + 1)
      }
    }
  }

  // Authoritative balance per visible org (small page, bounded RPC calls).
  const rows: PayoutOrgRow[] = await Promise.all(
    orgs.map(async o => {
      const id = o.id as string
      const last = lastPayout.get(id)
      return {
        id,
        name: o.name as string,
        slug: (o.slug as string | null) ?? null,
        payoutStatus: (o.payout_status as string | null) ?? 'unknown',
        stripeAccountConnected: Boolean(o.stripe_account_id),
        availableCents: await availableFor(db, id),
        onHoldCents: holdByOrg.get(id) ?? 0,
        pendingCount: pendingByOrg.get(id) ?? 0,
        lastPayoutAt: last?.at ?? null,
        lastPayoutStatus: last?.status ?? null,
      }
    }),
  )

  return { rows, page, hasMore }
}

export async function getPayoutSummary(): Promise<PayoutSummary> {
  const db = createAdminClient()
  // Totals across the ledger and holds. At launch scale this is a bounded scan;
  // a materialised rollup is a later optimisation if org counts grow large.
  const { data: ledger } = await db
    .from('organiser_balance_ledger')
    .select('delta_cents')
    .eq('currency', PAYOUT_CURRENCY)
  const totalAvailableCents = (ledger ?? []).reduce((s, r) => s + Number(r.delta_cents ?? 0), 0)

  const { data: holds } = await db
    .from('payout_holds')
    .select('amount_cents')
    .eq('currency', PAYOUT_CURRENCY)
    .is('released_at', null)
  const totalOnHoldCents = (holds ?? []).reduce((s, r) => s + Number(r.amount_cents ?? 0), 0)

  const { count: pendingCount } = await db
    .from('payouts')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'in_transit'])
  const { count: paidCount } = await db
    .from('payouts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'paid')

  return {
    totalAvailableCents,
    totalOnHoldCents,
    pendingCount: pendingCount ?? 0,
    paidCount: paidCount ?? 0,
  }
}

export async function getOrgPayoutDetail(orgId: string): Promise<PayoutOrgDetail | null> {
  const db = createAdminClient()
  const { data: org } = await db
    .from('organisations')
    .select('id, name, slug, payout_status, stripe_account_id')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) return null

  const availableCents = await availableFor(db, orgId)

  const { data: holdRows } = await db
    .from('payout_holds')
    .select('id, amount_cents, currency, hold_type, release_at, released_at, reason_text')
    .eq('organisation_id', orgId)
    .order('release_at', { ascending: true })
  const holds: PayoutHoldRow[] = (holdRows ?? []).map(h => ({
    id: h.id as string,
    amountCents: Number(h.amount_cents ?? 0),
    currency: h.currency as string,
    holdType: h.hold_type as string,
    releaseAt: h.release_at as string,
    releasedAt: (h.released_at as string | null) ?? null,
    reasonText: (h.reason_text as string | null) ?? null,
  }))
  const onHoldCents = holds.filter(h => !h.releasedAt).reduce((s, h) => s + h.amountCents, 0)

  const { data: payoutRows } = await db
    .from('payouts')
    .select('id, amount_cents, currency, status, stripe_payout_id, initiated_by, reversed_at, created_at')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false })
  const payouts: PayoutHistoryRow[] = (payoutRows ?? []).map(p => ({
    id: p.id as string,
    amountCents: Number(p.amount_cents ?? 0),
    currency: p.currency as string,
    status: p.status as string,
    stripePayoutId: (p.stripe_payout_id as string | null) ?? null,
    initiatedBy: (p.initiated_by as string | null) ?? null,
    reversedAt: (p.reversed_at as string | null) ?? null,
    createdAt: p.created_at as string,
  }))

  return {
    id: org.id as string,
    name: org.name as string,
    slug: (org.slug as string | null) ?? null,
    payoutStatus: (org.payout_status as string | null) ?? 'unknown',
    stripeAccountConnected: Boolean(org.stripe_account_id),
    availableCents,
    onHoldCents,
    holds,
    payouts,
  }
}
