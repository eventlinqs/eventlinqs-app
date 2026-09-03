/**
 * TWO BUYERS, ONE REMAINING USE. ONLY ONE MAY GET IT.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS PROVING, and why the previous proof was not enough.
 *
 * Migration 20260829000001 made discount_codes.current_uses incapable of
 * EXCEEDING max_uses, and that was driven: eight simultaneous claims on a code
 * capped at 1 produced exactly one winner. It bounded THE COUNTER.
 *
 * It did not bound THE MONEY. validateDiscountCode read current_uses to decide
 * whether the buyer could have the discount, and the use was claimed only after
 * the order was confirmed, so two buyers who both read 0 were both GRANTED the
 * discount and only one advanced the counter. The organiser lost the difference
 * on the second one. Bounded per person by max_uses_per_user for a signed-in
 * buyer; unbounded across different buyers and entirely unbounded for guests,
 * who have no user_id to count against.
 *
 * Migration 20260829000003 moves the claim to the moment the code is APPLIED to
 * a reservation, under a row lock, and releases it when the reservation lapses,
 * exactly as a held seat is released. This drives that.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS DRIVEN, in order, each one a separate claim about the system.
 *
 *   1. THE RACE. N reservations, all applying the same code capped at 1, fired
 *      simultaneously with no stagger. Exactly one may hold it.
 *   2. THE CAP INCLUDES HOLDS. While one buyer holds the last use, the code
 *      must read as exhausted to everybody else, BEFORE anyone has paid. That
 *      is the property the old code lacked entirely.
 *   3. THE HOLD RELEASES. When the reservation lapses, the use comes back and
 *      the next buyer can have it. A hold that never releases turns an
 *      abandoned cart into a permanently unusable code, which is a different
 *      way to lose the organiser money.
 *   4. THE HOLD CONVERTS. On confirmation it becomes a real use: reserved down,
 *      current up, exactly once.
 *   5. IDEMPOTENCE. Claiming twice for one reservation consumes one use, not
 *      two, so a retried checkout cannot burn a buyer's code.
 *   6. RELEASING NOTHING IS A NO-OP. Releasing a reservation that holds nothing
 *      must not decrement, or it hands out a free use.
 *
 * TEST ONLY. Refuses to run against the production project.
 *
 * Usage: node scripts/verify/discount-claim-drive.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { assertNotProduction } from '../lib/production-write-preflight.mjs'

assertNotProduction()

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const stamp = String(Date.now()).slice(-6)
const results = []

function verdict(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`\n${(ok ? 'HELD' : 'BROKEN').padEnd(8)} ${name}`)
  console.log(`      ${detail}`)
}

const { data: event } = await db
  .from('events')
  .select('id, organisation_id')
  .eq('status', 'published')
  .limit(1)
  .single()
if (!event) {
  console.error('[claim] no published event on TEST.')
  process.exit(1)
}

/** A live reservation to hang a claim on. */
async function reservation(label) {
  const { data, error } = await db
    .from('reservations')
    .insert({
      event_id: event.id,
      user_id: null,
      session_id: `claim-${label}-${stamp}`,
      status: 'active',
      items: [],
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
    .select('id')
    .single()
  if (error) throw new Error(`could not stage a reservation: ${error.message}`)
  return data.id
}

async function code({ maxUses = 1 } = {}) {
  const { data, error } = await db
    .from('discount_codes')
    .insert({
      event_id: event.id,
      organisation_id: event.organisation_id,
      code: `CLAIM${stamp}${Math.floor(Math.random() * 900 + 100)}`,
      discount_type: 'percentage',
      discount_percentage: 50,
      discount_amount_cents: null,
      max_uses: maxUses,
      max_uses_per_user: 99,
      current_uses: 0,
      reserved_uses: 0,
      is_active: true,
    })
    .select('id, code, max_uses')
    .single()
  if (error) throw new Error(`could not stage a code: ${error.message}`)
  return data
}

const readCode = async id =>
  (await db.from('discount_codes').select('current_uses, reserved_uses, max_uses').eq('id', id).single()).data

const cleanup = []

try {
  // ── 1 + 2. THE RACE, AND THE CAP THAT INCLUDES HOLDS ────────────────────
  {
    const WAVE = 8
    const dc = await code({ maxUses: 1 })
    cleanup.push(dc.id)
    const holders = await Promise.all(Array.from({ length: WAVE }, (_, i) => reservation(`race${i}`)))

    const wave = await Promise.all(
      holders.map(r => db.rpc('claim_discount_use', { p_code_id: dc.id, p_reservation_id: r })),
    )
    const missing = wave.some(w => w.error?.code === 'PGRST202')
    const won = wave.filter(w => w.data === true).length
    const refused = wave.filter(w => w.data === false).length
    const errored = wave.filter(w => w.error).length
    const after = await readCode(dc.id)

    verdict(
      'two buyers granted the SAME last use of a capped code',
      !missing && errored === 0 && won === 1 && refused === WAVE - 1 && after.reserved_uses === 1,
      missing
        ? 'claim_discount_use does not exist on this database. Apply migration 20260829000003.'
        : `${WAVE} simultaneous buyers applied a code capped at 1: ${won} got it, ${refused} were refused, ` +
          `${errored} errored. reserved_uses=${after.reserved_uses} current_uses=${after.current_uses} of ` +
          `max_uses=${after.max_uses}. Before this migration ALL ${WAVE} would have been granted the discount ` +
          `and exactly one would have advanced the counter.`,
    )

    // The cap must read as reached to a NEW buyer while the winner still holds
    // it and BEFORE anybody has paid. This is the property that did not exist.
    const latecomer = await reservation('latecomer')
    const { data: late } = await db.rpc('claim_discount_use', {
      p_code_id: dc.id,
      p_reservation_id: latecomer,
    })
    const stillHeld = await readCode(dc.id)
    verdict(
      'the cap counts HELD uses, so a later buyer is refused before anyone has paid',
      late === false && stillHeld.current_uses === 0 && stillHeld.reserved_uses === 1,
      `a ninth buyer arriving while the winner is still paying was refused (claim returned ${late}). ` +
        `current_uses is still ${stillHeld.current_uses}: nobody has confirmed yet, and that is exactly ` +
        `the window in which the old code handed the discount to everyone who asked.`,
    )

    // ── 3. THE HOLD RELEASES WHEN THE RESERVATION LAPSES ──────────────────
    const winner = holders[wave.findIndex(w => w.data === true)]
    await db
      .from('reservations')
      .update({ status: 'expired', expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', winner)
    const { data: sweptCount } = await db.rpc('release_expired_discount_claims')
    const released = await readCode(dc.id)

    const { data: nowAvailable } = await db.rpc('claim_discount_use', {
      p_code_id: dc.id,
      p_reservation_id: latecomer,
    })
    const afterRetake = await readCode(dc.id)

    verdict(
      'a lapsed reservation gives the use back, the way a seat is given back',
      sweptCount >= 1 && released.reserved_uses === 0 && nowAvailable === true && afterRetake.reserved_uses === 1,
      `the sweeper released ${sweptCount} hold(s); reserved_uses went to ${released.reserved_uses}, and the ` +
        `buyer who was refused a moment ago could then take it (claim returned ${nowAvailable}, ` +
        `reserved_uses=${afterRetake.reserved_uses}). An abandoned cart does not retire an organiser's code.`,
    )

    // ── 4. AND IT CONVERTS ON CONFIRMATION ────────────────────────────────
    const { data: converted } = await db.rpc('convert_discount_claim', { p_reservation_id: latecomer })
    const done = await readCode(dc.id)
    verdict(
      'the hold becomes exactly one real use on confirmation',
      converted === true && done.current_uses === 1 && done.reserved_uses === 0,
      `convert returned ${converted}; current_uses=${done.current_uses} reserved_uses=${done.reserved_uses}. ` +
        'One redemption, counted once: the hold is converted rather than incremented a second time.',
    )
  }

  // ── 5. IDEMPOTENCE ──────────────────────────────────────────────────────
  {
    const dc = await code({ maxUses: 5 })
    cleanup.push(dc.id)
    const r = await reservation('idem')
    const a = await db.rpc('claim_discount_use', { p_code_id: dc.id, p_reservation_id: r })
    const b = await db.rpc('claim_discount_use', { p_code_id: dc.id, p_reservation_id: r })
    const after = await readCode(dc.id)
    verdict(
      'a retried checkout consumes one use, not two',
      a.data === true && b.data === true && after.reserved_uses === 1,
      `two claims for the SAME reservation both returned true and reserved_uses is ${after.reserved_uses}. ` +
        'A buyer who re-applies their code, or a checkout that is retried, must not burn a second use.',
    )
  }

  // ── 6. RELEASING NOTHING MUST NOT HAND OUT A FREE USE ───────────────────
  {
    const dc = await code({ maxUses: 3 })
    cleanup.push(dc.id)
    const r = await reservation('empty')
    const { data: releasedNothing } = await db.rpc('release_discount_claim', { p_reservation_id: r })
    const after = await readCode(dc.id)
    verdict(
      'releasing a reservation that holds nothing is a no-op',
      releasedNothing === false && after.reserved_uses === 0,
      `release returned ${releasedNothing} and reserved_uses is ${after.reserved_uses}. A release that ` +
        'decremented unconditionally would drive the counter negative and hand out uses that do not exist.',
    )
  }
} catch (err) {
  verdict('the drive itself', false, String(err?.message ?? err))
} finally {
  for (const id of cleanup) {
    await db.from('discount_codes').delete().eq('id', id)
  }
  await db.from('reservations').delete().like('session_id', `claim-%-${stamp}`)
}

console.log('\n==== DISCOUNT CLAIM AT RESERVATION ====')
for (const r of results) console.log(`  ${(r.ok ? 'HELD' : 'BROKEN').padEnd(8)} ${r.name}`)
const broken = results.filter(r => !r.ok).length
console.log(`\n  ${results.length - broken} of ${results.length} held.`)
process.exit(broken > 0 ? 1 : 0)
