import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripeClient } from '@/lib/payments/payout'
import { getDefaultTransferGateway } from '@/lib/payments/gateway-factory'
import { runEventDisbursements } from '@/lib/payments/event-transfer'

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
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const adminClient = createAdminClient()
  const stripe = getStripeClient()
  const transferGateway = getDefaultTransferGateway()

  try {
    const summary = await runEventDisbursements(adminClient, transferGateway, stripe)
    console.log(
      `[cron/event-disbursement] considered=${summary.considered} transferred=${summary.transferred} skipped=${summary.skipped} failed=${summary.failed}`
    )
    return NextResponse.json({ ok: true, ...summary, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[cron/event-disbursement] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
