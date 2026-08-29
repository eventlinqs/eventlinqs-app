import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
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
  const denied = requireCronAuth(request)
  if (denied) return denied

  const adminClient = createAdminClient()

  try {
    const { data: releasedCount, error } = await adminClient.rpc('expire_stale_reservations')

    if (error) {
      console.error('[cron/reservation-expire] expire_stale_reservations RPC error:', error)
      return NextResponse.json({ error: 'RPC failed' }, { status: 500 })
    }

    const released = (releasedCount as number) ?? 0
    console.log(`[cron/reservation-expire] released ${released} stale reservations`)

    // Reserved seating: seats held by expired or cancelled reservations go
    // back to 'available' (sold seats untouched). Runs after the tier sweeper
    // so a reservation it just marked 'expired' frees its seats in the same
    // tick; also catches seat reservations expired between runs.
    const { data: seatsReleased, error: seatError } = await adminClient.rpc(
      'release_expired_seat_reservations'
    )
    if (seatError) {
      console.error('[cron/reservation-expire] release_expired_seat_reservations RPC error:', seatError)
    } else if ((seatsReleased as number) > 0) {
      console.log(`[cron/reservation-expire] released ${seatsReleased} expired seat holds`)
    }

    /*
     * DISCOUNT HOLDS, released the same way and in the same tick as seats.
     *
     * Since migration 20260829000003 a discount use is CLAIMED when the code is
     * applied to a reservation, so a lapsed reservation must give its use back
     * or the code stays permanently one short of its cap. That is an organiser
     * losing sales to abandoned carts, which is the same failure a seat left in
     * limbo causes, so it is swept the same way.
     *
     * Runs after the two sweepers above for the same reason the seat sweeper
     * does: a reservation either of them has just marked 'expired' releases its
     * hold in this pass rather than the next one.
     *
     * A failure here is logged and does NOT fail the run. The tier and seat
     * inventory have already been released by this point, and taking the whole
     * cron down over a discount counter would hold real seats hostage to it.
     */
    const { data: discountsReleased, error: discountError } = await adminClient.rpc(
      'release_expired_discount_claims'
    )
    if (discountError) {
      console.error(
        '[cron/reservation-expire] release_expired_discount_claims RPC error:',
        discountError,
        discountError.code === 'PGRST202'
          ? 'The function does not exist on this database. Apply migration 20260829000003_discount_claims_at_reservation.sql.'
          : '',
      )
    } else if ((discountsReleased as number) > 0) {
      console.log(`[cron/reservation-expire] released ${discountsReleased} expired discount holds`)
    }

    return NextResponse.json({
      ok: true,
      released,
      seatsReleased: (seatsReleased as number) ?? 0,
      discountsReleased: (discountsReleased as number) ?? 0,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/reservation-expire] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
