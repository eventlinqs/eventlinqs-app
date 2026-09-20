import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { getSiteUrl } from '@/lib/site-url'
import { buildConsentIndex, isEmailConsented, type ConsentRow } from '@/lib/consent/status'
import type { AttendeeRow, OrderReportRow } from './types'
import { byOrderReadingOrder, byTicketReadingOrder } from './ordering'
import { resolveEventAccess } from '@/lib/organisations/event-access'

export type { AttendeeRow, OrderReportRow, AttendeeFilters } from './types'
export { filterAttendees } from './types'

/**
 * Organiser attendee + orders reporting data layer.
 *
 * Data sovereignty: an organiser may only ever read their OWN events' data.
 * Every fetch here goes through getOrganiserEvent(), which resolves access through
 * the single shared gate (src/lib/organisations/event-access.ts) BEFORE any
 * service-role read. The admin client bypasses RLS, so that gate is the only thing
 * standing between organisers; it must run first and must fail closed.
 *
 * The gate admits the organisation OWNER **or** an organisation_members row with
 * role owner, admin or manager. It was owner-only until 2026-08-19, which silently
 * contradicted the refund path: resolveRefundScope and create_refund_request both
 * admitted managers, so a manager passed every authorisation check and still could
 * not reach the page. Founder ruling: any organiser can refund.
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

  // Every read here decides a caller's notFound(), so none may fold a failure
  // into null: readOrThrow retries a blink and throws a real fault
  // (src/lib/supabase/read-or-throw.ts).
  const event = await readOrThrow('organiser event', () =>
    supabase
      .from('events')
      .select('id, title, slug, start_date, end_date, timezone, organisation_id')
      .eq('id', eventId)
      .maybeSingle(),
  )
  if (!event) return null

  /*
   * ACCESS GATE. This was `.eq('owner_id', user.id)`, owner-only, while
   * resolveRefundScope and create_refund_request both admit owner, admin and
   * manager. A manager could therefore pass every authorisation check the refund
   * path performs and still never reach the control, because this gate returned
   * null and the page called notFound(). Founder ruling 2026-08-19: any organiser
   * can refund. One shared definition now answers the question, and a test pins it
   * to resolveRefundScope's role list so the two cannot diverge again.
   */
  const access = await resolveEventAccess(eventId)
  if (!access.allowed) return null

  const org = await readOrThrow('organiser event organisation', () =>
    createAdminClient().from('organisations').select('id, name').eq('id', access.organisationId).maybeSingle(),
  )
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
  created_at: string | null
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
 *
 * ---------------------------------------------------------------------------
 * THIS IS THE DATA-OWNERSHIP PROMISE, SO IT RETURNS EVERY ATTENDEE OR IT THROWS.
 *
 * The platform's pitch to an organiser is that they own every attendee
 * relationship and nothing is withheld from them. This function is that promise
 * in code: it backs the attendee screen, the CSV and XLSX exports an organiser
 * loads into their own mailing list, and the PDF door list somebody stands at a
 * door holding.
 *
 * It used to read `tickets` with no bound at all, and Supabase stops a response
 * at 1,000 rows without saying so: HTTP 200, `error` null, a full-looking array
 * (https://supabase.com/docs/reference/javascript/select, fetched 2026-09-19).
 * Sell 1,150 tickets and the organiser's own export of their own audience was
 * 1,000 rows long, with 150 people missing and no mark anywhere to say which or
 * how many. On the door, the missing 150 are the people who bought LAST,
 * because the read was oldest-first: the late buyers are turned away from an
 * event they hold a valid ticket to.
 *
 * THE CONSENT READ WAS THE SAME SHAPE AND IT MATTERS IN ITS OWN RIGHT.
 * `organiser_marketing_consents` holds one row per attendee per organiser
 * (`unique (organisation_id, email)`), so a truncated read DROPS people, and a
 * dropped person reads as not consented (`isEmailConsented` defaults to false).
 * An organiser past a thousand consents was shown their own lawfully consented
 * audience as smaller than it is, which is the exact thing the wedge promises
 * never to do, and they would have trusted it, because a consent column is
 * precisely the column nobody second-guesses.
 *
 * AND BOTH DISCARDED `error`. A failed read rendered `?? []`, so a database
 * outage produced an empty door list and an export of nobody, presented as the
 * complete and correct answer.
 */
export async function fetchEventAttendees(eventId: string): Promise<AttendeeRow[]> {
  const admin = createAdminClient()

  /*
   * PAGED ON THE PRIMARY KEY, SORTED FOR READING AFTERWARDS. A ranged read must
   * page on a UNIQUE column or the windows are undefined and a row can arrive
   * in two of them; `created_at` is not unique on `tickets`. The reading order
   * this screen has always had is restored by `byTicketReadingOrder` below.
   */
  const rows = (await readEveryRow<RawTicket>('the event attendee list', (from, to) =>
    admin
      .from('tickets')
      .select(
        'created_at, ticket_code, holder_name, holder_email, status, first_scanned_at, ticket_tier:ticket_tiers(name), order:orders(order_number, created_at)'
      )
      .eq('event_id', eventId)
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: RawTicket[] | null; error: { message: string } | null }>,
  )).sort(byTicketReadingOrder)

  // Marketing-consent lookup for this event's organiser (Spam Act). The export
  // must show who may lawfully be emailed; a withdrawn consent reads as not
  // consented. Resolve the event's organisation, then its consent rows.
  //
  // readOrThrow, not a discarded error: if THIS read fails, every attendee
  // silently reads as not consented and the organiser is told they may lawfully
  // email nobody. A wrong consent answer is worse than no page.
  const eventRow = await readOrThrow('the attendee list event organisation', () =>
    admin.from('events').select('organisation_id').eq('id', eventId).maybeSingle(),
  )
  const consentIndex = new Map<string, { consented: boolean; unsubscribeToken: string }>()
  if (eventRow?.organisation_id) {
    const consentRows = await readEveryRow<ConsentRow>('the organiser marketing consents', (from, to) =>
      admin
        .from('organiser_marketing_consents')
        .select('email, status, unsubscribe_token')
        .eq('organisation_id', eventRow.organisation_id)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: ConsentRow[] | null; error: { message: string } | null }>,
    )
    const built = buildConsentIndex(consentRows)
    for (const [k, v] of built) consentIndex.set(k, v)
  }
  const baseUrl = getSiteUrl().replace(/\/$/, '')

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

  /*
   * PAGED, AND THE TRUNCATION HERE POINTED AT THE MONEY. This read was
   * `created_at` DESCENDING with no bound, so the 1,000-row ceiling kept the
   * NEWEST thousand orders and dropped the oldest. An organiser exporting the
   * financial history of an event that sold more than that got a report missing
   * its earliest sales, with every fee and revenue column totalling short, and
   * nothing on the file to say it was partial. It is now paged on the primary
   * key and put back into newest-first for reading.
   */
  const orders = (await readEveryRow<RawOrder>('the event orders report', (from, to) =>
    admin
      .from('orders')
      .select(
        'order_number, created_at, status, currency, subtotal_cents, discount_cents, platform_fee_cents, processing_fee_cents, total_cents, user_id, guest_name, guest_email, order_items(item_type, quantity)'
      )
      .eq('event_id', eventId)
      .order('id', { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: RawOrder[] | null; error: { message: string } | null }>,
  )).sort(byOrderReadingOrder)

  /*
   * Resolve buyer identity for orders placed by a signed-in user.
   *
   * CHUNKED, BECAUSE AN `in` LIST IS BOUNDED BY BYTES. Supabase bounds the URL
   * and the headers together at 16 KB and names lengthy `in` clauses as the
   * usual cause, so a few hundred uuids is the break; and a single `.in()` of
   * more than a thousand ids would also have been capped by the row ceiling, so
   * the buyers past it resolved to no profile at all and their name and email
   * fell through to the guest columns, which are null for a signed-in buyer.
   * The report would have carried blank buyer identities for real named people.
   */
  const userIds = [...new Set(orders.map(o => o.user_id).filter((id): id is string => !!id))]
  const profiles = new Map<string, { full_name: string | null; email: string }>()
  for (const chunk of chunkInFilterValues(userIds)) {
    const profileRows = await readEveryRow<{ id: string; full_name: string | null; email: string }>(
      'the orders report buyer profiles',
      (from, to) =>
        admin
          .from('profiles')
          .select('id, full_name, email')
          .in('id', chunk)
          .order('id', { ascending: true })
          .range(from, to),
    )
    for (const p of profileRows) {
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
