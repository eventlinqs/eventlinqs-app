import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeClient } from '@/lib/payments/payout'
import { getDefaultTransferGateway } from '@/lib/payments/gateway-factory'
import { runEventDisbursements } from '@/lib/payments/event-transfer'
import { runVenueDisbursements } from '@/lib/payments/venue-transfer'

export const dynamic = 'force-dynamic'

/**
 * Cron route: post-event organiser disbursement (funds-holding model).
 *
 * For every event that ended at least the buffer ago on a payout-active org,
 * disburses the event's held funds (event-scoped available ledger balance, net
 * of fee, net of still-held reserve and any open chargeback hold) with a
 * platform->connected Transfer. Idempotent and concurrency-safe: disburse_transfer
 * claims atomically under a row lock and returns nothing_to_disburse once an
 * event is paid; matured reserves are picked up on a later run after
 * /api/cron/payout-holds-release releases them.
 *
 * Reserves and disbursement mature on a day-scale schedule, so an hourly cadence
 * is ample. Protected by CRON_SECRET (Vercel Cron sends it as
 * `Authorization: Bearer <CRON_SECRET>`), mirroring /api/cron/payout-holds-release.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const adminClient = createAdminClient()
  const stripe = getStripeClient()
  const transferGateway = getDefaultTransferGateway()

  try {
    const summary = await runEventDisbursements(adminClient, transferGateway, stripe)
    console.log(
      `[cron/event-disbursement] considered=${summary.considered} transferred=${summary.transferred} skipped=${summary.skipped} failed=${summary.failed}`
    )

    // Venue Revenue Sharing Program: after organisers are paid, pay enrolled
    // venues their accrued share for the same ended events. Independent of the
    // organiser path; a venue failure never affects the organiser disbursement.
    let venueSummary
    try {
      venueSummary = await runVenueDisbursements(adminClient, transferGateway, stripe)
      console.log(
        `[cron/event-disbursement] venue considered=${venueSummary.considered} transferred=${venueSummary.transferred} skipped=${venueSummary.skipped} failed=${venueSummary.failed}`
      )
    } catch (venueErr) {
      console.error('[cron/event-disbursement] venue disbursement error (organiser run unaffected):', venueErr)
    }

    return NextResponse.json({ ok: true, ...summary, venue: venueSummary ?? null, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[cron/event-disbursement] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
