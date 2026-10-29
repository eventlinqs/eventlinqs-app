import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'
import { deliveryFactsOf, recordDeliveryFacts, type ResendWebhookEvent } from '@/lib/email/delivery-events'

export const dynamic = 'force-dynamic'

/**
 * RESEND's DELIVERY WEBHOOK FOR THE OPERATIONAL STREAM (window 6, 29 October 2026; the master mandate section 11).
 *
 * Verified before anything is read: Resend signs every webhook, and its own docs say to verify the RAW body with the
 * signing secret and the svix-id, svix-timestamp and svix-signature headers through the SDK
 * (https://resend.com/docs/webhooks/verify-webhooks-requests, fetched 29 October 2026; resend 6.18.1 installed). A
 * request that fails is answered 400 and nothing is written. A verified event becomes the facts of
 * src/lib/email/delivery-events.ts: bounces, complaints and delivery states recorded once, a complaint a marketing stop
 * in the consent ledger. A write that fails answers 500, so Resend retries rather than the fact being lost.
 *
 * Public by design: the caller is Resend, with no session; the signature is the credential.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const key = process.env.RESEND_API_KEY
  if (!secret || !key) {
    console.error(`[webhooks/resend] ${secret ? 'RESEND_API_KEY' : 'RESEND_WEBHOOK_SECRET'} is not set; refusing every delivery event`)
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }
  const payload = await request.text()
  const svixId = request.headers.get('svix-id')
  const svixTimestamp = request.headers.get('svix-timestamp')
  const svixSignature = request.headers.get('svix-signature')
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'missing signature headers' }, { status: 400 })
  }

  let event: ResendWebhookEvent
  try {
    event = new Resend(key).webhooks.verify({
      payload,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret: secret,
    }) as unknown as ResendWebhookEvent
  } catch (err) {
    console.warn('[webhooks/resend] signature verification failed:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 })
  }

  try {
    const facts = deliveryFactsOf(event)
    const done = await recordDeliveryFacts(createAdminClient(), svixId, facts)
    return NextResponse.json({ ok: true, type: event.type, recorded: done.recorded, stops: done.stops })
  } catch (err) {
    captureException(err, { scope: 'resend-webhook', event_type: event.type })
    console.error('[webhooks/resend] could not record the event:', err)
    return NextResponse.json({ error: 'not recorded' }, { status: 500 })
  }
}
