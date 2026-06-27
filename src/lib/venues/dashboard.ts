import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVenueRevenueSharePercentage } from '@/lib/payments/pricing-rules'
import { getCurrencyForCountry } from '@/lib/payments/application-fee'
import type { VenueRevenueShareStatus, VenueShareLedgerRow } from '@/lib/venues/types'

/**
 * Venue-facing dashboard data for the Venue Revenue Sharing Program. Scoped to
 * the venues owned by the signed-in user's organisation(s): the caller's org
 * memberships are resolved from the DB (owner_id or owner/admin/manager
 * membership), so reading program rows for exactly those venues never leaks
 * across organisations. Untyped admin client for the new tables (matches the
 * payments modules, until database.ts is regenerated post-migration).
 */
function db(): SupabaseClient {
  return createAdminClient() as unknown as SupabaseClient
}

export interface VenueDashboardEvent {
  eventId: string
  title: string | null
  endDate: string | null
  payableCents: number
  paidCents: number
}

export interface VenueDashboardVenue {
  id: string
  name: string
  city: string | null
  status: VenueRevenueShareStatus
  enrolledAt: string | null
  stripeReady: boolean
  currency: string
  earnedNetCents: number
  paidCents: number
  payableCents: number
  events: VenueDashboardEvent[]
}

export interface VenueDashboardData {
  ratePercentage: number | null
  venues: VenueDashboardVenue[]
}

/** Resolve the organisation ids the user owns or co-manages. */
async function resolveUserOrgIds(admin: SupabaseClient, userId: string): Promise<string[]> {
  const [{ data: owned }, { data: memberships }] = await Promise.all([
    admin.from('organisations').select('id').eq('owner_id', userId),
    admin
      .from('organisation_members')
      .select('organisation_id, role')
      .eq('user_id', userId)
      .in('role', ['owner', 'admin', 'manager']),
  ])
  const ids = new Set<string>()
  for (const o of (owned ?? []) as Array<{ id: string }>) ids.add(o.id)
  for (const m of (memberships ?? []) as Array<{ organisation_id: string }>) ids.add(m.organisation_id)
  return [...ids]
}

export async function readVenueDashboardForUser(userId: string): Promise<VenueDashboardData> {
  const admin = db()
  let ratePercentage: number | null = null
  try {
    ratePercentage = await getVenueRevenueSharePercentage('AU', 'AUD')
  } catch {
    ratePercentage = null
  }

  const orgIds = await resolveUserOrgIds(admin, userId)
  if (orgIds.length === 0) return { ratePercentage, venues: [] }

  const { data: venues } = await admin
    .from('venues')
    .select('id, name, city, revenue_share_status, revenue_share_enrolled_at, stripe_account_id, stripe_payouts_enabled, stripe_account_country')
    .in('organisation_id', orgIds)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(200)
  const venueRows = (venues ?? []) as Array<Record<string, unknown>>
  if (venueRows.length === 0) return { ratePercentage, venues: [] }

  const venueIds = venueRows.map((v) => v.id as string)
  const [{ data: ledger }, { data: events }] = await Promise.all([
    admin.from('venue_share_ledger').select('venue_id, event_id, delta_cents, reason').in('venue_id', venueIds),
    admin.from('events').select('id, title, end_date, venue_id').in('venue_id', venueIds).order('end_date', { ascending: false }).limit(500),
  ])

  const ledgerByVenue = new Map<string, Array<{ event_id: string | null; delta_cents: number; reason: VenueShareLedgerRow['reason'] }>>()
  for (const l of (ledger ?? []) as Array<{ venue_id: string; event_id: string | null; delta_cents: number; reason: VenueShareLedgerRow['reason'] }>) {
    const arr = ledgerByVenue.get(l.venue_id) ?? []
    arr.push({ event_id: l.event_id, delta_cents: l.delta_cents, reason: l.reason })
    ledgerByVenue.set(l.venue_id, arr)
  }
  const eventsByVenue = new Map<string, Array<{ id: string; title: string | null; end_date: string | null }>>()
  for (const e of (events ?? []) as Array<{ id: string; title: string | null; end_date: string | null; venue_id: string }>) {
    const arr = eventsByVenue.get(e.venue_id) ?? []
    arr.push({ id: e.id, title: e.title, end_date: e.end_date })
    eventsByVenue.set(e.venue_id, arr)
  }

  const out: VenueDashboardVenue[] = venueRows.map((v) => {
    const vid = v.id as string
    const rows = ledgerByVenue.get(vid) ?? []
    let earnedNet = 0
    let paid = 0
    let payable = 0
    const perEvent = new Map<string, { payable: number; paid: number }>()
    for (const r of rows) {
      payable += r.delta_cents
      if (r.reason === 'accrual' || r.reason === 'refund_reversal') earnedNet += r.delta_cents
      if (r.reason === 'payout') paid += Math.abs(r.delta_cents)
      if (r.event_id) {
        const pe = perEvent.get(r.event_id) ?? { payable: 0, paid: 0 }
        pe.payable += r.delta_cents
        if (r.reason === 'payout') pe.paid += Math.abs(r.delta_cents)
        perEvent.set(r.event_id, pe)
      }
    }
    const currency = getCurrencyForCountry((v.stripe_account_country as string | null) ?? null) ?? 'AUD'
    const eventViews: VenueDashboardEvent[] = (eventsByVenue.get(vid) ?? []).map((e) => ({
      eventId: e.id,
      title: e.title,
      endDate: e.end_date,
      payableCents: perEvent.get(e.id)?.payable ?? 0,
      paidCents: perEvent.get(e.id)?.paid ?? 0,
    }))
    return {
      id: vid,
      name: v.name as string,
      city: (v.city as string | null) ?? null,
      status: (v.revenue_share_status as VenueRevenueShareStatus) ?? 'not_enrolled',
      enrolledAt: (v.revenue_share_enrolled_at as string | null) ?? null,
      stripeReady: Boolean(v.stripe_account_id) && Boolean(v.stripe_payouts_enabled),
      currency,
      earnedNetCents: earnedNet,
      paidCents: paid,
      payableCents: payable,
      events: eventViews,
    }
  })

  return { ratePercentage, venues: out }
}
