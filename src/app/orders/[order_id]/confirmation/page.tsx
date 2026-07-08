import { notFound } from 'next/navigation'
import Link from 'next/link'
import QRCode from 'qrcode'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'
import { formatSeatLabel } from '@/lib/seating/format'
import { ConfirmationActions } from '@/components/orders/confirmation-actions'
import { EventShareBar } from '@/components/features/events/event-share-bar'
import { encodeRefCode } from '@/lib/growth/referrals'
import type { Order, OrderItem } from '@/types/database'

export const runtime = 'nodejs'

type Props = {
  params: Promise<{ order_id: string }>
  searchParams: Promise<{ payment_intent?: string; redirect_status?: string }>
}

type FullOrder = Order & { order_items: OrderItem[] }

// Statuses that still admit entry and therefore carry a scannable QR. Mirrors
// QR_STATUSES in the confirmation email (src/app/api/webhooks/stripe/route.ts)
// so the page and the email agree on what counts as an issued ticket.
const QR_STATUSES = new Set(['valid', 'scanned'])

type IssuedTicket = {
  ticket_code: string
  secret: string
  status: string
  holder_name: string | null
  holder_email: string | null
  order_item: { item_name: string } | null
  /** Reserved seating: the ticket's seat, joined via tickets.seat_id. */
  seat: {
    row_label: string
    seat_number: string
    section: { name: string } | null
  } | null
}

function formatCents(cents: number, currency: string) {
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
}

export default async function OrderConfirmationPage({ params, searchParams }: Props) {
  const { order_id } = await params
  const { redirect_status } = await searchParams

  const supabase = await createClient()
  // Admin client - order may belong to a guest (user_id null) or a different user (organiser view),
  // so session-based RLS would block the SELECT. Authorization is by order_id/order_number (unguessable).
  const adminClient = createAdminClient()

  // Fetch order - can be by UUID or by order_number (EL-XXXXXXXX)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order_id)

  const query = adminClient
    .from('orders')
    .select('*, order_items(*)')

  const { data: order } = isUUID
    ? await query.eq('id', order_id).single()
    : await query.eq('order_number', order_id).single()

  if (!order) notFound()

  const fullOrder = order as FullOrder

  // If Stripe just redirected back with succeeded status, the webhook may still be processing
  // Show confirmation page anyway - the webhook will confirm the order
  const isConfirmed = fullOrder.status === 'confirmed' || redirect_status === 'succeeded'

  const { data: event } = await adminClient
    .from('events')
    .select('title, start_date, end_date, timezone, venue_name, venue_city, venue_country, slug')
    .eq('id', fullOrder.event_id)
    .single()

  if (!event) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const isGuest = !user

  // Determine smart logo link: organisers go to their dashboard, everyone else browses events
  let logoHref = '/events'
  if (user) {
    const { data: org } = await adminClient
      .from('organisations')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle()
    if (org) logoHref = '/dashboard/events'
  }

  const eventDate = new Date(event.start_date).toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: event.timezone,
    timeZoneName: 'short',
  })

  const location = [event.venue_name, event.venue_city, event.venue_country].filter(Boolean).join(', ')

  const ticketItems = fullOrder.order_items.filter(i => i.item_type === 'ticket')
  const addonItems = fullOrder.order_items.filter(i => i.item_type === 'addon')

  // Group tickets by tier name
  const tierGroups = new Map<string, number>()
  for (const item of ticketItems) {
    tierGroups.set(item.item_name, (tierGroups.get(item.item_name) ?? 0) + item.quantity)
  }

  // Issued tickets: surface them inline with their QR and a View ticket link,
  // exactly like the confirmation email. Only valid/scanned tickets carry a
  // QR; the generic "being prepared" message is shown only when no tickets
  // have been generated yet (a genuine pending state while the webhook runs).
  const { data: ticketRows } = await adminClient
    .from('tickets')
    .select('ticket_code, secret, status, holder_name, holder_email, order_item:order_items(item_name), seat:seats(row_label, seat_number, section:seat_map_sections(name))')
    .eq('order_id', fullOrder.id)
    .order('created_at', { ascending: true })

  const allTickets = (ticketRows ?? []) as unknown as IssuedTicket[]
  const siteUrl = getSiteUrl()
  const issuedTickets = await Promise.all(
    allTickets
      .filter(t => QR_STATUSES.has(t.status))
      .map(async t => {
        const href = `/t/${encodeURIComponent(t.ticket_code)}?k=${encodeURIComponent(t.secret)}`
        const qrSvg = await QRCode.toString(`${siteUrl}${href}`, {
          type: 'svg',
          margin: 2,
          errorCorrectionLevel: 'M',
        })
        return {
          ticket_code: t.ticket_code,
          href,
          qrSvg,
          itemName: t.order_item?.item_name || 'Admission',
          holder: t.holder_name ?? t.holder_email ?? 'Ticket holder',
          seatLabel: t.seat
            ? formatSeatLabel({
                sectionName: t.seat.section?.name ?? null,
                rowLabel: t.seat.row_label,
                seatNumber: t.seat.seat_number,
              })
            : null,
        }
      })
  )

  return (
    <div className="min-h-screen bg-canvas">
      <nav className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <Link href={logoHref} className="text-xl font-bold text-ink-900">EVENTLINQS</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-ink-900">
            {isConfirmed ? "You're in" : 'Order received'}
          </h1>
          <p className="mt-1 text-ink-600">Order <span className="font-mono font-semibold text-ink-900">{fullOrder.order_number}</span></p>
        </div>

        {/* Event details */}
        <div className="rounded-xl border border-ink-200 bg-white p-6 mb-4">
          <h2 className="text-lg font-semibold text-ink-900 mb-3">{event.title}</h2>

          <div className="space-y-2 text-sm text-ink-600">
            <div className="flex items-start gap-2">
              <svg className="h-4 w-4 mt-0.5 shrink-0 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{eventDate}</span>
            </div>
            {location && (
              <div className="flex items-start gap-2">
                <svg className="h-4 w-4 mt-0.5 shrink-0 text-ink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{location}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tickets */}
        <div className="rounded-xl border border-ink-200 bg-white p-6 mb-4">
          <h3 className="text-base font-semibold text-ink-900 mb-3">Tickets Purchased</h3>
          <div className="space-y-2">
            {Array.from(tierGroups).map(([name, qty]) => (
              <div key={name} className="flex justify-between text-sm">
                <span className="text-ink-600">{name}</span>
                <span className="text-ink-400">×{qty}</span>
              </div>
            ))}
            {addonItems.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-ink-400">{item.item_name} (add-on)</span>
                <span className="text-ink-400">×{item.quantity}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-ink-100 flex justify-between">
            <span className="text-sm font-semibold text-ink-900">Total paid</span>
            <span className="text-sm font-bold text-ink-900">{formatCents(fullOrder.total_cents, fullOrder.currency)}</span>
          </div>
        </div>

        {/* Issued tickets: inline QR + View ticket link, matching the email */}
        {issuedTickets.length > 0 ? (
          <section className="rounded-xl border border-ink-200 bg-white p-6 mb-6">
            <h3 className="text-base font-semibold text-ink-900 mb-4">
              Your {issuedTickets.length === 1 ? 'ticket' : 'tickets'}
            </h3>
            <div className="space-y-6">
              {issuedTickets.map(t => (
                <div key={t.ticket_code} className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm">
                  <div
                    className="flex items-center justify-center rounded-lg bg-white p-4 [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-[220px]"
                    // Server-generated SVG QR (no raw img, satisfies the media rules).
                    dangerouslySetInnerHTML={{ __html: t.qrSvg }}
                  />
                  <dl className="mt-4 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-600">Ticket type</dt>
                      <dd className="font-medium text-ink-900">{t.itemName}</dd>
                    </div>
                    {t.seatLabel && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-ink-600">Seat</dt>
                        <dd className="font-semibold text-ink-900">{t.seatLabel}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-600">Ticket code</dt>
                      <dd className="font-mono font-semibold text-ink-900">{t.ticket_code}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-600">Holder</dt>
                      <dd className="font-medium text-ink-900">{t.holder}</dd>
                    </div>
                  </dl>
                  <Link
                    href={t.href}
                    className="mt-4 flex min-h-[44px] items-center justify-center rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
                  >
                    View ticket
                  </Link>
                  <p className="mt-2 text-center text-xs text-ink-600">
                    Show this QR at entry. One QR admits one person.
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : allTickets.length === 0 ? (
          // Genuine pending state: order received but tickets not generated yet
          // (the webhook is still processing). Once issued they render above and
          // are emailed to the buyer.
          <div className="rounded-xl border border-gold-100 bg-gold-100 p-4 mb-6 text-sm text-gold-600">
            <p className="font-medium">Your tickets are being prepared</p>
            <p className="mt-1 text-gold-500">Your digital tickets and QR codes will appear here and arrive in your email within a few minutes.</p>
          </div>
        ) : null}

        {/* Share your seat (seated orders): the growth loop no competitor
         *  ties to seating. The buyer's exact seat goes into the invite so
         *  their people can pick the seats next to them; the link is the
         *  attributed share-a-ticket URL. */}
        {issuedTickets.some(t => t.seatLabel) && event.slug && (
          <section className="mb-6 rounded-xl border border-gold-500/30 bg-white p-6">
            <p className="font-display text-[11px] font-semibold uppercase tracking-widest text-gold-700">
              Share your seat
            </p>
            <p className="mt-2 text-sm text-ink-600">
              The seats around you are still open. Tell your people exactly
              where you are sitting and they can pick the seats next to you.
            </p>
            <div className="mt-4">
              <EventShareBar
                eventTitle={event.title}
                eventDate={eventDate}
                eventUrl={`${siteUrl}/events/${event.slug}`}
                messageOverride={`I am in ${issuedTickets.find(t => t.seatLabel)?.seatLabel} for ${event.title}. Pick a seat near me:`}
                variant="light"
              />
            </div>
          </section>
        )}

        {/* Actions */}
        <ConfirmationActions
          eventTitle={event.title}
          startDate={event.start_date}
          endDate={event.end_date}
          location={location}
          orderNumber={fullOrder.order_number}
          eventSlug={event.slug}
          refCode={user ? encodeRefCode(user.id) ?? undefined : undefined}
        />

        {/* Invite-an-organiser conversion (the acquisition loop). The moment a
         *  buyer has momentum is the moment to surface that they can run their
         *  own events. The link is attributed (via=organiser-invite) so we can
         *  measure how many organisers this hook converts. */}
        <div className="rounded-xl border border-gold-100 bg-gold-100/60 p-5 text-center mb-6">
          <p className="text-sm font-semibold text-ink-900">Run your own events on EventLinqs</p>
          <p className="mt-1 text-xs text-ink-600">
            It is free to start. List your event, reach your community, and keep every attendee relationship.
          </p>
          <Link
            href="/organisers?via=organiser-invite"
            className="mt-3 inline-block rounded-lg bg-gold-400 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500"
          >
            Become an organiser
          </Link>
        </div>

        {/* Guest CTA */}
        {isGuest && (
          <div className="rounded-xl border border-ink-200 bg-white p-5 text-center mb-6">
            <p className="text-sm font-semibold text-ink-900">Create an account to manage your tickets</p>
            <p className="mt-1 text-xs text-ink-400">Access order history, digital tickets, and more</p>
            <Link
              href="/signup"
              className="mt-3 inline-block rounded-lg bg-ink-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-800"
            >
              Create Account
            </Link>
          </div>
        )}

        <div className="text-center">
          <Link href="/events" className="text-sm font-medium text-gold-800 underline hover:text-gold-700">
            Browse more events
          </Link>
        </div>
      </div>
    </div>
  )
}
