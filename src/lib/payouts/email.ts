import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * M6 Phase 4 organiser payout notifications.
 *
 * Four canonical events emit one email each to the organisation owner:
 *
 *   payout_initiated   - Stripe payout.created webhook
 *   payout_paid        - Stripe payout.paid webhook
 *   payout_failed      - Stripe payout.failed webhook
 *   reserve_released   - reserve hold release worker (Phase 4-cron, not yet
 *                        wired here; helper exposed for the future caller)
 *
 * Sender: noreply@eventlinqs.com (matches existing buyer confirmation
 * sender in the Stripe webhook). No-ops when RESEND_API_KEY is unset, so
 * local dev and CI never block on email delivery.
 */

type AdminClient = SupabaseClient

const FROM = 'EventLinqs <noreply@eventlinqs.com>'

export type PayoutEmailKind =
  | 'payout_initiated'
  | 'payout_paid'
  | 'payout_failed'
  | 'reserve_released'

export interface PayoutEmailPayload {
  amountCents: number
  currency: string
  arrivalDate: string | null
  failureReason?: string | null
  eventTitle?: string | null
}

export async function sendPayoutEmail(
  adminClient: AdminClient,
  organisationId: string,
  kind: PayoutEmailKind,
  payload: PayoutEmailPayload
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  const recipient = await resolveOwnerEmail(adminClient, organisationId)
  if (!recipient) return

  const { subject, html } = buildEmail(kind, recipient.organisationName, payload)

  try {
    const resend = new Resend(apiKey)
    await resend.emails.send({
      from: FROM,
      to: recipient.email,
      subject,
      html,
    })
  } catch (err) {
    console.error('[payouts/email] send failed', { organisationId, kind, error: err })
  }
}

interface OwnerLookup {
  email: string
  organisationName: string
  organisationId: string
}

async function resolveOwnerEmail(
  adminClient: AdminClient,
  organisationId: string
): Promise<OwnerLookup | null> {
  const { data: org, error } = await adminClient
    .from('organisations')
    .select('id, name, owner_id')
    .eq('id', organisationId)
    .maybeSingle()
  if (error || !org) return null

  const { data: profile } = await adminClient
    .from('profiles')
    .select('email')
    .eq('id', org.owner_id as string)
    .maybeSingle()

  if (!profile?.email) return null
  return {
    email: profile.email as string,
    organisationName: (org.name as string) ?? 'your organisation',
    organisationId: org.id as string,
  }
}

function buildEmail(
  kind: PayoutEmailKind,
  organisationName: string,
  payload: PayoutEmailPayload
): { subject: string; html: string } {
  const amount = formatAmount(payload.amountCents, payload.currency)
  const arrival = payload.arrivalDate ? formatDate(payload.arrivalDate) : null
  const dashboardUrl = `${baseUrl()}/dashboard/payouts`

  switch (kind) {
    case 'payout_initiated':
      return {
        subject: `Payout on the way to ${organisationName}`,
        html: shell(
          'Payout on the way',
          `<p>Stripe has scheduled a payout of <strong>${amount}</strong> to your bank.</p>` +
            (arrival
              ? `<p>Expected arrival: <strong>${arrival}</strong>.</p>`
              : '<p>Stripe will confirm the arrival date shortly.</p>'),
          dashboardUrl
        ),
      }
    case 'payout_paid':
      return {
        subject: `Paid: ${amount} to ${organisationName}`,
        html: shell(
          'Payout paid',
          `<p>Stripe has settled <strong>${amount}</strong> into your bank account.</p>` +
            (arrival ? `<p>Arrival: <strong>${arrival}</strong>.</p>` : ''),
          dashboardUrl
        ),
      }
    case 'payout_failed':
      return {
        subject: `Action needed: payout failed for ${organisationName}`,
        html: shell(
          'Payout failed',
          `<p>Stripe could not deliver a payout of <strong>${amount}</strong>.</p>` +
            (payload.failureReason
              ? `<p>Reason: <em>${escapeHtml(payload.failureReason)}</em></p>`
              : '<p>No reason was provided. Open the Stripe Dashboard for details.</p>') +
            '<p>Please review your bank details and the payouts dashboard.</p>',
          dashboardUrl
        ),
      }
    case 'reserve_released':
      return {
        subject: `Reserve released for ${organisationName}`,
        html: shell(
          'Reserve released',
          `<p>A reserve of <strong>${amount}</strong> has been released and will be included in your next payout.</p>` +
            (payload.eventTitle
              ? `<p>Event: <strong>${escapeHtml(payload.eventTitle)}</strong>.</p>`
              : ''),
          dashboardUrl
        ),
      }
  }
}

function shell(heading: string, body: string, dashboardUrl: string): string {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h1 style="color:#1A1A2E;font-size:22px;margin-bottom:8px;">${heading}</h1>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
      <div style="color:#374151;font-size:14px;line-height:1.6;">${body}</div>
      <p style="margin-top:24px;">
        <a href="${dashboardUrl}"
           style="display:inline-block;background:#1A1A2E;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;">
          Open payouts dashboard
        </a>
      </p>
      <p style="margin-top:32px;color:#9CA3AF;font-size:12px;">
        The EventLinqs team. The ticketing platform built for every culture.
      </p>
    </div>
  `
}

function formatAmount(cents: number, currency: string): string {
  const value = (cents ?? 0) / 100
  return `${(currency ?? 'aud').toUpperCase()} ${value.toFixed(2)}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventlinqs.com'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
