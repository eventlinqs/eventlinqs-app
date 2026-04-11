import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { promoteWaitlist } from '@/lib/waitlist/promote'

export const dynamic = 'force-dynamic'

/**
 * Cron route: runs every 5 minutes via Vercel Crons.
 * 1. Calls expire_waitlist_notifications() RPC — marks expired 'notified' entries
 *    back to 'waiting' (or 'expired' if limit reached), freeing up the position.
 * 2. For every tier that just had an expiry, re-triggers promote_waitlist so the
 *    next person in line is notified immediately.
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
    // Step 1: Expire overdue notifications and get count of affected rows
    const { data: expiredCount, error: expireError } = await adminClient.rpc(
      'expire_waitlist_notifications'
    )

    if (expireError) {
      console.error('[cron/waitlist-expire] expire_waitlist_notifications RPC error:', expireError)
      return NextResponse.json({ error: 'RPC failed' }, { status: 500 })
    }

    const count = (expiredCount as number) ?? 0
    console.log(`[cron/waitlist-expire] expired ${count} notifications`)

    // Step 2: Find all event/tier pairs that still have 'waiting' entries (potential promos)
    // The expire RPC may have freed capacity — attempt promotion for waiting tiers
    if (count > 0) {
      const { data: waitingTiers, error: waitingError } = await adminClient
        .from('waitlist')
        .select('event_id, ticket_tier_id')
        .eq('status', 'waiting')
        .order('position', { ascending: true })

      if (waitingError) {
        console.error('[cron/waitlist-expire] failed to fetch waiting tiers:', waitingError)
      } else if (waitingTiers && waitingTiers.length > 0) {
        // Deduplicate event+tier pairs
        const seen = new Set<string>()
        const uniquePairs: { event_id: string; tier_id: string }[] = []
        for (const row of waitingTiers) {
          if (!row.event_id || !row.ticket_tier_id) continue
          const key = `${row.event_id}:${row.ticket_tier_id}`
          if (!seen.has(key)) {
            seen.add(key)
            uniquePairs.push({ event_id: row.event_id, tier_id: row.ticket_tier_id })
          }
        }

        // For each pair, check if inventory is available and promote
        for (const { event_id, tier_id } of uniquePairs) {
          const { data: tier } = await adminClient
            .from('ticket_tiers')
            .select('total_capacity, sold_count, reserved_count')
            .eq('id', tier_id)
            .single()

          if (!tier) continue
          const available = tier.total_capacity - tier.sold_count - tier.reserved_count
          if (available <= 0) continue

          promoteWaitlist(event_id, tier_id, available).catch(err => {
            console.error('[cron/waitlist-expire] promoteWaitlist failed:', err)
          })
        }
      }
    }

    return NextResponse.json({
      ok: true,
      expired: count,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/waitlist-expire] unexpected error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
