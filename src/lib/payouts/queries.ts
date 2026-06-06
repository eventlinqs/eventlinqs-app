import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReservePercentage, getPayoutScheduleDays } from '@/lib/payments/pricing-rules'
import type { PayoutRecordStatus } from '@/types/database'

/**
 * M6 Phase 4 Payouts Dashboard - server-side data layer.
 *
 * All functions take an `organisationId` that callers must have already
 * resolved against the authenticated user's owned organisation (see
 * `resolveOrganiserScope` in ./auth). The admin client is used internally so a
 * single call covers cross-table aggregates without paying the RLS round-trip
 * on every join. Never pass an orgId that came from the client unverified.
 *
 * Currency: v1 is AUD-only. The authoritative accounting tables
 * (`organiser_balance_ledger`, `payout_holds`) store currency UPPERCASE
 * ('AUD'), seeded from `orders.currency DEFAULT 'AUD'`. The admin payout
 * cockpit (src/lib/admin/payouts.ts) reads with PAYOUT_CURRENCY = 'AUD'. We
 * mirror that exact constant here so the organiser view and the admin view can
 * never disagree on available balance or held reserves.
 */

/** Mirror of src/lib/admin/payouts.ts PAYOUT_CURRENCY. Kept local to avoid a
 *  cross-session import from the admin module; v1 is AUD-only. */
const LEDGER_CURRENCY = 'AUD'

/**
 * The generated Supabase types expose `organiser_balance_ledger.reason` and
 * `payout_holds.hold_type` as plain `string` (they are CHECK-constrained text
 * columns, not Postgres enums). We narrow them here to the constrained value
 * sets so the UI can switch exhaustively. Keep in lockstep with the CHECK
 * constraints in supabase/migrations/20260428000001_m6_connect_schema.sql.
 */
export type LedgerReason =
  | 'order_confirmed'
  | 'reserve_hold'
  | 'reserve_release'
  | 'payout'
  | 'refund_from_balance'
  | 'refund_from_reserve'
  | 'refund_from_gateway'
  | 'refund_platform_float'
  | 'chargeback'
  | 'chargeback_fee'
  | 'adjustment'

export type PayoutHoldType =
  | 'reserve'
  | 'chargeback'
  | 'admin_manual'
  | 'negative_balance'
  | 'new_organiser'

export interface PayoutListRow {
  id: string
  stripe_payout_id: string | null
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
    // `payouts.currency` mirrors Stripe's payout objects; match case-insensitively
    // so the optional filter works whatever case the caller passes.
    query = query.ilike('currency', options.currency)
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
  /** Authoritative claimable balance from organiser_available_balance() - the
   *  exact figure the admin cockpit shows for this org. */
  availableCents: number
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

  const [
    availableRes,
    pendingRes,
    paidThisMonthRes,
    holdsRes,
    lifetimeRes,
    nextArrivalRes,
  ] = await Promise.all([
    // Mirror admin/payouts.ts availableFor(): the SECURITY DEFINER RPC summing
    // the append-only ledger for org + 'AUD'. Same input -> same number.
    admin.rpc('organiser_available_balance', {
      p_organisation_id: organisationId,
      p_currency: LEDGER_CURRENCY,
    }),
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
    // Match admin's hold aggregation exactly: currency 'AUD', unreleased only.
    admin
      .from('payout_holds')
      .select('amount_cents, currency')
      .eq('organisation_id', organisationId)
      .eq('currency', LEDGER_CURRENCY)
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
  ])

  return {
    currency: LEDGER_CURRENCY,
    availableCents: Number(availableRes.data ?? 0),
    pendingCents: sumCents(pendingRes.data as { amount_cents: number }[] | null),
    paidThisMonthCents: sumCents(paidThisMonthRes.data as { amount_cents: number }[] | null),
    onHoldCents: sumCents(holdsRes.data as { amount_cents: number }[] | null),
    lifetimeCents: sumCents(lifetimeRes.data as { amount_cents: number }[] | null),
    nextArrivalDate: (nextArrivalRes.data?.arrival_date as string | null | undefined) ?? null,
  }
}

/**
 * Tier, cadence, and reserve that apply to the organisation - the exact view
 * the organiser terms promise ("The current payout tier, cadence, and reserve
 * that apply to your account are shown in your organiser dashboard.",
 * src/app/legal/organiser-terms). Tier/schedule come from the organisations
 * row; reserve % and cadence days come from the pricing-rules service (the same
 * source the settlement and reserve workers use), so what the organiser is told
 * matches what is actually charged and held.
 */
export interface PayoutTerms {
  tier: string
  tierLabel: string
  schedule: string
  scheduleLabel: string
  onDemandEligible: boolean
  cadenceDays: number
  reservePercent: number
}

const TIER_LABELS: Record<string, string> = {
  tier_1: 'Standard',
  tier_2: 'Verified',
  tier_3: 'Trusted',
}

export async function getOrganiserPayoutTerms(
  organisationId: string,
  client?: SupabaseClient
): Promise<PayoutTerms> {
  const admin = client ?? createAdminClient()

  const { data: org } = await admin
    .from('organisations')
    .select('payout_tier, payout_schedule, stripe_account_country')
    .eq('id', organisationId)
    .maybeSingle()

  const tier = (org?.payout_tier as string | null) ?? 'tier_1'
  const schedule = (org?.payout_schedule as string | null) ?? 'post_event_only'
  const countryCode = ((org?.stripe_account_country as string | null) ?? 'AU').toUpperCase()

  const [reservePercent, cadenceDays] = await Promise.all([
    getReservePercentage(countryCode, LEDGER_CURRENCY, organisationId),
    getPayoutScheduleDays(countryCode, LEDGER_CURRENCY, organisationId),
  ])

  const onDemandEligible = schedule === 'scheduled_plus_on_demand'

  return {
    tier,
    tierLabel: TIER_LABELS[tier] ?? 'Standard',
    schedule,
    scheduleLabel: onDemandEligible
      ? 'Scheduled, plus on-demand pre-event payouts'
      : 'Released after each event completes',
    onDemandEligible,
    cadenceDays,
    reservePercent,
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
    hold_type: string
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
      hold_type: r.hold_type as PayoutHoldType,
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
