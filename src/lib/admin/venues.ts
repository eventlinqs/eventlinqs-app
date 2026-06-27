import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordAuditEvent } from '@/lib/admin/audit'
import { invalidatePricingRule } from '@/lib/payments/pricing-rules'
import { getStripeClient } from '@/lib/payments/payout'
import { getDefaultTransferGateway } from '@/lib/payments/gateway-factory'
import { createVenueTransfer } from '@/lib/payments/venue-transfer'
import { getCurrencyForCountry } from '@/lib/payments/application-fee'
import type { AdminSession } from '@/lib/admin/types'
import type {
  VenueRevenueShareStatus,
  VenueShareLedgerRow,
  VenuePayoutRow,
  VenueEnrolmentRow,
} from '@/lib/venues/types'

/**
 * Admin data layer for the Venue Revenue Sharing Program. The new venue tables
 * are not yet in the generated database.ts (the founder regenerates after
 * applying the migration to TEST), so this module reads through an untyped
 * Supabase client, mirroring the payments modules. Every state change is
 * audit-logged; the rate is written single-source into pricing_rules.
 */
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

// The single editable scope for the venue share rate (matches the seed). AU is
// the launch market; GLOBAL is the fallback the resolver falls through to.
export const VENUE_RATE_SCOPES = [
  { countryCode: 'AU', currency: 'AUD', label: 'Australia' },
  { countryCode: 'GLOBAL', currency: 'AUD', label: 'Global default' },
] as const

export interface VenueShareRateView {
  countryCode: string
  currency: string
  label: string
  percentage: number | null
  version: number | null
}

export interface VenueAdminListRow {
  id: string
  name: string
  organisationId: string
  organisationName: string | null
  city: string | null
  status: VenueRevenueShareStatus
  enrolledAt: string | null
  stripeReady: boolean
  currency: string
  earnedNetCents: number // accruals - refund reversals
  paidCents: number // sum of paid venue_payouts
  payableCents: number // net ledger balance still owed
}

export interface VenueEventShareRow {
  eventId: string
  eventTitle: string | null
  endDate: string | null
  payableCents: number
  paidCents: number
  currency: string
}

export interface VenueAdminDetail {
  id: string
  name: string
  organisationId: string
  organisationName: string | null
  city: string | null
  status: VenueRevenueShareStatus
  enrolledAt: string | null
  unenrolledAt: string | null
  stripeAccountId: string | null
  stripePayoutsEnabled: boolean
  currency: string
  earnedNetCents: number
  paidCents: number
  payableCents: number
  events: VenueEventShareRow[]
  ledger: VenueShareLedgerRow[]
  payouts: VenuePayoutRow[]
  enrolments: VenueEnrolmentRow[]
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Current effective venue share rate for one scope. */
export async function readVenueShareRate(
  countryCode: string,
  currency: string
): Promise<{ percentage: number | null; version: number | null }> {
  const { data } = await db()
    .from('pricing_rules')
    .select('value_percentage, version')
    .eq('rule_type', 'venue_revenue_share_percentage')
    .eq('country_code', countryCode)
    .eq('currency', currency)
    .is('organisation_id', null)
    .is('event_id', null)
    .lte('effective_from', nowIso())
    .or(`effective_until.is.null,effective_until.gt.${nowIso()}`)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const row = data as { value_percentage: string | number | null; version: number } | null
  if (!row) return { percentage: null, version: null }
  return {
    percentage: row.value_percentage === null ? null : Number(row.value_percentage),
    version: row.version,
  }
}

export async function readVenueShareRates(): Promise<VenueShareRateView[]> {
  const out: VenueShareRateView[] = []
  for (const s of VENUE_RATE_SCOPES) {
    const r = await readVenueShareRate(s.countryCode, s.currency)
    out.push({ countryCode: s.countryCode, currency: s.currency, label: s.label, percentage: r.percentage, version: r.version })
  }
  return out
}

/**
 * Writes a new version of the venue share rate into pricing_rules (single
 * source of truth) and invalidates the resolver cache. Append-only and
 * audit-logged old -> new. No-op when unchanged.
 */
export async function writeVenueShareRate(
  input: { countryCode: string; currency: string; percentage: number },
  session: AdminSession
): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  const admin = db()
  const current = await readVenueShareRate(input.countryCode, input.currency)
  if (current.percentage !== null && current.percentage === input.percentage) {
    return { ok: true, changed: false }
  }
  const nextVersion = (current.version ?? 0) + 1
  const { error } = await admin.from('pricing_rules').insert({
    rule_type: 'venue_revenue_share_percentage',
    country_code: input.countryCode,
    currency: input.currency,
    event_type: 'ALL',
    organiser_tier: 'ALL',
    organisation_id: null,
    event_id: null,
    value_type: 'percentage',
    version: nextVersion,
    effective_from: nowIso(),
    effective_until: null,
    created_by: session.userId,
    value_percentage: input.percentage,
    value_cents: null,
    value_integer: null,
  })
  if (error) return { ok: false, changed: false, error: error.message }

  await invalidatePricingRule({
    ruleType: 'venue_revenue_share_percentage',
    countryCode: input.countryCode,
    currency: input.currency,
    organisationId: null,
    eventId: null,
  })
  await recordAuditEvent({
    action: 'admin.venue.rate_updated',
    targetType: 'venue_share_rate',
    targetId: `${input.countryCode}:${input.currency}`,
    metadata: { oldValue: current.percentage, newValue: input.percentage, version: nextVersion },
    session,
  })
  return { ok: true, changed: true }
}

interface LedgerAggregate {
  earnedNet: number
  paid: number
  payable: number
}

function aggregateLedger(rows: Array<Pick<VenueShareLedgerRow, 'delta_cents' | 'reason'>>): LedgerAggregate {
  let earnedNet = 0
  let paid = 0
  let payable = 0
  for (const r of rows) {
    payable += r.delta_cents
    if (r.reason === 'accrual' || r.reason === 'refund_reversal') earnedNet += r.delta_cents
    if (r.reason === 'payout') paid += Math.abs(r.delta_cents)
  }
  return { earnedNet, paid, payable }
}

/** The admin venue list: every venue with its program status and money totals. */
export async function readVenueAdminList(): Promise<VenueAdminListRow[]> {
  const admin = db()
  const { data: venues } = await admin
    .from('venues')
    .select('id, name, city, organisation_id, revenue_share_status, revenue_share_enrolled_at, stripe_account_id, stripe_payouts_enabled, stripe_account_country')
    .order('revenue_share_status', { ascending: true })
    .order('name', { ascending: true })
    .limit(500)
  const venueRows = (venues ?? []) as Array<Record<string, unknown>>
  if (venueRows.length === 0) return []

  const venueIds = venueRows.map((v) => v.id as string)
  const orgIds = [...new Set(venueRows.map((v) => v.organisation_id as string))]

  const [{ data: ledger }, { data: orgs }] = await Promise.all([
    admin.from('venue_share_ledger').select('venue_id, delta_cents, reason').in('venue_id', venueIds),
    admin.from('organisations').select('id, name').in('id', orgIds),
  ])
  const orgName = new Map<string, string>()
  for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) orgName.set(o.id, o.name)

  const byVenue = new Map<string, Array<Pick<VenueShareLedgerRow, 'delta_cents' | 'reason'>>>()
  for (const l of (ledger ?? []) as Array<{ venue_id: string; delta_cents: number; reason: VenueShareLedgerRow['reason'] }>) {
    const arr = byVenue.get(l.venue_id) ?? []
    arr.push({ delta_cents: l.delta_cents, reason: l.reason })
    byVenue.set(l.venue_id, arr)
  }

  return venueRows.map((v) => {
    const agg = aggregateLedger(byVenue.get(v.id as string) ?? [])
    return {
      id: v.id as string,
      name: v.name as string,
      organisationId: v.organisation_id as string,
      organisationName: orgName.get(v.organisation_id as string) ?? null,
      city: (v.city as string | null) ?? null,
      status: (v.revenue_share_status as VenueRevenueShareStatus) ?? 'not_enrolled',
      enrolledAt: (v.revenue_share_enrolled_at as string | null) ?? null,
      stripeReady: Boolean(v.stripe_account_id) && Boolean(v.stripe_payouts_enabled),
      currency: getCurrencyForCountry((v.stripe_account_country as string | null) ?? null) ?? 'AUD',
      earnedNetCents: agg.earnedNet,
      paidCents: agg.paid,
      payableCents: agg.payable,
    }
  })
}

export async function readVenueAdminDetail(venueId: string): Promise<VenueAdminDetail | null> {
  const admin = db()
  const { data: venue } = await admin
    .from('venues')
    .select('id, name, city, organisation_id, revenue_share_status, revenue_share_enrolled_at, revenue_share_unenrolled_at, stripe_account_id, stripe_payouts_enabled, stripe_account_country')
    .eq('id', venueId)
    .maybeSingle()
  if (!venue) return null
  const v = venue as Record<string, unknown>
  const currency = getCurrencyForCountry((v.stripe_account_country as string | null) ?? null) ?? 'AUD'

  const [{ data: org }, { data: ledger }, { data: payouts }, { data: enrolments }, { data: events }] = await Promise.all([
    admin.from('organisations').select('name').eq('id', v.organisation_id as string).maybeSingle(),
    admin.from('venue_share_ledger').select('*').eq('venue_id', venueId).order('created_at', { ascending: false }).limit(500),
    admin.from('venue_payouts').select('*').eq('venue_id', venueId).order('created_at', { ascending: false }).limit(200),
    admin.from('venue_enrolments').select('*').eq('venue_id', venueId).order('created_at', { ascending: false }).limit(100),
    admin.from('events').select('id, title, end_date').eq('venue_id', venueId).order('end_date', { ascending: false }).limit(200),
  ])

  const ledgerRows = (ledger ?? []) as VenueShareLedgerRow[]
  const agg = aggregateLedger(ledgerRows.map((r) => ({ delta_cents: r.delta_cents, reason: r.reason })))

  // Per-event payable / paid.
  const perEvent = new Map<string, { payable: number; paid: number }>()
  for (const r of ledgerRows) {
    if (!r.event_id) continue
    const e = perEvent.get(r.event_id) ?? { payable: 0, paid: 0 }
    e.payable += r.delta_cents
    if (r.reason === 'payout') e.paid += Math.abs(r.delta_cents)
    perEvent.set(r.event_id, e)
  }
  const eventRows = (events ?? []) as Array<{ id: string; title: string | null; end_date: string | null }>
  const eventViews: VenueEventShareRow[] = eventRows.map((e) => ({
    eventId: e.id,
    eventTitle: e.title,
    endDate: e.end_date,
    payableCents: perEvent.get(e.id)?.payable ?? 0,
    paidCents: perEvent.get(e.id)?.paid ?? 0,
    currency,
  }))

  return {
    id: v.id as string,
    name: v.name as string,
    organisationId: v.organisation_id as string,
    organisationName: (org as { name: string } | null)?.name ?? null,
    city: (v.city as string | null) ?? null,
    status: (v.revenue_share_status as VenueRevenueShareStatus) ?? 'not_enrolled',
    enrolledAt: (v.revenue_share_enrolled_at as string | null) ?? null,
    unenrolledAt: (v.revenue_share_unenrolled_at as string | null) ?? null,
    stripeAccountId: (v.stripe_account_id as string | null) ?? null,
    stripePayoutsEnabled: Boolean(v.stripe_payouts_enabled),
    currency,
    earnedNetCents: agg.earnedNet,
    paidCents: agg.paid,
    payableCents: agg.payable,
    events: eventViews,
    ledger: ledgerRows,
    payouts: (payouts ?? []) as VenuePayoutRow[],
    enrolments: (enrolments ?? []) as VenueEnrolmentRow[],
  }
}

/** Enrol or un-enrol a venue in the program; append-only history + audit. */
export async function setVenueEnrolment(
  venueId: string,
  enrol: boolean,
  session: AdminSession
): Promise<{ ok: boolean; changed: boolean; error?: string }> {
  const admin = db()
  const { data: venue } = await admin
    .from('venues')
    .select('id, name, revenue_share_status')
    .eq('id', venueId)
    .maybeSingle()
  if (!venue) return { ok: false, changed: false, error: 'venue_not_found' }
  const current = (venue as { revenue_share_status: VenueRevenueShareStatus }).revenue_share_status
  const targetStatus: VenueRevenueShareStatus = enrol ? 'enrolled' : 'not_enrolled'
  if (current === targetStatus) return { ok: true, changed: false }

  const rate = await readVenueShareRate('AU', 'AUD')
  const update: Record<string, unknown> = {
    revenue_share_status: targetStatus,
    updated_at: nowIso(),
  }
  if (enrol) update.revenue_share_enrolled_at = nowIso()
  else update.revenue_share_unenrolled_at = nowIso()

  const { error: updErr } = await admin.from('venues').update(update).eq('id', venueId)
  if (updErr) return { ok: false, changed: false, error: updErr.message }

  await admin.from('venue_enrolments').insert({
    venue_id: venueId,
    action: enrol ? 'enrolled' : 'unenrolled',
    share_percentage: rate.percentage,
    actor_admin_id: session.userId,
    metadata: { previous_status: current },
  })
  await recordAuditEvent({
    action: enrol ? 'admin.venue.enrolled' : 'admin.venue.unenrolled',
    targetType: 'venue',
    targetId: venueId,
    metadata: { previousStatus: current, newStatus: targetStatus, ratePercentage: rate.percentage },
    session,
  })
  return { ok: true, changed: true }
}

export interface VenuePayoutTriggerResult {
  ok: boolean
  status: 'paid' | 'nothing' | 'not_ready' | 'error'
  amountCents?: number
  detail?: string
}

/**
 * Triggers a venue payout for one event through the proven funds-holding
 * transfer path (createVenueTransfer). Requires the venue to have a payout-ready
 * connected account. Audit-logged.
 */
export async function triggerVenuePayout(
  venueId: string,
  eventId: string,
  session: AdminSession
): Promise<VenuePayoutTriggerResult> {
  const admin = db()
  const { data: venue } = await admin
    .from('venues')
    .select('id, stripe_account_id, stripe_account_country, stripe_payouts_enabled')
    .eq('id', venueId)
    .maybeSingle()
  if (!venue) return { ok: false, status: 'error', detail: 'venue_not_found' }
  const v = venue as { stripe_account_id: string | null; stripe_account_country: string | null; stripe_payouts_enabled: boolean }
  if (!v.stripe_account_id || !v.stripe_payouts_enabled) {
    return { ok: false, status: 'not_ready', detail: 'Venue has no payout-ready connected account.' }
  }
  const currency = getCurrencyForCountry(v.stripe_account_country) ?? 'AUD'

  let result: Awaited<ReturnType<typeof createVenueTransfer>>
  try {
    result = await createVenueTransfer(admin, getDefaultTransferGateway(), getStripeClient(), {
      venueId,
      eventId,
      currency,
      destinationAccountId: v.stripe_account_id,
      amountCents: null,
      actor: session.userId,
    })
  } catch (err) {
    await recordAuditEvent({
      action: 'admin.venue.payout_failed',
      targetType: 'venue',
      targetId: venueId,
      metadata: { eventId, error: err instanceof Error ? err.message : 'unknown' },
      session,
    })
    return { ok: false, status: 'error', detail: err instanceof Error ? err.message : 'unknown' }
  }

  if (result.success) {
    await recordAuditEvent({
      action: 'admin.venue.payout_disbursed',
      targetType: 'venue',
      targetId: venueId,
      metadata: { eventId, amountCents: result.amountCents, payoutId: result.payoutId, stripeTransferId: result.stripeTransferId },
      session,
    })
    return { ok: true, status: 'paid', amountCents: result.amountCents }
  }
  if (result.error === 'nothing_to_disburse') return { ok: true, status: 'nothing' }
  return { ok: false, status: 'error', detail: result.error }
}
