import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runReserveRelease } from '@/lib/payments/payout'

export const dynamic = 'force-dynamic'

/**
 * Cron route: matured reserve-hold release.
 *
 * Calls release_holds() (supabase/migrations/20260531000003_m6_payout_disbursement.sql)
 * via the runReserveRelease helper. For every reserve hold past its release_at,
 * on a payout-active org with no open chargeback hold on the same event, the
 * RPC sets released_at, writes the `reserve_release` ledger credit (moving the
 * reserve into available), and decrements the org hold counter. It is
 * concurrency-safe (FOR UPDATE SKIP LOCKED) and idempotent: a run with nothing
 * matured returns 0 and touches no rows.
 *
 * Reserves mature on a day-scale schedule (event end + N business days), so an
 * hourly cadence is ample; this is the production schedule (pg_cron is not
 * enabled on this Supabase project). Without it, matured reserves never move
 * back into the organiser's available balance.
 *
 * Protected by CRON_SECRET (Vercel Cron sends it as
 * `Authorization: Bearer <CRON_SECRET>`), mirroring /api/cron/reservation-expire.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  try {
    const released = await runReserveRelease(adminClient)
    console.log(`[cron/payout-holds-release] released ${released} matured reserve holds`)

    return NextResponse.json({
      ok: true,
      released,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/payout-holds-release] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
