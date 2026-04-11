import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { promoteWaitlist } from '@/lib/waitlist/promote'

export const dynamic = 'force-dynamic'

/**
 * Cron route: runs every 5 minutes via Vercel Crons.
 *
 * 1. Calls expire_stale_squads() RPC — finds squads past expires_at in 'forming' status,
 *    marks them 'expired', and returns the affected squad IDs + their tier/event info.
 * 2. For each expired squad: issues Stripe refunds for any paid members, releases
 *    the squad's shared reservation, and promotes the waitlist for the freed inventory.
 *
 * Protected by CRON_SECRET to prevent public triggering.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const adminClient = createAdminClient()

  let expiredSquads: {
    squad_id: string
    event_id: string
    ticket_tier_id: string
    total_spots: number
    reservation_id: string | null
  }[] = []

  try {
    // Step 1: Expire stale squads via RPC (atomic — uses row-level locking)
    const { data: rpcResult, error: rpcError } = await adminClient.rpc('expire_stale_squads')

    if (rpcError) {
      console.error('[squad-expire] expire_stale_squads RPC error:', rpcError)
      // RPC may not exist yet — fall back to manual query
    } else {
      expiredSquads = (rpcResult as typeof expiredSquads) ?? []
    }

    // Fallback: if RPC returned nothing or errored, find and expire squads manually
    if (expiredSquads.length === 0) {
      const { data: staleSquads, error: fetchError } = await adminClient
        .from('squads')
        .select('id, event_id, ticket_tier_id, total_spots, reservation_id')
        .eq('status', 'forming')
        .lt('expires_at', new Date().toISOString())

      if (fetchError) {
        console.error('[squad-expire] fetch stale squads error:', fetchError)
      }

      if (staleSquads && staleSquads.length > 0) {
        const staleIds = staleSquads.map(s => s.id)

        // Mark all stale squads as expired
        await adminClient
          .from('squads')
          .update({ status: 'expired' })
          .in('id', staleIds)
          .eq('status', 'forming')

        expiredSquads = staleSquads.map(s => ({
          squad_id: s.id,
          event_id: s.event_id,
          ticket_tier_id: s.ticket_tier_id,
          total_spots: s.total_spots,
          reservation_id: s.reservation_id,
        }))
      }
    }

    if (expiredSquads.length === 0) {
      return NextResponse.json({ expired: 0, message: 'No squads to expire' })
    }

    console.log(`[squad-expire] processing ${expiredSquads.length} expired squad(s)`)

    let totalRefunded = 0
    let totalWaitlistsPromoted = 0

    for (const squad of expiredSquads) {
      // Step 2a: Find paid members who need refunds
      const { data: paidMembers, error: membersError } = await adminClient
        .from('squad_members')
        .select('id, order_id')
        .eq('squad_id', squad.squad_id)
        .eq('status', 'paid')

      if (membersError) {
        console.error(`[squad-expire] fetch paid members error for squad ${squad.squad_id}:`, membersError)
        continue
      }

      // Step 2b: Issue Stripe refunds for each paid member
      if (paidMembers && paidMembers.length > 0) {
        const stripeKey = process.env.STRIPE_SECRET_KEY
        if (stripeKey) {
          const { default: Stripe } = await import('stripe')
          const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' })

          for (const member of paidMembers) {
            if (!member.order_id) continue

            const { data: payment } = await adminClient
              .from('payments')
              .select('gateway_payment_id, status, amount_cents')
              .eq('order_id', member.order_id)
              .eq('status', 'completed')
              .maybeSingle()

            if (!payment?.gateway_payment_id) continue

            try {
              await stripe.refunds.create({
                payment_intent: payment.gateway_payment_id,
                reason: 'requested_by_customer',
              })

              // Mark order as refunded
              await adminClient
                .from('orders')
                .update({ status: 'refunded' })
                .eq('id', member.order_id)

              await adminClient
                .from('payments')
                .update({ status: 'refunded' })
                .eq('order_id', member.order_id)

              totalRefunded++
              console.log(`[squad-expire] refunded member ${member.id} order ${member.order_id}`)
            } catch (refundErr) {
              console.error(`[squad-expire] Stripe refund failed for order ${member.order_id}:`, refundErr)
            }
          }
        } else {
          console.warn('[squad-expire] STRIPE_SECRET_KEY not set — skipping refunds')
        }
      }

      // Step 2c: Release the squad's shared reservation
      if (squad.reservation_id) {
        await adminClient
          .from('reservations')
          .update({ status: 'cancelled' })
          .eq('id', squad.reservation_id)
          .eq('status', 'active')
      }

      // Step 2d: Promote waitlist — tickets are back in inventory
      try {
        // How many spots were NOT yet paid = released back to pool
        const paidCount = paidMembers?.length ?? 0
        const releasedSpots = squad.total_spots - paidCount
        if (releasedSpots > 0) {
          await promoteWaitlist(squad.event_id, squad.ticket_tier_id, releasedSpots)
          totalWaitlistsPromoted++
        }
      } catch (waitlistErr) {
        console.error(`[squad-expire] promoteWaitlist failed for squad ${squad.squad_id}:`, waitlistErr)
      }
    }

    return NextResponse.json({
      expired: expiredSquads.length,
      refunded: totalRefunded,
      waitlists_promoted: totalWaitlistsPromoted,
    })
  } catch (err) {
    console.error('[squad-expire] unhandled error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
