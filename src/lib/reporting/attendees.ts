import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { buildConsentIndex, isEmailConsented, type ConsentRow } from '@/lib/consent/status'
import type { AttendeeRow, OrderReportRow } from './types'

export type { AttendeeRow, OrderReportRow, AttendeeFilters } from './types'
export { filterAttendees } from './types'

/**
 * Organiser attendee + orders reporting data layer.
 *
 * Data sovereignty: an organiser may only ever read their OWN events' data.
 * Every fetch here goes through getOrganiserEvent(), which verifies the
 * logged-in user owns the event's organisation (organisations.owner_id =
 * auth.uid()) using the session client BEFORE any service-role read. The
 * admin client bypasses RLS, so the ownership gate is the only thing
 * standing between organisers; it must run first and must fail closed.
 */

// Ticket statuses that represent a real attendee on the guest list. Refunded,
// void and transferred tickets are not attending and are excluded from the
// attendee list and the door list.
export const ATTENDEE_STATUSES = new Set(['valid', 'scanned'])

export interface OrganiserEvent {
  id: string
  title: string
  slug: string
  startDate: string
  endDate: string | null
  timezone: string | null
  organisationId: string
  organisationName: string
  userId: string
}

/**
 * Verify the logged-in user owns the event (via organisations.owner_id) and
 * return the event, or null if not signed in / not the owner / not found.
 * Fails closed: any miss returns null so callers 404 rather than leak.
 */
export async function getOrganiserEvent(eventId: string): Promise<OrganiserEvent | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: event } = await supabase
    .from('events')
    .select('id, title, slug, start_date, end_date, timezone, organisation_id')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return null

  // Ownership gate: the organisation must belong to this user. Using the
  // session client means RLS also applies, so a non-owner cannot read the row.
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name')
    .eq('id', event.organisation_id)
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!org) return null

  return {
    id: event.id,
    title: event.title,
    slug: event.slug,
    startDate: event.start_date,
    endDate: event.end_date,
    timezone: event.timezone,
    organisationId: event.organisation_id,
    organisationName: org.name,
    userId: user.id,
  }
}

interface RawTicket {
  ticket_code: string
  holder_name: string | null
  holder_email: string
  status: string
  first_scanned_at: string | null
  ticket_tier: { name: string } | null
  order: { order_number: string; created_at: string } | null
}

/**
 * Fetch the attendee (guest) list for an event the organiser owns. Reads the
 * denormalised holder fields off tickets joined to the tier name and the
 * order ref. Service-role read, so callers MUST have passed getOrganiserEvent.
 */
export async function fetchEventAttendees(eventId: string): Promise<AttendeeRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('tickets')
    .select(
      'ticket_code, holder_name, holder_email, status, first_scanned_at, ticket_tier:ticket_tiers(name), order:orders(order_number, created_at)'
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  // Marketing-consent lookup for this event's organiser (Spam Act). The export
  // must show who may lawfully be emailed; a withdrawn consent reads as not
  // consented. Resolve the event's organisation, then its consent rows.
  const { data: eventRow } = await admin
    .from('events')
    .select('organisation_id')
    .eq('id', eventId)
    .maybeSingle()
  const consentIndex = new Map<string, { consented: boolean; unsubscribeToken: string }>()
  if (eventRow?.organisation_id) {
    const { data: consentRows } = await admin
      .from('organiser_marketing_consents')
      .select('email, status, unsubscribe_token')
      .eq('organisation_id', eventRow.organisation_id)
    const built = buildConsentIndex((consentRows ?? []) as ConsentRow[])
    for (const [k, v] of built) consentIndex.set(k, v)
  }
  const baseUrl = getSiteUrl().replace(/\/$/, '')

  const rows = (data ?? []) as unknown as RawTicket[]
  return rows
    .filter(t => ATTENDEE_STATUSES.has(t.status))
    .map(t => {
      const consented = isEmailConsented(consentIndex, t.holder_email)
      const token = consentIndex.get(t.holder_email.trim().toLowerCase())?.unsubscribeToken
      return {
        name: (t.holder_name ?? '').replace(/\s+/g, ' ').trim() || t.holder_email,
        email: t.holder_email,
        ticketType: (t.ticket_tier?.name ?? '').trim() || 'Admission',
        ticketCode: t.ticket_code,
        orderRef: t.order?.order_number ?? '',
        purchaseDate: t.order?.created_at ?? '',
        checkedIn: t.status === 'scanned' || t.first_scanned_at !== null,
        status: t.status,
        marketingConsent: consented,
        unsubscribeUrl: consented && token ? `${baseUrl}/unsubscribe/${token}` : null,
      }
    })
}

interface RawOrder {
  order_number: string
  created_at: string
  status: string
  currency: string
  subtotal_cents: number
  discount_cents: number
  platform_fee_cents: number
  processing_fee_cents: number
  total_cents: number
  user_id: string | null
  guest_name: string | null
  guest_email: string | null
  order_items: { item_type: string; quantity: number }[]
}

/**
 * Fetch the orders (financial + buyer transaction) report for an owned event.
 * Buyer name/email resolves from the profile when the order has a user, else
 * the guest fields. Fee columns are read off the order row so historical fee
 * structure is preserved per order. Service-role read.
 */
export async function fetchEventOrdersReport(eventId: string): Promise<OrderReportRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('orders')
    .select(
      'order_number, created_at, status, currency, subtotal_cents, discount_cents, platform_fee_cents, processing_fee_cents, total_cents, user_id, guest_name, guest_email, order_items(item_type, quantity)'
    )
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

  const orders = (data ?? []) as unknown as RawOrder[]

  // Resolve buyer identity for orders placed by a signed-in user.
  const userIds = [...new Set(orders.map(o => o.user_id).filter((id): id is string => !!id))]
  const profiles = new Map<string, { full_name: string | null; email: string }>()
  if (userIds.length > 0) {
    const { data: profileRows } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    for (const p of (profileRows ?? []) as { id: string; full_name: string | null; email: string }[]) {
      profiles.set(p.id, { full_name: p.full_name, email: p.email })
    }
  }

  return orders.map(o => {
    const profile = o.user_id ? profiles.get(o.user_id) : undefined
    const ticketCount = (o.order_items ?? [])
      .filter(i => i.item_type === 'ticket')
      .reduce((sum, i) => sum + i.quantity, 0)
    return {
      orderRef: o.order_number,
      buyerName: profile?.full_name ?? o.guest_name ?? '',
      buyerEmail: profile?.email ?? o.guest_email ?? '',
      purchaseDate: o.created_at,
      status: o.status,
      ticketCount,
      currency: o.currency,
      subtotalCents: o.subtotal_cents,
      discountCents: o.discount_cents,
      platformFeeCents: o.platform_fee_cents,
      processingFeeCents: o.processing_fee_cents,
      totalCents: o.total_cents,
    }
  })
}
