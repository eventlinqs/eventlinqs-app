/**
 * BREAK ATTEMPT: OVERSELL UNDER CONCURRENCY.
 *
 * The question is not "does the code check capacity". It plainly does. The
 * question is whether the check and the write are separable, because a
 * read-then-write that is not held under one lock will sell the same seat to
 * every buyer who arrives in the same millisecond, and that is the failure that
 * only ever shows up in production on the night a show sells out.
 *
 * WHERE THE PROTECTION ACTUALLY LIVES, which decides what this has to attack.
 *
 *   create_reservation() locks the tier row FOR UPDATE, reads
 *   total_capacity - sold_count - reserved_count, refuses when it is short, and
 *   only then increments reserved_count. The lock spans the read and the write,
 *   so this is the gate.
 *
 *   confirm_order() does NOT re-check capacity on the active-hold branch: it
 *   moves the quantity from reserved_count to sold_count, because the
 *   reservation already took it. It re-checks only when the hold has LAPSED.
 *   So a hole in create_reservation would not be caught later, and this test
 *   aims at create_reservation deliberately.
 *
 * WHAT IT DOES. Takes a tier down to exactly N seats free, fires WAVE parallel
 * reservations for one seat each with no stagger, and asserts that exactly N
 * succeeded and that the tier never went past its own capacity. Then repeats at
 * a quantity larger than one, because "sell one seat twice" and "sell the last
 * two seats to two people asking for two each" are different bugs.
 *
 * TEST ONLY. It refuses to run against the production project.
 *
 * Usage: node scripts/verify/oversell-under-concurrency.mjs
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
  console.error('[oversell] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (load .env.test).')
  process.exit(1)
}
if (URL.includes(PRODUCTION_REF)) {
  console.error('[oversell] REFUSED: this points at the PRODUCTION project. It writes reservations.')
  process.exit(1)
}

const db = createClient(URL, KEY)
const WAVE = 8

/** A tier we own for this run, so nothing real is disturbed. */
async function makeTier(capacity) {
  const { data: event } = await db
    .from('events')
    .select('id, organisation_id')
    .eq('status', 'published')
    .limit(1)
    .single()
  if (!event) throw new Error('no published event on TEST to attach a tier to')

  const { data: tier, error } = await db
    .from('ticket_tiers')
    .insert({
      event_id: event.id,
      name: `Oversell probe ${Date.now()}`,
      price: 0,
      total_capacity: capacity,
      sold_count: 0,
      reserved_count: 0,
      is_active: true,
    })
    .select('id, total_capacity, sold_count, reserved_count')
    .single()
  if (error) throw new Error(`could not create probe tier: ${error.message}`)
  return { tier, eventId: event.id }
}

async function readTier(id) {
  const { data } = await db
    .from('ticket_tiers')
    .select('total_capacity, sold_count, reserved_count')
    .eq('id', id)
    .single()
  return data
}

/**
 * One buyer's attempt. Uses the SAME rpc the checkout path uses, so this
 * exercises the real gate rather than a re-implementation of it.
 */
function reserve(eventId, tierId, quantity, i) {
  return db
    .rpc('create_reservation', {
      p_event_id: eventId,
      p_user_id: null,
      p_session_id: `oversell-probe-${i}-${Date.now()}`,
      p_items: [{ ticket_tier_id: tierId, quantity }],
    })
    .then(({ data, error }) => ({
      i,
      ok: !error && data?.success === true,
      why: error ? error.message : (data?.error ?? null),
    }))
}

async function run(label, capacity, quantityEach, expectedWinners) {
  const { tier, eventId } = await makeTier(capacity)
  try {
    // No stagger: every request enters the function at once, which is the only
    // way the read-then-write window can be observed at all.
    const results = await Promise.all(
      Array.from({ length: WAVE }, (_, i) => reserve(eventId, tier.id, quantityEach, i)),
    )
    const winners = results.filter(r => r.ok)
    const after = await readTier(tier.id)
    const committed = (after?.sold_count ?? 0) + (after?.reserved_count ?? 0)
    const overshoot = committed - (after?.total_capacity ?? 0)

    const pass = winners.length === expectedWinners && overshoot <= 0

    console.log(`\n--- ${label} ---`)
    console.log(`  capacity ${capacity}, ${WAVE} simultaneous buyers asking for ${quantityEach} each`)
    console.log(`  succeeded         ${winners.length}   (expected ${expectedWinners})`)
    console.log(`  refused           ${results.length - winners.length}`)
    console.log(`  sold + reserved   ${committed} of ${after?.total_capacity}`)
    console.log(`  OVERSOLD BY       ${overshoot > 0 ? overshoot : 0}`)
    const reasons = [...new Set(results.filter(r => !r.ok).map(r => r.why))]
    for (const r of reasons.slice(0, 3)) console.log(`  refusal said      ${r}`)
    console.log(`  ${pass ? 'HELD' : 'BROKEN'}`)
    return pass
  } finally {
    // Clean up: the reservations cascade with the tier.
    await db.from('reservations').delete().eq('event_id', eventId).like('session_id', 'oversell-probe-%')
    await db.from('ticket_tiers').delete().eq('id', tier.id)
  }
}

console.log('[oversell] attacking create_reservation with simultaneous buyers.')

const one = await run('the last single seat, eight buyers', 1, 1, 1)
const two = await run('the last two seats, eight buyers wanting two each', 2, 2, 1)
const partial = await run('three seats, eight buyers wanting two each', 3, 2, 1)

const held = one && two && partial
console.log(`\n[oversell] ${held ? 'HELD: no wave sold a seat that did not exist.' : 'BROKEN: inventory went past capacity.'}`)
process.exit(held ? 0 : 1)
