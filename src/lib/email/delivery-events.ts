/**
 * THE OPERATIONAL STREAM's BOUNCES AND COMPLAINTS, RECORDED AND ACTED ON (window 6, 29 October 2026; the master mandate
 * section 11: "Unsubscribe and suppression handling. Bounce handling. Delivery monitoring").
 *
 * Until now nothing took Resend's webhooks, so a hard bounce or a spam complaint on a receipt, a reminder or the
 * digest was never recorded. Resend signs each webhook and the route verifies it with the installed SDK on the raw body
 * (https://resend.com/docs/webhooks/verify-webhooks-requests, fetched 29 October 2026); this module is what a VERIFIED
 * event becomes. The payload shape is Resend's own (https://resend.com/docs/webhooks/emails/bounced, fetched the same
 * day): type, created_at, data.email_id, data.to an array, data.bounce.type and subType. Only a bounce.type of
 * 'Permanent' marks an address undeliverable (deliveryFactsOf, below); Resend's other bounce type is a soft one.
 *
 * Two different facts, kept apart on purpose:
 *   - a PERMANENT BOUNCE says the address cannot receive mail. It is deliverability, not consent: it is recorded in
 *     email_delivery_events and marketing audiences leave the address out, but it is never written into the consent
 *     ledger as if the person had asked to stop;
 *   - a COMPLAINT is the person telling their mailbox provider the mail was unwanted. It is recorded AND becomes a
 *     marketing stop in the consent ledger (suppression_events, scope all_marketing), so every marketing path that
 *     reads the ledger leaves them out. Transactional mail (their ticket, their refund) is not stopped by it.
 * Opens and clicks are not recorded here: they are never a measure on this platform.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { recordSuppressionEvent } from '@/lib/consent/ledger'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'

type Admin = SupabaseClient<Database>

/** The events kept for delivery monitoring. Anything else is acknowledged and ignored. */
export const RECORDED_EVENTS = ['email.bounced', 'email.complained', 'email.delivered', 'email.delivery_delayed', 'email.failed', 'email.suppressed'] as const

export type ResendWebhookEvent = {
  type: string
  created_at?: string
  data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string; subType?: string; message?: string } }
}

export type DeliveryFact = {
  eventType: string
  emailId: string | null
  address: string
  bounceType: string | null
  bounceSubtype: string | null
  detail: string | null
  occurredAt: string
  /** A permanent bounce: the address cannot receive mail, so marketing leaves it out. */
  undeliverable: boolean
  /** A spam complaint: a marketing stop in the consent ledger. */
  complaint: boolean
}

/** What one verified event is recorded as: one fact per recipient, or none for an event not kept. */
export function deliveryFactsOf(e: ResendWebhookEvent): DeliveryFact[] {
  if (!(RECORDED_EVENTS as readonly string[]).includes(e.type)) return []
  const to = e.data?.to
  const addresses = (Array.isArray(to) ? to : to ? [to] : []).map((a) => a.trim().toLowerCase()).filter((a) => a.includes('@'))
  const bounce = e.type === 'email.bounced' ? e.data?.bounce : undefined
  return addresses.map((address) => ({
    eventType: e.type,
    emailId: e.data?.email_id ?? null,
    address,
    bounceType: bounce?.type ?? null,
    bounceSubtype: bounce?.subType ?? null,
    detail: bounce?.message ?? null,
    occurredAt: e.created_at ?? new Date().toISOString(),
    undeliverable: e.type === 'email.bounced' && bounce?.type === 'Permanent',
    complaint: e.type === 'email.complained',
  }))
}

/**
 * Records each fact once (the provider's event id and the address are unique together, so a retried webhook writes
 * nothing new) and turns a complaint into a marketing stop. Throws on a failed write, so the route answers 500 and
 * Resend retries rather than the fact being lost.
 */
export async function recordDeliveryFacts(db: Admin, svixId: string, facts: readonly DeliveryFact[]): Promise<{ recorded: number; stops: number }> {
  let recorded = 0
  let stops = 0
  for (const f of facts) {
    const { error, count } = await db
      .from('email_delivery_events')
      .upsert(
        {
          provider: 'resend',
          provider_event_id: svixId,
          event_type: f.eventType,
          email_id: f.emailId,
          address: f.address,
          bounce_type: f.bounceType,
          bounce_subtype: f.bounceSubtype,
          detail: f.detail ? f.detail.slice(0, 1000) : null,
          undeliverable: f.undeliverable,
          occurred_at: f.occurredAt,
        },
        { onConflict: 'provider_event_id,address', ignoreDuplicates: true, count: 'exact' },
      )
    if (error) throw new Error(`email_delivery_events: ${error.message}`)
    recorded += count ?? 0
    if (f.complaint) {
      const stopped = await recordSuppressionEvent(db, {
        email: f.address,
        channel: 'email',
        scope: 'all_marketing',
        reason: 'The recipient reported an EventLinqs email as spam to their mailbox provider (Resend email.complained).',
        requestSource: 'resend_webhook_complaint',
        at: f.occurredAt,
      })
      if (!stopped) throw new Error(`the consent ledger did not record the complaint stop for ${f.address}`)
      stops++
    }
  }
  return { recorded, stops }
}

/** The addresses that cannot receive mail (a permanent bounce recorded), for marketing audiences to leave out. */
export async function undeliverableAddresses(db: Admin, addresses: readonly string[]): Promise<Set<string>> {
  const wanted = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter(Boolean))]
  const out = new Set<string>()
  for (const chunk of chunkInFilterValues(wanted)) {
    const rows = await readEveryRow<{ address: string }>('undeliverable addresses', (from, to) =>
      db.from('email_delivery_events').select('address').eq('undeliverable', true).in('address', chunk).order('id', { ascending: true }).range(from, to),
    )
    for (const r of rows) out.add(r.address)
  }
  return out
}
