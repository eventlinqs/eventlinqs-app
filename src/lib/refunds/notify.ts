import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'

/**
 * REFUND CORRESPONDENCE.
 *
 * TWO RULES, both taken from what actually goes wrong rather than from taste.
 *
 * 1. THE ORGANISER GETS AN EMAIL AND A DASHBOARD ITEM, NOT ONE OR THE OTHER.
 *    The dashboard item is the refund_requests row itself, so it exists the
 *    moment the request is created and cannot be lost by a mail failure. The
 *    email is the nudge. Eventbrite does both and gives the organiser five
 *    business days to respond; an organiser who only had the email would miss
 *    every request that landed in a spam folder, and the attendee would escalate.
 *
 * 2. A DECLINE ALWAYS CARRIES THE ORGANISER'S EXPLANATION. A decline with no
 *    reason is how a chargeback starts, and a chargeback costs the organiser the
 *    money, a fee, and the dispute. `decision_note` is required at the service
 *    layer and is reproduced verbatim here.
 *
 * Mail is BEST EFFORT and every caller treats it that way. A request that has
 * been recorded must never be reported to the buyer as failed because a mail
 * server was slow. Every function here throws on a genuine send failure so the
 * caller can capture it, and the caller does not surface it to the buyer.
 */

interface RequestRow {
  id: string
  order_id: string
  event_id: string
  organisation_id: string
  requester_email: string
  status: string
  buyer_message: string | null
  decision_note: string | null
  decline_reason: string | null
  auto_approved: boolean
}

async function loadRequest(admin: SupabaseClient, requestId: string) {
  const { data: req } = await admin
    .from('refund_requests')
    .select('id, order_id, event_id, organisation_id, requester_email, status, buyer_message, decision_note, decline_reason, auto_approved')
    .eq('id', requestId)
    .maybeSingle()
  if (!req) throw new Error(`refund request ${requestId} not found`)

  const { data: order } = await admin
    .from('orders')
    .select('id, order_number, total_cents, currency')
    .eq('id', (req as RequestRow).order_id)
    .maybeSingle()

  const { data: event } = await admin
    .from('events')
    .select('id, title, start_date, slug')
    .eq('id', (req as RequestRow).event_id)
    .maybeSingle()

  const { data: org } = await admin
    .from('organisations')
    .select('id, name, email, owner_id')
    .eq('id', (req as RequestRow).organisation_id)
    .maybeSingle()

  const { count } = await admin
    .from('refund_request_tickets')
    .select('ticket_id', { count: 'exact', head: true })
    .eq('request_id', requestId)

  return { req: req as RequestRow, order, event, org, ticketCount: count ?? 0 }
}

const money = (cents: number | null | undefined, currency = 'AUD') =>
  `${currency} $${((cents ?? 0) / 100).toFixed(2)}`

/** Plain-text body plus a minimal HTML twin. No images, no tracking. */
function wrap(title: string, lines: string[], cta?: { label: string; url: string }): { html: string; text: string } {
  const text = [title, '', ...lines, ...(cta ? ['', `${cta.label}: ${cta.url}`] : [])].join('\n')
  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0A1628">`,
    `<h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(title)}</h1>`,
    ...lines.map(l => `<p style="font-size:15px;line-height:1.55;margin:0 0 12px">${escapeHtml(l)}</p>`),
    cta ? `<p style="margin:24px 0"><a href="${cta.url}" style="background:#0A1628;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">${escapeHtml(cta.label)}</a></p>` : '',
    `</div>`,
  ].join('')
  return { html, text }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ))
}

/** A buyer has asked. Tell the organiser, and point them at the queue. */
export async function sendRefundRequestedToOrganiser(admin: SupabaseClient, requestId: string): Promise<void> {
  const { req, order, event, org, ticketCount } = await loadRequest(admin, requestId)
  const to = org?.email
  if (!to) {
    // Absent and false are different answers. An organisation with no contact
    // address is a data problem worth surfacing, not a silent no-op.
    throw new Error(`organisation ${req.organisation_id} has no email, so the refund request could not be notified`)
  }

  const url = `${getSiteUrl()}/dashboard/events/${req.event_id}/refunds`
  const lines = [
    `${req.requester_email} has asked for a refund on order ${order?.order_number ?? ''} for ${event?.title ?? 'your event'}.`,
    `${ticketCount} ticket${ticketCount === 1 ? '' : 's'}, ${money(order?.total_cents, order?.currency ?? 'AUD')} order total.`,
    req.buyer_message ? `They said: "${req.buyer_message}"` : 'They did not leave a message.',
    'You can approve or decline it. If you decline, give them a reason: a decline with no explanation is the most common cause of a card chargeback, which costs you the money and a fee on top.',
  ]
  const { html, text } = wrap('A refund has been requested', lines, { label: 'Review the request', url })

  await sendEmail({
    to,
    subject: `Refund requested: ${event?.title ?? 'your event'} (order ${order?.order_number ?? ''})`,
    html,
    text,
  })
}

/** The decision, to the buyer. Sent for approve, decline and auto-approve alike. */
export async function sendRefundDecisionToBuyer(admin: SupabaseClient, requestId: string): Promise<void> {
  const { req, order, event } = await loadRequest(admin, requestId)
  const to = req.requester_email
  if (!to) throw new Error(`refund request ${requestId} has no requester email`)

  const orderUrl = `${getSiteUrl()}/orders/${req.order_id}/confirmation`
  let title: string
  let lines: string[]

  if (req.status === 'approved' || req.status === 'refunded') {
    title = req.auto_approved ? 'Your refund is on its way' : 'Your refund was approved'
    lines = [
      `Your refund for ${event?.title ?? 'the event'} (order ${order?.order_number ?? ''}) has been approved.`,
      'The money goes back to the card you paid with. Most banks show it within 5 to 10 business days.',
      req.auto_approved
        ? 'It was approved automatically under this event refund policy, so nobody had to review it.'
        : 'The organiser approved it.',
      req.decision_note ? `They added: "${req.decision_note}"` : '',
      'Your ticket for this order is no longer valid and will not scan at the door.',
    ].filter(Boolean)
  } else if (req.status === 'declined') {
    title = 'Your refund request was declined'
    lines = [
      `The organiser has declined your refund request for ${event?.title ?? 'the event'} (order ${order?.order_number ?? ''}).`,
      req.decision_note
        ? `Their reason: "${req.decision_note}"`
        : 'They did not give a reason.',
      'Your ticket is still valid, so you can still attend or pass it on.',
      'If you think this is wrong, reply to this email and we will look at it.',
    ]
  } else if (req.status === 'failed') {
    title = 'We could not complete your refund'
    lines = [
      `Something went wrong completing your refund for ${event?.title ?? 'the event'} (order ${order?.order_number ?? ''}).`,
      'You have not been charged anything extra and your ticket has not changed.',
      'The organiser has been notified and we are looking at it. You do not need to do anything.',
    ]
  } else {
    title = 'We have your refund request'
    lines = [
      `We have passed your refund request for ${event?.title ?? 'the event'} (order ${order?.order_number ?? ''}) to the organiser.`,
      'They will respond, and you will get an email either way.',
    ]
  }

  const { html, text } = wrap(title, lines, { label: 'View your order', url: orderUrl })
  await sendEmail({ to, subject: `${title}: ${event?.title ?? 'your order'}`, html, text })
}
