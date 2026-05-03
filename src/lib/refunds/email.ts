import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * M6 Phase 5 - Refund email notifications.
 *
 * Five canonical kinds:
 *   - refund_requested   -> organiser owner (action needed)
 *   - refund_approved    -> buyer (transitional, after organiser approves but before Stripe finalises)
 *   - refund_processed   -> buyer (Stripe completed)
 *   - refund_denied      -> buyer (organiser cancelled the request, with reason)
 *   - refund_failed      -> organiser owner (Stripe call failed)
 *
 * Sender matches existing buyer confirmation / payouts senders. No-ops when
 * RESEND_API_KEY is unset so local dev and CI never block on email delivery.
 */

const SENDER = 'EventLinqs <noreply@eventlinqs.com>'

export type RefundEmailKind =
  | 'refund_requested'
  | 'refund_approved'
  | 'refund_processed'
  | 'refund_denied'
  | 'refund_failed'

export interface RefundEmailPayload {
  refundId: string
  orderId: string
  amountCents: number
  currency: string
  reason?: string | null
  buyerMessage?: string | null
  denialReason?: string | null
  failureReason?: string | null
  eventTitle?: string | null
}

interface OrgRow {
  id: string
  name: string
  owner_id: string
}

interface ProfileRow {
  email: string | null
  full_name: string | null
}

interface OrderRow {
  user_id: string | null
  guest_email: string | null
  guest_name: string | null
}

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'https://eventlinqs.com'
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatAmount(amountCents: number, currency: string): string {
  const code = (currency ?? 'aud').toUpperCase()
  const value = (amountCents / 100).toFixed(2)
  return `${code} ${value}`
}

async function loadOwnerEmail(
  adminClient: SupabaseClient,
  organisationId: string
): Promise<{ email: string; name: string | null; orgName: string } | null> {
  const { data: orgData } = await adminClient
    .from('organisations')
    .select('id, name, owner_id')
    .eq('id', organisationId)
    .maybeSingle()
  const org = orgData as OrgRow | null
  if (!org?.owner_id) return null
  const { data: profileData } = await adminClient
    .from('profiles')
    .select('email, full_name')
    .eq('id', org.owner_id)
    .maybeSingle()
  const profile = profileData as ProfileRow | null
  if (!profile?.email) return null
  return { email: profile.email, name: profile.full_name, orgName: org.name }
}

async function loadBuyerContact(
  adminClient: SupabaseClient,
  orderId: string
): Promise<{ email: string; name: string | null } | null> {
  const { data: orderData } = await adminClient
    .from('orders')
    .select('user_id, guest_email, guest_name')
    .eq('id', orderId)
    .maybeSingle()
  const order = orderData as OrderRow | null
  if (!order) return null
  if (order.user_id) {
    const { data: profileData } = await adminClient
      .from('profiles')
      .select('email, full_name')
      .eq('id', order.user_id)
      .maybeSingle()
    const profile = profileData as ProfileRow | null
    if (profile?.email) return { email: profile.email, name: profile.full_name }
  }
  if (order.guest_email) {
    return { email: order.guest_email, name: order.guest_name }
  }
  return null
}

interface BuiltEmail {
  to: string
  subject: string
  html: string
}

function buildEmail(
  kind: RefundEmailKind,
  recipient: { email: string; name: string | null },
  orgName: string,
  payload: RefundEmailPayload
): BuiltEmail {
  const baseUrl = getBaseUrl()
  const amount = formatAmount(payload.amountCents, payload.currency)
  const safeOrg = escapeHtml(orgName)
  const safeName = recipient.name ? escapeHtml(recipient.name) : 'there'
  const safeMessage = payload.buyerMessage ? escapeHtml(payload.buyerMessage) : null
  const safeDenial = payload.denialReason ? escapeHtml(payload.denialReason) : null
  const safeFailure = payload.failureReason ? escapeHtml(payload.failureReason) : null
  const orderShort = payload.orderId.slice(0, 8)

  switch (kind) {
    case 'refund_requested':
      return {
        to: recipient.email,
        subject: `Refund request: ${amount} on order ${orderShort}`,
        html: htmlShell(
          `Hi ${safeName},`,
          `A buyer has requested a refund of <strong>${amount}</strong> on order <code>${orderShort}</code>.`,
          safeMessage ? `Buyer message: <blockquote>${safeMessage}</blockquote>` : null,
          `Review and process the request in your dashboard:`,
          `<a href="${baseUrl}/dashboard/refunds/${payload.refundId}">Open refund</a>`
        ),
      }
    case 'refund_approved':
      return {
        to: recipient.email,
        subject: `Refund approved by ${safeOrg}`,
        html: htmlShell(
          `Hi ${safeName},`,
          `${safeOrg} has approved your refund of <strong>${amount}</strong> on order <code>${orderShort}</code>. We are now processing it with the payment provider; funds typically arrive within 5 to 10 business days.`,
          `<a href="${baseUrl}/account/refund-requests">View status</a>`
        ),
      }
    case 'refund_processed':
      return {
        to: recipient.email,
        subject: `Refund processed: ${amount}`,
        html: htmlShell(
          `Hi ${safeName},`,
          `Your refund of <strong>${amount}</strong> for order <code>${orderShort}</code> has been processed by ${safeOrg}. The funds are now in transit to your original payment method.`,
          `<a href="${baseUrl}/account/refund-requests">View status</a>`
        ),
      }
    case 'refund_denied':
      return {
        to: recipient.email,
        subject: `Refund request not approved`,
        html: htmlShell(
          `Hi ${safeName},`,
          `${safeOrg} has reviewed your refund request of <strong>${amount}</strong> on order <code>${orderShort}</code> and was not able to approve it.`,
          safeDenial ? `Reason: <blockquote>${safeDenial}</blockquote>` : null,
          `If you believe this is in error, you can reply to this email or contact support.`
        ),
      }
    case 'refund_failed':
      return {
        to: recipient.email,
        subject: `Refund failed for order ${orderShort}`,
        html: htmlShell(
          `Hi ${safeName},`,
          `A refund of <strong>${amount}</strong> on order <code>${orderShort}</code> failed during processing.`,
          safeFailure ? `Reason: <blockquote>${safeFailure}</blockquote>` : null,
          `Please review the refund in your dashboard and retry, or contact support if the issue persists.`,
          `<a href="${baseUrl}/dashboard/refunds/${payload.refundId}">Open refund</a>`
        ),
      }
  }
}

function htmlShell(...parts: (string | null)[]): string {
  const body = parts
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px 0;line-height:1.5;color:#1A1A2E">${p}</p>`)
    .join('')
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;padding:24px;color:#1A1A2E">${body}<hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0" /><p style="font-size:12px;color:#6B7280">EventLinqs - Every culture. Every event. One platform.</p></div>`
}

export async function sendRefundEmail(
  adminClient: SupabaseClient,
  organisationId: string,
  kind: RefundEmailKind,
  payload: RefundEmailPayload
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const isOrganiserBound = kind === 'refund_requested' || kind === 'refund_failed'

  let recipient: { email: string; name: string | null } | null = null
  let orgName = 'EventLinqs'

  if (isOrganiserBound) {
    const owner = await loadOwnerEmail(adminClient, organisationId)
    if (!owner) return
    recipient = { email: owner.email, name: owner.name }
    orgName = owner.orgName
  } else {
    const owner = await loadOwnerEmail(adminClient, organisationId)
    if (owner) orgName = owner.orgName
    const buyer = await loadBuyerContact(adminClient, payload.orderId)
    if (!buyer) return
    recipient = buyer
  }

  if (!recipient) return

  const email = buildEmail(kind, recipient, orgName, payload)
  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: SENDER,
      to: email.to,
      subject: email.subject,
      html: email.html,
    })
  } catch (err) {
    console.error('[refund-email] send failed', { kind, refundId: payload.refundId, err })
  }
}
