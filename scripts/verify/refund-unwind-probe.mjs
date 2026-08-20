/**
 * WHAT A REFUND ACTUALLY UNWINDS, AND WHAT IT LEAVES BEHIND.
 *
 * `reconcile_refund` is the one place a completed refund is applied, and reading it
 * (supabase/migrations/20260819000004_confirm_only_pending_orders.sql) it touches:
 * tickets, ticket_tiers.sold_count, organiser_balance_ledger, payout_holds,
 * organisations.hold_amount_cents / total_volume_cents, orders.status, refunds.status.
 *
 * It does NOT touch `public.seats`. A seated ticket that is refunded therefore leaves
 * its seat at status 'sold' with the ticket voided: the seat map shows it taken, the
 * seat cannot be resold, and the ticket at the door is void. Dead for the event.
 *
 * This script REPRODUCES that against real rows rather than asserting it from the
 * migration text, and it is the before/after instrument for the fix.
 *
 * TEST ONLY, guarded. Read only: it writes nothing.
 *
 * USAGE:
 *   node --env-file=.env.test scripts/verify/refund-unwind-probe.mjs
 *   node --env-file=.env.test scripts/verify/refund-unwind-probe.mjs --order <uuid>
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction({ envFile: '.env.test' })

const argv = process.argv.slice(2)
const arg = (n, d = null) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1] }
const ONE_ORDER = arg('--order')

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const hr = t => { console.log('\n' + '='.repeat(88)); console.log(t); console.log('='.repeat(88)) }

hr('1. REFUNDED OR VOID TICKETS THAT STILL HOLD A SEAT')
/*
 * The leak, stated as a query. A ticket that is refunded or void has no holder, so
 * any seat still attached to it and still marked sold or reserved is a seat nobody
 * can buy and nobody can sit in.
 */
/*
 * THE FOREIGN KEY IS NAMED EXPLICITLY, and it has to be now. Migration
 * 20260820000001 added `tickets.released_seat_id`, so `tickets` has TWO
 * relationships to `seats` and an unqualified embed fails with "more than one
 * relationship was found". `seat_id` is the live one and the only one this
 * question is about: a ticket that still HOLDS a seat.
 */
let q = db
  .from('tickets')
  .select('id, order_id, status, seat_id, ticket_tier_id, refunded_at, seats!tickets_seat_id_fkey!inner(id, status, row_label, seat_number, event_id)')
  .in('status', ['refunded', 'void'])
  .not('seat_id', 'is', null)
  .limit(200)
if (ONE_ORDER) q = q.eq('order_id', ONE_ORDER)

const { data: stuck, error } = await q
if (error) { console.error('  query failed:', error.message); process.exit(2) }

const leaked = (stuck ?? []).filter(t => ['sold', 'reserved', 'held'].includes(t.seats?.status))
const released = (stuck ?? []).filter(t => t.seats?.status === 'available')

console.log(`  refunded/void tickets carrying a seat : ${(stuck ?? []).length}`)
console.log(`  seat still sold/reserved/held (LEAK)  : ${leaked.length}`)
console.log(`  seat correctly available             : ${released.length}`)

for (const t of leaked.slice(0, 20)) {
  console.log(`    LEAK  ticket ${t.id.slice(0, 8)}  ${t.status.padEnd(8)} seat ${t.seats.row_label}${t.seats.seat_number} = ${t.seats.status}  event ${t.seats.event_id.slice(0, 8)}`)
}

hr('2. WHAT ELSE A COMPLETED REFUND SHOULD HAVE UNWOUND')
/*
 * Every artefact of a purchase, checked per refunded order. Absent and false are
 * different answers, so each line says which it is.
 */
const { data: refunds } = await db
  .from('refunds')
  .select('id, order_id, status, amount_cents, created_at')
  .eq('status', 'completed')
  .order('created_at', { ascending: false })
  .limit(ONE_ORDER ? 200 : 10)

const scoped = (refunds ?? []).filter(r => !ONE_ORDER || r.order_id === ONE_ORDER)
console.log(`  inspecting ${scoped.length} completed refund(s)\n`)

for (const r of scoped) {
  const { data: order } = await db
    .from('orders')
    .select('id, status, event_id, organisation_id, total_cents, currency')
    .eq('id', r.order_id)
    .maybeSingle()
  if (!order) { console.log(`  refund ${r.id.slice(0, 8)}: ORDER MISSING`); continue }

  const { data: tickets } = await db
    .from('tickets')
    .select('id, status, seat_id, ticket_tier_id')
    .eq('order_id', order.id)

  const { data: ledger } = await db
    .from('organiser_balance_ledger')
    .select('delta_cents, reason')
    .eq('reference_id', order.id)

  const net = (ledger ?? []).reduce((a, l) => a + Number(l.delta_cents), 0)

  const seatIds = (tickets ?? []).map(t => t.seat_id).filter(Boolean)
  let seatStates = []
  if (seatIds.length) {
    const { data: seats } = await db.from('seats').select('id, status, row_label, seat_number').in('id', seatIds)
    seatStates = seats ?? []
  }
  const seatsStuck = seatStates.filter(s => s.status !== 'available')

  const live = (tickets ?? []).filter(t => ['valid', 'scanned'].includes(t.status)).length
  const dead = (tickets ?? []).filter(t => ['refunded', 'void'].includes(t.status)).length

  console.log(`  refund ${r.id.slice(0, 8)}  order ${order.id.slice(0, 8)}  order.status=${order.status}`)
  console.log(`      tickets     live ${live}, refunded/void ${dead}`)
  console.log(`      seats       ${seatStates.length === 0 ? 'none (general admission)' : `${seatStates.length} attached, ${seatsStuck.length} NOT available${seatsStuck.length ? '  <<< LEAK' : ''}`}`)
  console.log(`      ledger      ${(ledger ?? []).length} row(s), net ${net}c`)
}

hr('3. VERDICT')
if (leaked.length > 0) {
  console.log(`  SEAT RELEASE IS MISSING: ${leaked.length} seat(s) are held by a ticket that no longer exists.`)
  console.log('  Each one is a seat that cannot be resold and will not admit anybody.')
  process.exitCode = 1
} else {
  console.log('  No stuck seats found in the rows inspected.')
  console.log('  NOTE: absence here is only meaningful if a seated refund exists to find.')
  console.log(`  Seated refunded/void tickets inspected: ${(stuck ?? []).length}.`)
  if ((stuck ?? []).length === 0) {
    console.log('  ZERO were found, so this run proves NOTHING about seat release.')
    console.log('  Drive a seated refund first, then re-run. See refund-seat-drill.mjs.')
    process.exitCode = 2
  }
}
