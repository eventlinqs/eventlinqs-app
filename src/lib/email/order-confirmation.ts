import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'
import QRCode from 'qrcode'
import { getSiteUrl } from '@/lib/site-url'
import { formatMoney } from '@/lib/money/format'
import { formatSeatLabel } from '@/lib/seating/format'

// ---------------------------------------------------------------------------
// Order confirmation email (shared by the paid Stripe webhook and the free /
// zero-price checkout path, so both send an identical ticket + receipt email).
//
// The email is the buyer's self-contained ticket and receipt. Per-ticket QR
// codes are CID-attached PNGs (not hot-linked) so the bearer secret is never
// handed to an email-image proxy, the QR renders even when remote images are
// blocked, and a baked white quiet-zone survives client dark-mode inversion.
// Refunded / void / transferred tickets never render a scannable QR.
//
// Moved verbatim out of the Stripe webhook route so the free path can reuse it
// without duplicating the template. The function behaviour is unchanged.
// ---------------------------------------------------------------------------

type EmailTicket = {
  ticket_code: string
  secret: string
  holder_name: string | null
  status: string
  /** Reserved seating: the ticket's seat, joined via tickets.seat_id. */
  seat: {
    row_label: string
    seat_number: string
    section: { name: string } | null
  } | null
}

function seatLine(ticket: EmailTicket): string | null {
  if (!ticket.seat) return null
  return formatSeatLabel({
    sectionName: ticket.seat.section?.name ?? null,
    rowLabel: ticket.seat.row_label,
    seatNumber: ticket.seat.seat_number,
  })
}

type EmailOrder = {
  order_number: string
  total_cents: number
  currency: string
}

type EmailEvent = {
  title: string
  start_date: string
  timezone: string
  venue_name?: string | null
  venue_city?: string | null
  venue_country?: string | null
}

// Statuses that still admit entry and therefore carry a QR.
const QR_STATUSES = new Set(['valid', 'scanned'])

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function qrCid(ticketCode: string): string {
  return `qr-${ticketCode}`
}

function deriveFirstName(name: string | null | undefined): string | null {
  const first = (name ?? '').trim().split(/\s+/)[0]
  return first.length > 0 ? first : null
}

function ticketCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'ticket' : 'tickets'}`
}

function formatEventDateLong(event: EmailEvent): string {
  return new Date(event.start_date).toLocaleString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: event.timezone,
    timeZoneName: 'short',
  })
}

function formatEventDateShort(event: EmailEvent): string {
  return new Date(event.start_date).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: event.timezone,
  })
}

function venueLines(event: EmailEvent): string[] {
  const lines: string[] = []
  if (event.venue_name) lines.push(event.venue_name)
  const locality = [event.venue_city, event.venue_country].filter(Boolean).join(', ')
  if (locality) lines.push(locality)
  return lines
}

// Plain-language sentence for a ticket that no longer admits entry. Returns
// null for statuses that still carry a QR.
function invalidTicketSentence(status: string): string | null {
  if (status === 'refunded') return 'This ticket was refunded and is no longer valid.'
  if (status === 'void') return 'This ticket was cancelled and is no longer valid.'
  if (status === 'transferred') return 'This ticket was transferred and is no longer valid.'
  if (QR_STATUSES.has(status)) return null
  return 'This ticket is no longer valid.'
}

export async function sendConfirmationEmail(
  db: ReturnType<typeof createAdminClient>,
  order_id: string,
  receipt_url: string | null
) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  const { data: order } = await db
    .from('orders')
    .select('*')
    .eq('id', order_id)
    .single()

  if (!order) return

  const { data: event } = await db
    .from('events')
    .select('title, start_date, end_date, timezone, venue_name, venue_city, venue_country')
    .eq('id', order.event_id)
    .single()

  if (!event) return

  let buyerEmail: string | null = order.guest_email ?? null
  let buyerName: string | null = order.guest_name ?? null
  if (order.user_id) {
    const { data: profile } = await db
      .from('profiles')
      .select('email, full_name')
      .eq('id', order.user_id)
      .single()
    buyerEmail = buyerEmail ?? profile?.email ?? null
    buyerName = buyerName ?? profile?.full_name ?? null
  }

  if (!buyerEmail) return

  const { data: ticketRows } = await db
    .from('tickets')
    .select('ticket_code, secret, holder_name, status, seat:seats(row_label, seat_number, section:seat_map_sections(name))')
    .eq('order_id', order_id)
    .order('created_at', { ascending: true })

  // PostgREST returns the many-to-one seat embed as an object at runtime;
  // the generated types fall back to an array shape, hence the unknown hop.
  const tickets = (ticketRows ?? []) as unknown as EmailTicket[]

  // Generate one CID-attached QR PNG per ticket that still admits entry. The
  // PNG is built in-process (no HTTP self-fetch) and references the bearer URL,
  // identical to GET /api/tickets/[code]/qr.
  const attachments: { filename: string; content: Buffer; contentId: string }[] = []
  for (const ticket of tickets) {
    if (!QR_STATUSES.has(ticket.status)) continue
    const payload = `${getSiteUrl()}/t/${encodeURIComponent(ticket.ticket_code)}?k=${encodeURIComponent(ticket.secret)}`
    const png = await QRCode.toBuffer(payload, {
      type: 'png',
      width: 512,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
    attachments.push({
      filename: `${ticket.ticket_code}.png`,
      content: png,
      contentId: qrCid(ticket.ticket_code),
    })
  }

  const firstName = deriveFirstName(buyerName)
  const resend = new Resend(resendKey)

  try {
    await resend.emails.send({
      from: 'EventLinqs <noreply@eventlinqs.com>',
      to: buyerEmail,
      replyTo: 'hello@eventlinqs.com',
      subject: `Your tickets for ${event.title}`,
      html: buildConfirmationEmailHtml(order, event, tickets, receipt_url, firstName),
      text: buildConfirmationEmailText(order, event, tickets, receipt_url, firstName),
      attachments: attachments.length > 0 ? attachments : undefined,
    })
  } catch (err) {
    console.error('Failed to send confirmation email:', err)
  }
}

function buildConfirmationEmailHtml(
  order: EmailOrder,
  event: EmailEvent,
  tickets: EmailTicket[],
  receipt_url: string | null,
  firstName: string | null
): string {
  const siteUrl = getSiteUrl()
  const total = formatMoney(order.total_cents, order.currency)
  const eventDateLong = formatEventDateLong(event)
  const eventDateShort = formatEventDateShort(event)
  const countLabel = ticketCountLabel(tickets.length)

  const title = escapeHtml(event.title)
  const greeting = firstName
    ? `You are going to ${title}, ${escapeHtml(firstName)}.`
    : `You are going to ${title}.`

  const preheader = escapeHtml(
    `Order ${order.order_number}, ${countLabel} for ${eventDateShort}`
  )

  const venueHtml = venueLines(event)
    .map(line => `<p style="margin:0;color:#6B7280;font-size:15px;">${escapeHtml(line)}</p>`)
    .join('')

  const hr =
    '<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;" />'

  const ticketBlocks = tickets
    .map(ticket => {
      const holder = escapeHtml(ticket.holder_name ?? 'Ticket holder')
      const code = escapeHtml(ticket.ticket_code)
      const invalid = invalidTicketSentence(ticket.status)

      if (invalid) {
        return `
      <div style="background:#FAFAFA;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:16px 0;">
        <p style="margin:0 0 6px;color:#0A1628;font-size:16px;font-weight:600;">${holder}</p>
        <p style="margin:0;color:#6B7280;font-size:14px;">${escapeHtml(invalid)}</p>
      </div>`
      }

      const bearerUrl = `${siteUrl}/t/${encodeURIComponent(ticket.ticket_code)}?k=${encodeURIComponent(ticket.secret)}`
      const note =
        ticket.status === 'scanned'
          ? 'This ticket has already been scanned.'
          : 'Show this QR at entry. One QR admits one person.'
      const alt = escapeHtml(
        `QR code for ${event.title} ticket ${ticket.ticket_code}, holder ${ticket.holder_name ?? 'ticket holder'}`
      )

      const seat = seatLine(ticket)
      const seatHtml = seat
        ? `<p style="margin:0 0 12px;color:#0A1628;font-size:15px;font-weight:700;">${escapeHtml(seat)}</p>`
        : ''

      return `
      <div style="background:#FFFFFF;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin:16px 0;text-align:center;">
        <p style="margin:0 0 ${seat ? '4px' : '12px'};color:#0A1628;font-size:16px;font-weight:600;">${holder}</p>
        ${seatHtml}
        <div style="display:inline-block;background:#FFFFFF;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
          <img src="cid:${qrCid(ticket.ticket_code)}" width="220" height="220" alt="${alt}" style="display:block;width:220px;height:220px;border:0;background:#FFFFFF;" />
        </div>
        <p style="margin:14px 0 4px;color:#0A1628;font-size:15px;font-family:monospace;letter-spacing:1px;">${code}</p>
        <p style="margin:0 0 16px;">
          <a href="${bearerUrl}" style="display:inline-block;background:#0A1628;color:#FFFFFF;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Open ticket</a>
        </p>
        <p style="margin:0;color:#6B7280;font-size:13px;">${note}</p>
      </div>`
    })
    .join('')

  const receiptHtml = receipt_url
    ? `<p style="margin:8px 0 0;"><a href="${escapeHtml(receipt_url)}" style="color:#0A1628;font-size:14px;">View your Stripe receipt</a></p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<style>:root { color-scheme: light; supported-color-schemes: light; }</style>
</head>
<body style="margin:0;padding:0;background-color:#FAFAFA;color:#0A1628;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;color:#0A1628;font-family:Helvetica,Arial,sans-serif;">

  <p style="margin:0 0 20px;font-size:18px;font-weight:800;letter-spacing:2px;color:#0A1628;">EVENTLINQS</p>

  <h1 style="margin:0 0 8px;color:#0A1628;font-size:22px;">${greeting}</h1>
  <p style="margin:0;color:#374151;font-size:15px;">Your order is confirmed and your ticket is ready below. No app needed.</p>

  ${hr}

  <h2 style="margin:0 0 8px;color:#0A1628;font-size:18px;">${title}</h2>
  <p style="margin:0 0 4px;color:#374151;font-size:15px;">${escapeHtml(eventDateLong)}</p>
  ${venueHtml}
  <p style="margin:12px 0 0;color:#6B7280;font-size:14px;">Order ${escapeHtml(order.order_number)}</p>
  <p style="margin:2px 0 0;color:#6B7280;font-size:14px;">${escapeHtml(countLabel)}</p>

  ${hr}

  <p style="margin:0 0 4px;color:#0A1628;font-size:13px;font-weight:700;letter-spacing:1px;">YOUR TICKETS</p>
  ${ticketBlocks}

  ${hr}

  <p style="margin:0;color:#0A1628;font-size:17px;font-weight:700;">Total paid: ${escapeHtml(total)}</p>
  ${receiptHtml}

  ${hr}

  <p style="margin:0 0 10px;color:#374151;font-size:14px;">Any questions, just reply to this email and a real person will help you.</p>
  <p style="margin:0;color:#6B7280;font-size:13px;">Lost this email? Your tickets are always at <a href="${siteUrl}/tickets" style="color:#0A1628;">eventlinqs.com/tickets</a> when you are signed in, or use a ticket link above.</p>

  ${hr}

  <p style="margin:0 0 12px;color:#6B7280;font-size:13px;">This email is your receipt.</p>

  <p style="margin:0 0 4px;color:#9CA3AF;font-size:12px;">The EventLinqs team. The ticketing platform built for every community.</p>
  <p style="margin:0 0 4px;color:#9CA3AF;font-size:12px;">Refunds are handled under our refund policy: <a href="${siteUrl}/legal/refunds" style="color:#9CA3AF;">eventlinqs.com/legal/refunds</a></p>
  <p style="margin:0 0 4px;color:#9CA3AF;font-size:12px;">EventLinqs (Lawal Adams), ABN 30 837 447 587, Geelong VIC, Australia.</p>
  <p style="margin:0;color:#9CA3AF;font-size:12px;">You received this because you bought tickets on EventLinqs.</p>

</div>
</body>
</html>`
}

function buildConfirmationEmailText(
  order: EmailOrder,
  event: EmailEvent,
  tickets: EmailTicket[],
  receipt_url: string | null,
  firstName: string | null
): string {
  const siteUrl = getSiteUrl()
  const rule = '='.repeat(60)
  const greeting = firstName
    ? `You are going to ${event.title}, ${firstName}.`
    : `You are going to ${event.title}.`

  const lines: string[] = []
  lines.push('EVENTLINQS')
  lines.push('')
  lines.push(greeting)
  lines.push('Your order is confirmed and your ticket is ready below. No app needed.')
  lines.push('')
  lines.push(rule)
  lines.push('')
  lines.push(event.title)
  lines.push(formatEventDateLong(event))
  for (const line of venueLines(event)) lines.push(line)
  lines.push(`Order ${order.order_number}`)
  lines.push(ticketCountLabel(tickets.length))
  lines.push('')
  lines.push(rule)
  lines.push('')
  lines.push('YOUR TICKETS')
  for (const ticket of tickets) {
    lines.push('')
    lines.push(ticket.holder_name ?? 'Ticket holder')
    const invalid = invalidTicketSentence(ticket.status)
    if (invalid) {
      lines.push(invalid)
      continue
    }
    const bearerUrl = `${siteUrl}/t/${encodeURIComponent(ticket.ticket_code)}?k=${encodeURIComponent(ticket.secret)}`
    const seat = seatLine(ticket)
    if (seat) lines.push(seat)
    lines.push(`Ticket code: ${ticket.ticket_code}`)
    lines.push(`Open your ticket: ${bearerUrl}`)
    lines.push(
      ticket.status === 'scanned'
        ? 'This ticket has already been scanned.'
        : 'Show the QR on that page at entry. One QR admits one person.'
    )
  }
  lines.push('')
  lines.push(rule)
  lines.push('')
  lines.push(`Total paid: ${formatMoney(order.total_cents, order.currency)}`)
  if (receipt_url) lines.push(`Stripe receipt: ${receipt_url}`)
  lines.push('')
  lines.push(rule)
  lines.push('')
  lines.push('Any questions, just reply to this email and a real person will help you.')
  lines.push(
    `Lost this email? Your tickets are always at ${siteUrl}/tickets when you are signed in, or use a ticket link above.`
  )
  lines.push('')
  lines.push(rule)
  lines.push('')
  lines.push('This email is your receipt.')
  lines.push('')
  lines.push('The EventLinqs team. The ticketing platform built for every community.')
  lines.push(`Refund policy: ${siteUrl}/legal/refunds`)
  lines.push('EventLinqs (Lawal Adams), ABN 30 837 447 587, Geelong VIC, Australia.')
  lines.push('You received this because you bought tickets on EventLinqs.')

  return lines.join('\n')
}
