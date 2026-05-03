import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  LedgerReason,
  PayoutHoldType,
  PayoutRecordStatus,
} from '@/types/database'

/**
 * M6 Phase 4 Payouts Dashboard - server-side data layer.
 *
 * All functions take an `organisationId` that callers must have already
 * resolved against the authenticated user's owned organisation. The admin
 * client is used internally so a single call covers cross-table aggregates
 * without paying the RLS round-trip on every join.
 *
 * Callers (API routes, Server Components):
 *   1. await createClient(); supabase.auth.getUser()
 *   2. select organisations.id where owner_id = user.id (or via membership)
 *   3. pass that orgId here. Never trust an orgId from the client.
 */

export interface PayoutListRow {
  id: string
  stripe_payout_id: string
  amount_cents: number
  currency: string
  arrival_date: string | null
  status: PayoutRecordStatus
  failure_reason: string | null
  created_at: string
  updated_at: string
}

export interface PayoutListPage {
  rows: PayoutListRow[]
  total: number
  limit: number
  offset: number
}

export interface GetOrganiserPayoutsOptions {
  status?: PayoutRecordStatus | 'all'
  currency?: string
  fromDate?: string
  toDate?: string
  limit?: number
  offset?: number
}

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export async function getOrganiserPayouts(
  organisationId: string,
  options: GetOrganiserPayoutsOptions = {},
  client?: SupabaseClient
): Promise<PayoutListPage> {
  const admin = client ?? createAdminClient()
  const limit = clampLimit(options.limit)
  const offset = Math.max(0, options.offset ?? 0)

  let query = admin
    .from('payouts')
    .select(
      'id, stripe_payout_id, amount_cents, currency, arrival_date, status, failure_reason, created_at, updated_at',
      { count: 'exact' }
    )
    .eq('organisation_id', organisationId)
    .order('arrival_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (options.status && options.status !== 'all') {
    query = query.eq('status', options.status)
  }
  if (options.currency) {
    query = query.eq('currency', options.currency.toLowerCase())
  }
  if (options.fromDate) {
    query = query.gte('arrival_date', options.fromDate)
  }
  if (options.toDate) {
    query = query.lte('arrival_date', options.toDate)
  }

  const { data, error, count } = await query
  if (error) {
    console.error('[payouts/queries] getOrganiserPayouts failed', { organisationId, error })
    return { rows: [], total: 0, limit, offset }
  }

  return {
    rows: (data ?? []) as PayoutListRow[],
    total: count ?? 0,
    limit,
    offset,
  }
}

export interface PayoutSummary {
  currency: string
  pendingCents: number
  paidThisMonthCents: number
  onHoldCents: number
  lifetimeCents: number
  nextArrivalDate: string | null
}

export async function getOrganiserPayoutSummary(
  organisationId: string,
  client?: SupabaseClient
): Promise<PayoutSummary> {
  const admin = client ?? createAdminClient()

  const startOfMonthIso = startOfMonthUtc(new Date()).toISOString()

  const [pendingRes, paidThisMonthRes, holdsRes, lifetimeRes, nextArrivalRes, orgRes] =
    await Promise.all([
      admin
        .from('payouts')
        .select('amount_cents, currency')
        .eq('organisation_id', organisationId)
        .in('status', ['pending', 'in_transit']),
      admin
        .from('payouts')
        .select('amount_cents, currency')
        .eq('organisation_id', organisationId)
        .eq('status', 'paid')
        .gte('arrival_date', startOfMonthIso),
      admin
        .from('payout_holds')
        .select('amount_cents, currency')
        .eq('organisation_id', organisationId)
        .is('released_at', null),
      admin
        .from('payouts')
        .select('amount_cents, currency')
        .eq('organisation_id', organisationId)
        .eq('status', 'paid'),
      admin
        .from('payouts')
        .select('arrival_date')
        .eq('organisation_id', organisationId)
        .in('status', ['pending', 'in_transit'])
        .order('arrival_date', { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('organisations')
        .select('stripe_account_country')
        .eq('id', organisationId)
        .maybeSingle(),
    ])

  const currency = pickCurrency(
    [pendingRes.data, paidThisMonthRes.data, holdsRes.data, lifetimeRes.data].flat() as
      | { currency?: string }[]
      | null,
    orgRes.data?.stripe_account_country as string | null | undefined
  )

  return {
    currency,
    pendingCents: sumCents(pendingRes.data as { amount_cents: number }[] | null),
    paidThisMonthCents: sumCents(paidThisMonthRes.data as { amount_cents: number }[] | null),
    onHoldCents: sumCents(holdsRes.data as { amount_cents: number }[] | null),
    lifetimeCents: sumCents(lifetimeRes.data as { amount_cents: number }[] | null),
    nextArrivalDate: (nextArrivalRes.data?.arrival_date as string | null | undefined) ?? null,
  }
}

export interface ReserveReleaseRow {
  id: string
  event_id: string | null
  event_title: string | null
  hold_type: PayoutHoldType
  amount_cents: number
  currency: string
  release_at: string
}

export async function getReserveReleaseSchedule(
  organisationId: string,
  daysAhead = 30,
  client?: SupabaseClient
): Promise<ReserveReleaseRow[]> {
  const admin = client ?? createAdminClient()
  const horizon = new Date()
  horizon.setUTCDate(horizon.getUTCDate() + Math.max(1, Math.floor(daysAhead)))

  const { data, error } = await admin
    .from('payout_holds')
    .select('id, event_id, hold_type, amount_cents, currency, release_at, events(title)')
    .eq('organisation_id', organisationId)
    .is('released_at', null)
    .lte('release_at', horizon.toISOString())
    .order('release_at', { ascending: true })

  if (error) {
    console.error('[payouts/queries] getReserveReleaseSchedule failed', {
      organisationId,
      error,
    })
    return []
  }

  type Row = {
    id: string
    event_id: string | null
    hold_type: PayoutHoldType
    amount_cents: number
    currency: string
    release_at: string
    events: { title: string } | { title: string }[] | null
  }

  return (data ?? []).map((row) => {
    const r = row as unknown as Row
    const eventsRel = Array.isArray(r.events) ? r.events[0] : r.events
    return {
      id: r.id,
      event_id: r.event_id,
      event_title: eventsRel?.title ?? null,
      hold_type: r.hold_type,
      amount_cents: r.amount_cents,
      currency: r.currency,
      release_at: r.release_at,
    }
  })
}

const REFUND_REASONS: LedgerReason[] = [
  'refund_from_balance',
  'refund_from_reserve',
  'refund_from_gateway',
  'refund_platform_float',
  'chargeback',
  'chargeback_fee',
]

export interface RefundImpactRow {
  id: string
  reason: LedgerReason
  delta_cents: number
  currency: string
  reference_type: string | null
  reference_id: string | null
  created_at: string
  metadata: Record<string, unknown>
}

export interface RefundImpactPage {
  rows: RefundImpactRow[]
  total: number
  limit: number
  offset: number
}

export async function getRefundImpact(
  organisationId: string,
  options: { limit?: number; offset?: number } = {},
  client?: SupabaseClient
): Promise<RefundImpactPage> {
  const admin = client ?? createAdminClient()
  const limit = clampLimit(options.limit)
  const offset = Math.max(0, options.offset ?? 0)

  const { data, error, count } = await admin
    .from('organiser_balance_ledger')
    .select(
      'id, reason, delta_cents, currency, reference_type, reference_id, created_at, metadata',
      { count: 'exact' }
    )
    .eq('organisation_id', organisationId)
    .in('reason', REFUND_REASONS)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[payouts/queries] getRefundImpact failed', { organisationId, error })
    return { rows: [], total: 0, limit, offset }
  }

  return {
    rows: (data ?? []) as RefundImpactRow[],
    total: count ?? 0,
    limit,
    offset,
  }
}

function clampLimit(value: number | undefined): number {
  if (!value || value <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(value, MAX_PAGE_SIZE)
}

function sumCents(rows: { amount_cents: number }[] | null): number {
  if (!rows) return 0
  let total = 0
  for (const row of rows) {
    total += row.amount_cents ?? 0
  }
  return total
}

function startOfMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0))
}

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  AU: 'aud',
  GB: 'gbp',
  US: 'usd',
  NZ: 'nzd',
  CA: 'cad',
  IE: 'eur',
  AT: 'eur', BE: 'eur', BG: 'bgn', HR: 'eur', CY: 'eur', CZ: 'czk',
  DK: 'dkk', EE: 'eur', FI: 'eur', FR: 'eur', DE: 'eur', GR: 'eur',
  HU: 'huf', IT: 'eur', LV: 'eur', LT: 'eur', LU: 'eur', MT: 'eur',
  NL: 'eur', PL: 'pln', PT: 'eur', RO: 'ron', SK: 'eur', SI: 'eur',
  ES: 'eur', SE: 'sek',
}

function pickCurrency(
  rows: { currency?: string }[] | null,
  countryCode: string | null | undefined
): string {
  if (rows) {
    for (const row of rows) {
      if (row?.currency) return row.currency
    }
  }
  if (countryCode) {
    const mapped = COUNTRY_TO_CURRENCY[countryCode.toUpperCase()]
    if (mapped) return mapped
  }
  return 'aud'
}
