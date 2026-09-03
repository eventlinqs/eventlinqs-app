/**
 * BREAK ATTEMPT: DOUBLE REFUND.
 *
 * Refunding the same ticket twice pays a buyer twice out of an organiser's
 * money. It is the mirror of overselling and it is easier to trigger, because a
 * refund is usually a button an operator presses under pressure, twice, when the
 * first press seems slow.
 *
 * WHERE THE PROTECTION HAS TO LIVE, which decides what this attacks.
 *
 *   refundOrder() passes Stripe an idempotency key. That is NOT the defence
 *   here: the key is `refund:${refund_id}` and a second attempt that got its own
 *   refunds row would carry a DIFFERENT refund_id, so Stripe would happily
 *   create a second refund. The key protects a retry of one attempt, not two
 *   attempts.
 *
 *   So everything rests on create_refund_request(), which locks the ORDER row
 *   FOR UPDATE and then refuses any ticket already claimed by an active
 *   refund_tickets row. If that check and the insert were separable, two
 *   presses landing together would each see an unclaimed ticket and each raise a
 *   refund. That is the window this attacks.
 *
 * THREE ATTEMPTS:
 *   1. sequential  the operator presses twice, a second apart.
 *   2. simultaneous  WAVE presses with no stagger, the real double-click.
 *   3. partial then whole  refund one ticket, then try to refund the order
 *      including that ticket, which is the shape that slips a per-ticket check.
 *
 * It stops at the DATABASE gate and never calls Stripe, deliberately: if the
 * gate refuses the second request then no second Stripe refund can exist, and
 * proving it this way does not move real money twice to find out.
 *
 * TEST ONLY. Refuses to run against the production project.
 *
 * Usage: node scripts/verify/double-refund.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

/*
 * THE SHARED PREFLIGHT, not this file's own opinion.
 *
 * A hand-rolled `if (URL.includes(PRODUCTION_REF))` check reads the URL this
 * FILE happens to look at. The preflight resolves the project the PROCESS will
 * actually use, refuses production unless ALLOW_PRODUCTION_SUPABASE=1 is set
 * explicitly, and refuses outright when it cannot tell which it is, which is
 * the case a local check silently passes.
 */
assertNotProduction()

const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

if (!URL || !KEY) {
  console.error('[double-refund] load .env.test first.')
  process.exit(1)
}
if (URL.includes(PRODUCTION_REF)) {
  console.error('[double-refund] REFUSED: that is the PRODUCTION project.')
  process.exit(1)
}

const db = createClient(URL, KEY)
const WAVE = 6

/** A paid, confirmed order with a live ticket and a payment intent. */
async function findRefundableOrder() {
  const { data: orders } = await db
    .from('orders')
    .select('id, organisation_id, status, total_cents')
    .eq('status', 'confirmed')
    .gt('total_cents', 0)
    .order('created_at', { ascending: false })
    .limit(40)

  for (const o of orders ?? []) {
    const { data: tickets } = await db
      .from('tickets')
      .select('id, status')
      .eq('order_id', o.id)
      .in('status', ['valid', 'scanned'])
    if (!tickets?.length) continue

    const { data: payment } = await db
      .from('payments')
      .select('gateway_payment_id')
      .eq('order_id', o.id)
      .not('gateway_payment_id', 'is', null)
      .maybeSingle()
    if (!payment?.gateway_payment_id) continue

    // Not already claimed by an active refund.
    const { count } = await db
      .from('refund_tickets')
      .select('ticket_id', { count: 'exact', head: true })
      .in('ticket_id', tickets.map(t => t.id))
      .eq('is_active', true)
    if ((count ?? 0) > 0) continue

    const { data: org } = await db
      .from('organisations')
      .select('owner_id')
      .eq('id', o.organisation_id)
      .maybeSingle()
    if (!org?.owner_id) continue

    return { order: o, tickets, actorId: org.owner_id }
  }
  return null
}

function request(orderId, ticketIds, actorId, label) {
  return db
    .rpc('create_refund_request', {
      p_order_id: orderId,
      p_ticket_ids: ticketIds,
      p_reason: 'requested_by_buyer',
      p_initiator: 'organiser',
      p_actor_id: actorId,
      p_buyer_message: null,
    })
    .then(({ data, error }) => ({
      label,
      ok: !error && !!data,
      refundId: (Array.isArray(data) ? data[0] : data)?.refund_id ?? null,
      why: error?.message ?? null,
    }))
}

async function activeRefundRows(orderId) {
  const { data } = await db.from('refunds').select('id, amount_cents, status').eq('order_id', orderId)
  return data ?? []
}

const found = await findRefundableOrder()
if (!found) {
  console.error('[double-refund] no confirmed paid order with an unclaimed live ticket on TEST. Run scripts/journeys/j3.mjs first.')
  process.exit(1)
}

const { order, tickets, actorId } = found
const oneTicket = [tickets[0].id]
console.log(`[double-refund] order ${order.id}, ${tickets.length} live ticket(s), total ${order.total_cents}c`)

let allHeld = true

// ── 1. simultaneous: the real double-click, run FIRST so it meets an
//      UNCLAIMED ticket. It used to run second, on "a second ticket if the
//      order has one", so on a one-ticket order (which is most orders) the
//      most important case silently printed SKIPPED and the run still said
//      HELD. A case that cannot run is not a case that passed.
{
  const results = await Promise.all(
    Array.from({ length: WAVE }, (_, i) => request(order.id, oneTicket, actorId, `wave-${i}`)),
  )
  const accepted = results.filter(r => r.ok)
  const rows = await activeRefundRows(order.id)
  const held = accepted.length === 1 && rows.length === 1
  allHeld = allHeld && held
  console.log('\n--- simultaneous: the real double-click ---')
  console.log(`  ${WAVE} presses landing together on one ticket`)
  console.log(`  accepted  ${accepted.length}  (expected 1)`)
  console.log(`  refusals said: ${[...new Set(results.filter(r => !r.ok).map(r => r.why))].slice(0, 2).join(' | ')}`)
  console.log(`  refund rows on the order: ${rows.length}`)
  console.log(`  ${held ? 'HELD' : 'BROKEN'}`)
}

// ── 2. sequential: the operator presses again a moment later ──────────────
{
  const again = await request(order.id, oneTicket, actorId, 'again')
  const rows = await activeRefundRows(order.id)
  const held = !again.ok && rows.length === 1
  allHeld = allHeld && held
  console.log('\n--- sequential: pressed again afterwards ---')
  console.log(`  ${again.ok ? 'ACCEPTED (BROKEN)' : 'REFUSED'}  ${again.why ?? ''}`)
  console.log(`  refund rows on the order: ${rows.length}`)
  console.log(`  ${held ? 'HELD' : 'BROKEN'}`)
}

// ── 3. partial, then the whole order including the refunded ticket ─────────
{
  const whole = tickets.map(t => t.id)
  const res = await request(order.id, whole, actorId, 'whole-after-partial')
  const rows = await activeRefundRows(order.id)
  const held = !res.ok
  allHeld = allHeld && held
  console.log('\n--- refund the whole order after part of it was refunded ---')
  console.log(`  ${res.ok ? 'ACCEPTED (BROKEN)' : 'REFUSED'}  ${res.why ?? ''}`)
  console.log(`  refund rows on the order: ${rows.length}`)
  console.log(`  ${held ? 'HELD' : 'BROKEN'}`)
}

console.log(
  `\n[double-refund] ${allHeld ? 'HELD: a ticket can be claimed by exactly one refund.' : 'BROKEN: a ticket was claimed twice.'}`,
)
console.log('[double-refund] note: refund ROWS were created on TEST and no Stripe call was made.')
process.exit(allHeld ? 0 : 1)
