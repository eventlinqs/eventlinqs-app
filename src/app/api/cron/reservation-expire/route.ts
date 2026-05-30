import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Cron route: runs every minute via Vercel Crons.
 *
 * Calls expire_stale_reservations() - the authoritative SQL sweeper defined in
 * supabase/migrations/20260101000001_baseline_schema.sql. That function selects
 * ONLY reservations with status = 'active' AND expires_at < NOW(), releases each
 * held ticket_tiers.reserved_count back to inventory (clamped at 0), and marks
 * the reservation 'expired'. It is concurrency-safe (FOR UPDATE SKIP LOCKED) and
 * idempotent: a run with nothing stale returns 0 and touches no rows.
 *
 * The migration tries to schedule this via pg_cron, but pg_cron is not enabled on
 * this Supabase project, so the DB schedule silently skips. This route is the
 * production schedule. Without it, abandoned carts hold inventory until the next
 * create_reservation for the same scope happens to release them lazily - an
 * oversell / lockout risk during a high-demand on-sale.
 *
 * Protected by CRON_SECRET to prevent public triggering (Vercel Cron sends it as
 * `Authorization: Bearer <CRON_SECRET>`).
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
    const { data: releasedCount, error } = await adminClient.rpc('expire_stale_reservations')

    if (error) {
      console.error('[cron/reservation-expire] expire_stale_reservations RPC error:', error)
      return NextResponse.json({ error: 'RPC failed' }, { status: 500 })
    }

    const released = (releasedCount as number) ?? 0
    console.log(`[cron/reservation-expire] released ${released} stale reservations`)

    return NextResponse.json({
      ok: true,
      released,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/reservation-expire] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
