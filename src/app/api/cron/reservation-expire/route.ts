import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Cron route: runs every 5 minutes via Vercel Crons.
 *
 * Calls expire_stale_reservations() RPC - atomically finds active reservations
 * past expires_at, releases their reserved inventory (decrements
 * ticket_tiers.reserved_count per held item), marks each reservation 'expired',
 * and RETURNS the count of reservations expired.
 *
 * The expiry logic lives entirely in the database function. This route only
 * invokes it so held tickets release on a schedule. Previously the function was
 * scheduled solely via pg_cron, which is not installed, so it never ran and
 * stale reservations locked up inventory indefinitely.
 *
 * Protected by CRON_SECRET to prevent public triggering.
 */
export async function GET(request: NextRequest) {
  // Verify secret header set by Vercel Cron
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  try {
    const { data: expiredCount, error: rpcError } = await adminClient.rpc(
      'expire_stale_reservations'
    )

    if (rpcError) {
      console.error('[cron/reservation-expire] expire_stale_reservations RPC error:', rpcError)
      return NextResponse.json({ error: 'RPC failed', detail: rpcError.message }, { status: 500 })
    }

    const count = (expiredCount as number) ?? 0
    console.log(`[cron/reservation-expire] expired ${count} reservation(s)`)

    return NextResponse.json({
      ok: true,
      expired: count,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/reservation-expire] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
