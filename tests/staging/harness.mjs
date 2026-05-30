// Shared staging harness for the door check-in scanner proofs.
//
// SAFETY: refuses to run against the production project ref. Creates a throwaway
// org/event/tier/order/tickets and auth users, mints the ticket via the REAL
// purchase path (a confirmed order fires issue_tickets_for_order), and tears
// everything down. Staging only. Never live.

import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'gndnldyfudbytbboxesk'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY

export function assertNotProd() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    throw new Error(
      'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY to a STAGING project.',
    )
  }
  if (SUPABASE_URL.includes(PROD_REF)) {
    throw new Error(
      `Refusing to run: SUPABASE_URL points at the production ref ${PROD_REF}. Staging only.`,
    )
  }
}

export function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** An authenticated client whose auth.uid() is the given signed-in user. */
export async function authedClientFor(email, password) {
  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  return client
}

const PW = 'Staging-Test-Pw-123!'

/**
 * Builds a complete scannable scenario and returns ids plus the minted ticket.
 * `staffRole` is the organisation_members role for the authorised scanner
 * ('manager' by default); pass null to create a user with NO role (the
 * unauthorised case).
 */
export async function setupScenario({ staffRole = 'manager' } = {}) {
  assertNotProd()
  const db = admin()
  const created = { userIds: [], orgId: null, eventIds: [], orderIds: [] }

  // Owner + staff auth users.
  const stamp = Date.now()
  const ownerEmail = `owner+${stamp}@staging.eventlinqs.test`
  const staffEmail = `staff+${stamp}@staging.eventlinqs.test`

  const { data: ownerUser, error: ownerErr } = await db.auth.admin.createUser({
    email: ownerEmail,
    password: PW,
    email_confirm: true,
  })
  if (ownerErr) throw new Error(`create owner failed: ${ownerErr.message}`)
  created.userIds.push(ownerUser.user.id)

  const { data: staffUser, error: staffErr } = await db.auth.admin.createUser({
    email: staffEmail,
    password: PW,
    email_confirm: true,
  })
  if (staffErr) throw new Error(`create staff failed: ${staffErr.message}`)
  created.userIds.push(staffUser.user.id)

  // organisations.owner_id and events.created_by reference profiles(id). Ensure a
  // profile row exists for each auth user (id = auth user id). Upsert so this is
  // a no-op if a signup trigger already created the profile on staging.
  const ensureProfile = async (user, email) => {
    const { error } = await db
      .from('profiles')
      .upsert({ id: user.id, email }, { onConflict: 'id' })
    if (error) throw new Error(`ensure profile failed for ${email}: ${error.message}`)
  }
  await ensureProfile(ownerUser.user, ownerEmail)
  await ensureProfile(staffUser.user, staffEmail)

  // Org owned by the owner user.
  const { data: org, error: orgErr } = await db
    .from('organisations')
    .insert({ name: `Staging Co ${stamp}`, slug: `staging-co-${stamp}`, owner_id: ownerUser.user.id })
    .select('id')
    .single()
  if (orgErr) throw new Error(`create org failed: ${orgErr.message}`)
  created.orgId = org.id

  // Staff membership (or none, for the unauthorised case).
  if (staffRole) {
    const { error: memErr } = await db.from('organisation_members').insert({
      organisation_id: org.id,
      user_id: staffUser.user.id,
      role: staffRole,
    })
    if (memErr) throw new Error(`create membership failed: ${memErr.message}`)
  }

  // Primary event + a second event (for the wrong-event case).
  const mkEvent = async (title) => {
    const { data, error } = await db
      .from('events')
      .insert({
        organisation_id: org.id,
        created_by: ownerUser.user.id,
        title,
        slug: `staging-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}`,
        start_date: new Date(Date.now() + 7 * 864e5).toISOString(),
        end_date: new Date(Date.now() + 7 * 864e5 + 3 * 36e5).toISOString(),
        timezone: 'Australia/Melbourne',
        status: 'published',
        visibility: 'public',
        event_type: 'in_person',
      })
      .select('id')
      .single()
    if (error) throw new Error(`create event failed: ${error.message}`)
    created.eventIds.push(data.id)
    return data.id
  }
  const eventId = await mkEvent('Scanner Proof')
  const otherEventId = await mkEvent('Other Event')

  // Mint a real ticket via the purchase path: tier -> order(pending) -> items ->
  // update order to confirmed, which fires issue_tickets_for_order.
  const mintTicket = async (eId) => {
    const { data: tier, error: tierErr } = await db
      .from('ticket_tiers')
      .insert({ event_id: eId, name: 'General Admission', price: 1000, total_capacity: 100 })
      .select('id')
      .single()
    if (tierErr) throw new Error(`create tier failed: ${tierErr.message}`)

    const { data: order, error: orderErr } = await db
      .from('orders')
      .insert({
        order_number: `EL-STG-${stamp}-${created.orderIds.length}`,
        event_id: eId,
        organisation_id: org.id,
        user_id: ownerUser.user.id,
        guest_email: ownerEmail,
        status: 'pending',
        subtotal_cents: 1000,
        platform_fee_cents: 0,
        processing_fee_cents: 0,
        total_cents: 1000,
      })
      .select('id')
      .single()
    if (orderErr) throw new Error(`create order failed: ${orderErr.message}`)
    created.orderIds.push(order.id)

    const { error: itemErr } = await db.from('order_items').insert({
      order_id: order.id,
      ticket_tier_id: tier.id,
      item_type: 'ticket',
      item_name: 'General Admission',
      quantity: 1,
      unit_price_cents: 1000,
      total_cents: 1000,
    })
    if (itemErr) throw new Error(`create order_item failed: ${itemErr.message}`)

    // Fire issuance exactly as a paid purchase does.
    const { error: confErr } = await db
      .from('orders')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', order.id)
    if (confErr) throw new Error(`confirm order failed: ${confErr.message}`)

    const { data: ticket, error: tErr } = await db
      .from('tickets')
      .select('id, ticket_code, secret, status, event_id')
      .eq('order_id', order.id)
      .single()
    if (tErr) throw new Error(`ticket not minted: ${tErr.message}`)
    return ticket
  }

  const ticket = await mintTicket(eventId)
  const otherEventTicket = await mintTicket(otherEventId)

  return {
    db,
    created,
    eventId,
    otherEventId,
    ticket,
    otherEventTicket,
    ownerEmail,
    staffEmail,
    password: PW,
  }
}

export async function teardown(scenario) {
  const db = scenario.db ?? admin()
  // Orders cascade to order_items and tickets; events cascade to tiers; tickets
  // cascade to ticket_scans. Delete orders, events, org, then auth users.
  for (const id of scenario.created.orderIds) {
    await db.from('orders').delete().eq('id', id)
  }
  for (const id of scenario.created.eventIds) {
    await db.from('events').delete().eq('id', id)
  }
  if (scenario.created.orgId) {
    await db.from('organisations').delete().eq('id', scenario.created.orgId)
  }
  for (const id of scenario.created.userIds) {
    await db.auth.admin.deleteUser(id).catch(() => {})
  }
}

/** Tiny assertion helper. Throws on failure with a clear message. */
export function check(label, cond) {
  if (cond) {
    console.log(`  PASS: ${label}`)
  } else {
    throw new Error(`FAIL: ${label}`)
  }
}
