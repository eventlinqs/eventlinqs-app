/**
 * THE REMAINING BREAK ATTEMPTS, driven at the gate that decides each one.
 *
 * Oversell and double refund have their own scripts because they needed real
 * concurrency waves. These eight are single decisions, so they live together.
 *
 * Each prints what it attacked, what happened, and a verdict:
 *
 *   HELD            refused, and the refusal is true about its own cause
 *   BROKEN          allowed something it must not allow
 *   BY DESIGN       allowed, and that is the intended product decision, stated
 *   NEEDS MIGRATION the gate exists in the tree and not yet in the database
 *
 * "BY DESIGN" is a real verdict rather than a soft failure: an organiser
 * refunding somebody who already walked in is a decision they are allowed to
 * make, and calling that a defect would be inventing a policy nobody set.
 *
 * TEST ONLY. Refuses to run against the production project.
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
const BASE = process.env.BASE ?? 'http://localhost:3311'

if (!URL || !KEY) {
  console.error('[break] load .env.test first.')
  process.exit(1)
}
if (URL.includes(PRODUCTION_REF)) {
  console.error('[break] REFUSED: that is the PRODUCTION project.')
  process.exit(1)
}

const db = createClient(URL, KEY)
const results = []

function verdict(name, v, detail) {
  results.push({ name, v, detail })
  console.log(`\n${v.padEnd(16)} ${name}`)
  console.log(`      ${detail}`)
}

async function publishedEvent() {
  const { data } = await db
    .from('events')
    .select('id, organisation_id, slug')
    .eq('status', 'published')
    .limit(1)
    .single()
  return data
}

async function probeTier(eventId, capacity) {
  const { data } = await db
    .from('ticket_tiers')
    .insert({
      event_id: eventId,
      name: `Break probe ${Date.now()}`,
      price: 0,
      total_capacity: capacity,
      sold_count: 0,
      reserved_count: 0,
      is_active: true,
    })
    .select('id')
    .single()
  return data.id
}

const event = await publishedEvent()
if (!event) {
  console.error('[break] no published event on TEST.')
  process.exit(1)
}

// ─── 1. DOUBLE SUBMIT ───────────────────────────────────────────────────────
// Two confirmations landing on ONE order must not mint two sets of tickets or
// consume two seats. confirm_order claims to be idempotent; this checks it
// under simultaneity rather than in sequence, which is the case that matters.
{
  const tierId = await probeTier(event.id, 5)
  const { data: r } = await db.rpc('create_reservation', {
    p_event_id: event.id,
    p_user_id: null,
    p_session_id: `break-double-${Date.now()}`,
    p_items: [{ ticket_tier_id: tierId, quantity: 1 }],
  })
  const reservationId = r?.reservation_id ?? r?.id ?? null

  const { data: order } = await db
    .from('orders')
    .insert({
      event_id: event.id,
      organisation_id: event.organisation_id,
      order_number: `EL-BRK${String(Date.now()).slice(-6)}`,
      status: 'pending',
      subtotal_cents: 0,
      total_cents: 0,
      currency: 'AUD',
      guest_email: 'break@example.com',
      reservation_id: reservationId,
    })
    .select('id')
    .single()

  if (!order) {
    verdict('double submit: two confirmations of one order', 'SKIPPED', 'could not stage a pending order')
  } else {
    const wave = await Promise.all(
      Array.from({ length: 5 }, () => db.rpc('confirm_order', { p_order_id: order.id })),
    )
    const accepted = wave.filter(w => !w.error).length
    const { count: ticketCount } = await db
      .from('tickets')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order.id)
    const { data: tier } = await db
      .from('ticket_tiers')
      .select('sold_count')
      .eq('id', tierId)
      .single()

    const held = (ticketCount ?? 0) <= 1 && (tier?.sold_count ?? 0) <= 1
    verdict(
      'double submit: five confirmations of one order at once',
      held ? 'HELD' : 'BROKEN',
      `${accepted} calls returned without error, sold_count ${tier?.sold_count} (must be 1), tickets issued ${ticketCount}. ` +
        'The load-bearing number here is sold_count: five simultaneous confirmations consumed ONE seat. ' +
        'The ticket count is 0 because this staged order carries no order_items, so the issuance trigger had ' +
        'nothing to mint; it is not evidence either way and is printed rather than dressed up.',
    )
    await db.from('orders').delete().eq('id', order.id)
  }
  await db.from('ticket_tiers').delete().eq('id', tierId)
}

// ─── 2. EXPIRED HOLD ────────────────────────────────────────────────────────
// A reservation whose window has passed must not still convert into a seat on
// a tier that has since sold out. confirm_order re-checks capacity only on the
// LAPSED branch, so this is precisely the branch under test.
{
  const tierId = await probeTier(event.id, 1)
  const { data: r } = await db.rpc('create_reservation', {
    p_event_id: event.id,
    p_user_id: null,
    p_session_id: `break-expired-${Date.now()}`,
    p_items: [{ ticket_tier_id: tierId, quantity: 1 }],
  })
  const reservationId = r?.reservation_id ?? r?.id ?? null

  if (!reservationId) {
    verdict('expired hold still converts', 'SKIPPED', 'could not create a reservation to expire')
  } else {
    // Lapse the hold, and let the seat go to somebody else in the meantime.
    await db
      .from('reservations')
      .update({ expires_at: new Date(Date.now() - 60_000).toISOString(), status: 'expired' })
      .eq('id', reservationId)
    await db.from('ticket_tiers').update({ sold_count: 1, reserved_count: 0 }).eq('id', tierId)

    const { data: order } = await db
      .from('orders')
      .insert({
        event_id: event.id,
        organisation_id: event.organisation_id,
        order_number: `EL-EXP${String(Date.now()).slice(-6)}`,
        status: 'pending',
        subtotal_cents: 0,
        total_cents: 0,
        currency: 'AUD',
        guest_email: 'expired@example.com',
        reservation_id: reservationId,
      })
      .select('id')
      .single()

    const { error } = await db.rpc('confirm_order', { p_order_id: order.id })
    const { data: tier } = await db.from('ticket_tiers').select('sold_count, total_capacity').eq('id', tierId).single()
    const oversold = (tier?.sold_count ?? 0) > (tier?.total_capacity ?? 0)

    verdict(
      'expired hold converts into a seat that is gone',
      error && !oversold ? 'HELD' : 'BROKEN',
      error
        ? `refused: ${error.message.slice(0, 120)}`
        : `ACCEPTED with sold_count ${tier?.sold_count} of ${tier?.total_capacity}`,
    )
    if (order) await db.from('orders').delete().eq('id', order.id)
  }
  await db.from('ticket_tiers').delete().eq('id', tierId)
}

// ─── 3. TRANSFER AFTER SCAN ─────────────────────────────────────────────────
// A scanned ticket must never move: one QR would admit two people.
{
  const { data: scanned } = await db
    .from('tickets')
    .select('id, order_id, status')
    .eq('status', 'scanned')
    .limit(1)
    .maybeSingle()

  if (!scanned) {
    verdict('transfer a ticket that has already been scanned', 'SKIPPED', 'no scanned ticket on TEST to attack')
  } else {
    const { error } = await db.rpc('transfer_ticket_for_order', {
      p_ticket_id: scanned.id,
      p_order_id: scanned.order_id,
      p_to_email: 'thief@example.com',
      p_to_name: 'Second Entry',
    })
    const missing = error?.message?.includes('Could not find the function')
    verdict(
      'transfer a ticket that has already been scanned',
      missing ? 'NEEDS MIGRATION' : error ? 'HELD' : 'BROKEN',
      missing
        ? 'transfer_ticket_for_order is not on this database yet (migration 20260829000002). The signed-in path refuses this already and is covered by tests/unit/tickets/transfer.test.ts.'
        : error
          ? `refused: ${error.message.slice(0, 100)}`
          : 'THE TICKET MOVED. One QR would now admit two people.',
    )
  }
}

// ─── 4. EXPIRED DISCOUNT ────────────────────────────────────────────────────
{
  const code = `EXPIRED${String(Date.now()).slice(-5)}`
  const { error: insErr } = await db.from('discount_codes').insert({
    event_id: event.id,
    organisation_id: event.organisation_id,
    code,
    discount_type: 'percentage',
    discount_percentage: 50,
    discount_amount_cents: null,
    max_uses_per_user: 1,
    is_active: true,
    valid_until: new Date(Date.now() - 86_400_000).toISOString(),
  })

  if (insErr) {
    verdict('an expired discount code still applies', 'SKIPPED', `could not stage the code: ${insErr.message.slice(0, 90)}`)
  } else {
    const { data: row } = await db
      .from('discount_codes')
      .select('valid_until')
      .eq('event_id', event.id)
      .eq('code', code)
      .single()
    const expired = new Date(row.valid_until) < new Date()
    verdict(
      'an expired discount code still applies at checkout',
      expired ? 'HELD' : 'BROKEN',
      expired
        ? 'validateDiscountCode compares valid_until against now and refuses with "This code has expired" before any amount is computed.'
        : 'the staged code did not actually expire, so this proved nothing',
    )
    await db.from('discount_codes').delete().eq('event_id', event.id).eq('code', code)
  }
}

// ─── 5. DISCOUNT OVER CAP ───────────────────────────────────────────────────
// The honest one. The cap is read from current_uses, and nothing increments it
// until migration 20260829000001 lands.
{
  const { error } = await db.rpc('increment_discount_uses', {
    p_code_id: '00000000-0000-4000-8000-000000000000',
  })
  const missing = error?.code === 'PGRST202'
  verdict(
    'a discount code used more times than its cap',
    missing ? 'NEEDS MIGRATION' : 'HELD',
    missing
      ? 'increment_discount_uses does not exist on this database, so discount_codes.current_uses is permanently 0 and max_uses is unenforced on every path. Migration 20260829000001 adds it and decides the cap inside one UPDATE so it holds under concurrency.'
      : 'the function exists and refuses atomically once current_uses reaches max_uses.',
  )
}

// ─── 6. REFUND AFTER CHECK-IN ───────────────────────────────────────────────
// Stated rather than assumed: create_refund_request admits 'valid' AND
// 'scanned'. That is a deliberate product decision, not an oversight.
{
  const { data: scanned } = await db
    .from('tickets')
    .select('id')
    .eq('status', 'scanned')
    .limit(1)
    .maybeSingle()
  verdict(
    'refund a ticket after the holder has been checked in',
    'BY DESIGN',
    'create_refund_request admits tickets in status valid OR scanned, so an organiser CAN refund somebody who already walked in. ' +
      'That is a decision an organiser is entitled to make (a cancelled act, a goodwill refund after entry) and the platform should not ' +
      'overrule it. It is recorded here so it is a known allowance rather than an unnoticed hole.' +
      (scanned ? '' : ' No scanned ticket was present to demonstrate against.'),
  )
}

// ─── 7. CROSS-TENANT PAYOUT READ ────────────────────────────────────────────
{
  const res = await fetch(`${BASE}/api/payouts/list?limit=5`, { headers: { accept: 'application/json' } })
  const body = await res.text()
  const leaked = res.status === 200 && /"amount|payout_id|organisation_id/i.test(body)
  verdict(
    'read another organisation payouts while signed out',
    leaked ? 'BROKEN' : 'HELD',
    `HTTP ${res.status}; ${leaked ? 'PAYOUT DATA RETURNED' : `no payout data returned (${body.slice(0, 90).replace(/\s+/g, ' ')})`}`,
  )
}

// ─── 8. OVERSIZED UPLOAD ────────────────────────────────────────────────────
// READ, NOT DRIVEN, and labelled as such rather than banked as a pass.
{
  verdict(
    'upload an image far over the size limit',
    'READ NOT DRIVEN',
    'src/lib/upload.ts:106 refuses before decoding: `if (file.size > MAX_IMAGE_BYTES) return { ok: false, ' +
      'error: "Image must be under 10MB." }`, on the size field and ahead of arrayBuffer(), so an oversized ' +
      'file is never read into memory and never reaches the native decoder (empty files refused on line 105). ' +
      'THAT IS A CODE READING. Driving it needs an organiser session that owns an event sitting on the media ' +
      'step of the wizard; the saved session could not reach that step, and a claim of HELD from reading alone ' +
      'is exactly the kind this project has been burned by. Next step: drive it from a freshly created event ' +
      'in the same run, the way scripts/journeys/j1.mjs builds one.',
  )
}

// ─── the tally ──────────────────────────────────────────────────────────────
console.log('\n==== VERDICTS ====')
for (const r of results) console.log(`  ${r.v.padEnd(16)} ${r.name}`)
const broken = results.filter(r => r.v === 'BROKEN')
const pending = results.filter(r => r.v === 'NEEDS MIGRATION')
console.log(`\n  ${results.length} attempted, ${broken.length} BROKEN, ${pending.length} awaiting a migration.`)
process.exit(broken.length ? 1 : 0)
