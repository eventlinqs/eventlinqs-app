import { NextRequest, NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { promoteWaitlist } from '@/lib/waitlist/promote'
import { requestTicketRefund } from '@/lib/payments/refund-service'
import { captureException } from '@/lib/observability/sentry'

export const dynamic = 'force-dynamic'

/**
 * Cron route: runs every 5 minutes via Vercel Crons.
 *
 * 1. Calls expire_stale_squads() RPC - atomically finds forming squads past
 *    expires_at, marks them 'expired', marks uninvited members 'timed_out',
 *    cancels their reservation, and RETURNS the expired squad rows.
 * 2. For each expired squad: queries paid members and refunds each one through
 *    requestTicketRefund, the SAME path the organiser button and automatic
 *    approval use, then promotes the waitlist for freed inventory.
 *
 * WHY THIS STOPPED CALLING STRIPE DIRECTLY (20 August 2026).
 *
 * It used to call stripe.refunds.create itself, with no idempotency key, and
 * then write orders.status and payments.status afterwards. I reported that as a
 * double-refund risk and DRIVING IT PROVED ME WRONG:
 * scripts/verify/squad-expire-double-refund-drill.mjs forces the exact crash,
 * a Stripe refund that lands with the status writes never happening, then runs
 * this cron twice. Stripe reports ONE refund of 28000c against a 28000c charge.
 * Two things prevent the double: expire_stale_squads() is an atomic CTE that
 * returns a squad exactly once, and Stripe refuses to over-refund a charge that
 * is already fully refunded (run 1 reported refund_failures: 1).
 *
 * THE DRILL FOUND A REAL DEFECT INSTEAD, which is what this change fixes. After
 * that crash the state was permanently wrong and nothing repaired it: zero
 * refunds rows, orders.status still 'confirmed', payments.status still
 * 'completed', squad_members.status still 'paid'. The buyer had their money back
 * and still held a valid, scannable ticket, and the squad was already 'expired'
 * so this cron would never look at it again. The whole unwind depended on the
 * webhook adopting the orphan refund; if that was delayed or failed, nothing
 * else would ever put it right.
 *
 * requestTicketRefund fixes the ordering by construction. It writes the refund
 * row FIRST, through create_refund_request, which locks the order and claims the
 * tickets, and only then calls Stripe under idempotencyKey `refund:{refundId}`.
 * So a crash after the money moves leaves a refund row the webhook reconciles,
 * rather than a refund nothing knows about, and reconcile_refund then does the
 * whole unwind: ticket void, tier inventory, seat release, squad slot, ledger
 * and order status.
 *
 * Protected by CRON_SECRET to prevent public triggering.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  const adminClient = createAdminClient()

  try {
    // Step 1: Expire stale squads via RPC (atomic - expires squads, marks
    //         members timed_out, cancels reservations, returns squad details
    //         needed for Stripe refund processing below)
    const { data: rpcResult, error: rpcError } = await adminClient.rpc('expire_stale_squads')

    if (rpcError) {
      console.error('[squad-expire] expire_stale_squads RPC error:', rpcError)
      return NextResponse.json({ error: 'RPC failed', detail: rpcError.message }, { status: 500 })
    }

    // Guard: after migration the RPC returns TABLE rows (array). Before the
    // migration is applied it returns an integer - treat that as empty array
    // so the route still responds 200 rather than crashing.
    const expiredSquads = (Array.isArray(rpcResult) ? rpcResult : []) as {
      squad_id: string
      event_id: string
      ticket_tier_id: string
      total_spots: number
      reservation_id: string | null
      share_token: string
    }[]

    if (expiredSquads.length === 0) {
      return NextResponse.json({ expired: 0, message: 'No squads to expire' })
    }

    console.log(`[squad-expire] processing ${expiredSquads.length} expired squad(s)`)

    let totalRefunded = 0
    let refundFailures = 0
    let totalWaitlistsPromoted = 0

    for (const squad of expiredSquads) {
      // Step 2a: Find paid members who need Stripe refunds
      const { data: paidMembers, error: membersError } = await adminClient
        .from('squad_members')
        .select('id, order_id')
        .eq('squad_id', squad.squad_id)
        .eq('status', 'paid')

      if (membersError) {
        console.error(`[squad-expire] fetch paid members error for squad ${squad.squad_id}:`, membersError)
        continue
      }

      // Step 2b: Refund each paid member THROUGH THE ONE REFUND PATH.
      //
      // requestTicketRefund writes the refund row before it calls Stripe and
      // passes idempotencyKey `refund:{refundId}`, so a retry of the same row
      // cannot mint a second Stripe refund and a crash after the money moves
      // leaves a row the webhook reconciles. See the header for the drill.
      for (const member of paidMembers ?? []) {
        if (!member.order_id) continue

        // Only tickets that are still live can be refunded. An order with none
        // has nothing to return and create_refund_request would refuse it.
        const { data: liveTickets } = await adminClient
          .from('tickets')
          .select('id')
          .eq('order_id', member.order_id)
          .in('status', ['valid', 'scanned'])
        const ticketIds = (liveTickets ?? []).map(t => t.id as string)
        if (ticketIds.length === 0) {
          console.log(`[squad-expire] member ${member.id} order ${member.order_id} has no live tickets, nothing to refund`)
          continue
        }

        // The organisation owner stands in as the actor, exactly as it does for
        // an automatically approved buyer request: the platform is acting on the
        // organiser's behalf under a rule they already agreed to.
        const { data: ownerRow } = await adminClient
          .from('orders')
          .select('organisation_id, organisations(owner_id)')
          .eq('id', member.order_id)
          .maybeSingle()
        const actorId = (ownerRow as { organisations?: { owner_id?: string } } | null)?.organisations?.owner_id
        if (!actorId) {
          refundFailures++
          console.error(`[squad-expire] order ${member.order_id} has no organisation owner to attribute the refund to`)
          continue
        }

        try {
          const res = await requestTicketRefund(adminClient, {
            orderId: member.order_id,
            ticketIds,
            reason: 'other',
            initiator: 'system',
            actorId,
            buyerMessage: 'Your squad did not fill before it expired, so your ticket has been refunded.',
          })

          // NOTHING IS WRITTEN HERE. reconcile_refund owns every status the old
          // code used to set by hand (orders, payments, tickets, seats, the
          // squad slot and the ledger), and the webhook drives it. Writing them
          // here as well is what made the two able to disagree.
          totalRefunded++
          console.log(`[squad-expire] refunded member ${member.id} order ${member.order_id} refund ${res.refundId}`)
        } catch (refundErr) {
          refundFailures++
          console.error(`[squad-expire] refund failed for order ${member.order_id}:`, refundErr)
          captureException(refundErr, {
            scope: 'squad-expire',
            order_id: member.order_id,
            squad_id: squad.squad_id,
            member_id: member.id,
          })
        }
      }

      // Step 2c: Promote waitlist - reservation already cancelled by RPC;
      //          calculate released spots as total minus confirmed paid members
      try {
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
      refund_failures: refundFailures,
      waitlists_promoted: totalWaitlistsPromoted,
    })
  } catch (err) {
    console.error('[squad-expire] unhandled error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
