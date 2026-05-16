import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl } from '@/lib/site-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your ticket | EventLinqs',
  robots: { index: false, follow: false },
}

type Props = {
  params: Promise<{ code: string }>
  searchParams: Promise<{ k?: string }>
}

interface BearerTicket {
  ticket_code: string
  secret: string
  status: string
  holder_name: string | null
  holder_email: string
  // V1 is general-admission. seat_id exists on the row but seat display
  // is deferred to the locked seated-events design slice (not rendered
  // here) so this page does not differ between GA and seated yet.
  event: {
    title: string
    start_date: string
    venue_name: string | null
    venue_city: string | null
  } | null
  order_item: { item_name: string } | null
}

function formatAuDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  valid:       { label: 'Valid',       tone: 'bg-success/15 text-success' },
  scanned:     { label: 'Checked in',  tone: 'bg-ink-200 text-ink-700' },
  refunded:    { label: 'Refunded',    tone: 'bg-error/15 text-error' },
  void:        { label: 'Void',        tone: 'bg-error/15 text-error' },
  transferred: { label: 'Transferred', tone: 'bg-ink-200 text-ink-700' },
}

export default async function TicketBearerPage({ params, searchParams }: Props) {
  const { code } = await params
  const { k: secret } = await searchParams
  if (!code || !secret) notFound()

  // Bearer auth: the (code, secret) pair is the ticket (paper-ticket
  // model). Service-role read so a guest with the email link, who has
  // no session, can still show it at the gate. RLS still protects the
  // table from session-scoped reads of other people's tickets.
  const admin = createAdminClient()
  const { data } = await admin
    .from('tickets')
    .select(
      'ticket_code, secret, status, holder_name, holder_email, event:events(title, start_date, venue_name, venue_city), order_item:order_items(item_name)',
    )
    .eq('ticket_code', code)
    .maybeSingle()

  const ticket = data as unknown as BearerTicket | null
  if (!ticket || ticket.secret !== secret) notFound()

  const qrSvg = await QRCode.toString(
    `${getSiteUrl()}/t/${encodeURIComponent(code)}?k=${encodeURIComponent(secret)}`,
    { type: 'svg', margin: 2, errorCorrectionLevel: 'M' },
  )

  const status = STATUS_COPY[ticket.status] ?? STATUS_COPY.valid
  const ev = ticket.event

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-canvas px-4 py-8">
      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-accent-strong)]">
          EventLinqs ticket
        </p>
        <h1 className="mt-2 font-display text-2xl font-extrabold leading-tight text-ink-900">
          {ev?.title ?? 'Your event'}
        </h1>
        {ev?.start_date && (
          <p className="mt-1 text-sm text-ink-700">{formatAuDateTime(ev.start_date)}</p>
        )}
        {(ev?.venue_name || ev?.venue_city) && (
          <p className="text-sm text-ink-600">
            {[ev?.venue_name, ev?.venue_city].filter(Boolean).join(', ')}
          </p>
        )}

        <div
          className="mt-6 flex items-center justify-center rounded-xl bg-white p-4 [&>svg]:h-auto [&>svg]:w-full [&>svg]:max-w-[280px]"
          // Our own server-generated SVG QR (no third-party HTML, no raw
          // <img> so the media/ESLint rules are satisfied).
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />

        <p className="mt-4 text-center text-sm text-ink-700">
          Show this QR code at entry. Have your screen brightness up.
        </p>

        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Ticket type</dt>
            <dd className="font-medium text-ink-900">{ticket.order_item?.item_name ?? 'Admission'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Ticket code</dt>
            <dd className="font-mono font-semibold text-ink-900">{ticket.ticket_code}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-500">Holder</dt>
            <dd className="font-medium text-ink-900">
              {ticket.holder_name ?? ticket.holder_email}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-ink-500">Status</dt>
            <dd>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}>
                {status.label}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      <p className="text-center text-xs text-ink-500">
        Lost this link? Sign in to EventLinqs and open My tickets, or reply to your
        confirmation email and we will resend it.
      </p>
    </main>
  )
}
