// Tickets RLS behavioural proof (option-2 verification).
//
// Proves, against the LIVE deployed schema + RLS policies, that a buyer can
// read only their own tickets:
//   - seeds ONE ticket owned by user A (via service role + the real
//     issue_tickets_for_order function)
//   - signs in as A through the anon (RLS-bound) client: A must see it
//     signs in as B through the anon client: B must NOT see it
//   - deletes everything it created (order cascade + both throwaway users)
//
// Self-cleaning and idempotent. Writes only DATA (no schema change, no
// migration, no db push). Run:
//   node --env-file=.env.local scripts/verify-tickets-rls.mjs
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !ANON || !SERVICE) {
  console.error('Missing env. Run: node --env-file=.env.local scripts/verify-tickets-rls.mjs')
  process.exit(1)
}

console.log(`[rls] target: ${URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`)

const svc = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const A_EMAIL = 'rls-verify-a@eventlinqs.test'
const B_EMAIL = 'rls-verify-b@eventlinqs.test'
const PW = 'RlsVerify2026!Secure'
const ORDER_NUMBER = 'EL-RLSVERIFY1'

let aId = null
let bId = null
let orderId = null
let pass = true
const log = (m) => console.log(`[rls] ${m}`)
const fail = (m) => { pass = false; console.error(`[rls] FAIL: ${m}`) }

async function ensureUser(email) {
  // delete any pre-existing throwaway with this email first (idempotent)
  const { data: list } = await svc.auth.admin.listUsers()
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === email)
  if (existing) await svc.auth.admin.deleteUser(existing.id)
  const { data, error } = await svc.auth.admin.createUser({
    email, password: PW, email_confirm: true, user_metadata: { full_name: 'RLS Verify' },
  })
  if (error) throw error
  const id = data.user.id
  // ensure a profiles row exists (orders.user_id -> profiles.id)
  await svc.from('profiles').upsert({ id, email }, { onConflict: 'id' })
  return id
}

async function anonSelectTicketCountForOrder(email) {
  const c = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error: signInErr } = await c.auth.signInWithPassword({ email, password: PW })
  if (signInErr) throw new Error(`signIn ${email}: ${signInErr.message}`)
  const { data, error } = await c.from('tickets').select('id').eq('order_id', orderId)
  if (error) throw new Error(`select tickets as ${email}: ${error.message}`)
  await c.auth.signOut()
  return data?.length ?? 0
}

async function main() {
  // 0. clean any leftover order from a prior run
  await svc.from('orders').delete().eq('order_number', ORDER_NUMBER)

  // 1. users
  aId = await ensureUser(A_EMAIL)
  bId = await ensureUser(B_EMAIL)
  log(`user A ${aId}, user B ${bId}`)

  // 2. an existing tier + its event to attach to (item_type='ticket'
  // requires a non-null ticket_tier_id per order_items_type_check)
  const { data: tier, error: tierErr } = await svc
    .from('ticket_tiers')
    .select('id, event_id')
    .limit(1)
    .maybeSingle()
  if (tierErr || !tier) throw new Error(`no ticket tier to attach: ${tierErr?.message}`)
  const { data: ev, error: evErr } = await svc
    .from('events')
    .select('id, organisation_id')
    .eq('id', tier.event_id)
    .single()
  if (evErr || !ev) throw new Error(`event for tier not found: ${evErr?.message}`)

  // 3. order owned by A + ticket order_item
  const { data: order, error: oErr } = await svc
    .from('orders')
    .insert({
      user_id: aId,
      event_id: ev.id,
      organisation_id: ev.organisation_id,
      order_number: ORDER_NUMBER,
      status: 'confirmed',
      currency: 'AUD',
      subtotal_cents: 1000,
      total_cents: 1000,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (oErr) throw new Error(`order insert: ${oErr.message}`)
  orderId = order.id

  const { error: oiErr } = await svc.from('order_items').insert({
    order_id: orderId,
    ticket_tier_id: tier.id,
    item_type: 'ticket',
    item_name: 'RLS verify ticket',
    quantity: 1,
    unit_price_cents: 1000,
    total_cents: 1000,
    attendee_email: 'rls-holder@eventlinqs.test',
    attendee_first_name: 'Rls',
    attendee_last_name: 'Verify',
  })
  if (oiErr) throw new Error(`order_item insert: ${oiErr.message}`)

  // 4. issue via the real function
  const { data: issued, error: issErr } = await svc.rpc('issue_tickets_for_order', { p_order_id: orderId })
  if (issErr) throw new Error(`issue_tickets_for_order: ${issErr.message}`)
  log(`issue_tickets_for_order returned ${issued}`)

  const { data: svcTickets } = await svc.from('tickets').select('id, ticket_code, status').eq('order_id', orderId)
  log(`service-role sees ${svcTickets?.length ?? 0} ticket(s) for the seeded order (expect 1)`)
  if ((svcTickets?.length ?? 0) !== 1) fail('seeding did not produce exactly one ticket')

  // 5. RLS behaviour
  const aCount = await anonSelectTicketCountForOrder(A_EMAIL)
  const bCount = await anonSelectTicketCountForOrder(B_EMAIL)
  log(`buyer A sees ${aCount} ticket(s) for own order (expect 1)`)
  log(`buyer B sees ${bCount} ticket(s) for A's order (expect 0)`)
  if (aCount !== 1) fail('owner A could not see their own ticket under RLS')
  if (bCount !== 0) fail('buyer B could see another buyer’s ticket under RLS')
}

async function cleanup() {
  try { if (orderId) await svc.from('orders').delete().eq('id', orderId) } catch (e) { console.error('[rls] cleanup order:', e.message) }
  try { if (aId) await svc.auth.admin.deleteUser(aId) } catch (e) { console.error('[rls] cleanup A:', e.message) }
  try { if (bId) await svc.auth.admin.deleteUser(bId) } catch (e) { console.error('[rls] cleanup B:', e.message) }
  log('cleanup done (seeded order + throwaway users removed)')
}

main()
  .catch((e) => { fail(e.message ?? String(e)) })
  .finally(async () => {
    await cleanup()
    console.log(pass ? '[rls] RESULT: PASS' : '[rls] RESULT: FAIL')
    process.exit(pass ? 0 : 1)
  })
