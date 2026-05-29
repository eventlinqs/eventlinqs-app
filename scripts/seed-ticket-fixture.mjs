// Seed (and clean) a throwaway ticket fixture for the Playwright tickets
// spine spec. Writes tests/e2e/.ticket-fixture.json with the bearer code +
// secret, the buyer login, and ids for cleanup.
//
//   node --env-file=.env.local scripts/seed-ticket-fixture.mjs         # seed
//   node --env-file=.env.local scripts/seed-ticket-fixture.mjs clean   # remove
//
// Writes DATA only (no schema change, no migration). Self-cleaning.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(here, '..', 'tests', 'e2e', '.ticket-fixture.json')

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SB_URL || !SERVICE) {
  console.error('Missing env. Run: node --env-file=.env.local scripts/seed-ticket-fixture.mjs')
  process.exit(1)
}
const svc = createClient(SB_URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

const EMAIL = 'ticket-fixture@eventlinqs.test'
const PASSWORD = 'TicketFixture2026!Secure'
const ORDER_NUMBER = 'EL-FIXTURE01'

async function findUser(email) {
  const { data } = await svc.auth.admin.listUsers()
  return data?.users?.find((u) => u.email?.toLowerCase() === email) ?? null
}

async function clean() {
  await svc.from('orders').delete().eq('order_number', ORDER_NUMBER)
  const u = await findUser(EMAIL)
  if (u) await svc.auth.admin.deleteUser(u.id)
  if (existsSync(FIXTURE)) rmSync(FIXTURE)
  console.log('[fixture] cleaned')
}

async function seed() {
  await clean() // idempotent fresh start
  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: 'Ticket Fixture' },
  })
  if (cErr) throw cErr
  const userId = created.user.id
  await svc.from('profiles').upsert({ id: userId, email: EMAIL, full_name: 'Ticket Fixture' }, { onConflict: 'id' })

  // Pick a published, PAID event (a tier with price > 0) plus its organiser
  // Stripe state, so the spec can also assert the not-on-sale gate.
  const { data: ev, error: eErr } = await svc
    .from('events')
    .select('id, slug, organisation_id, ticket_tiers!inner(id, price), organisation:organisations(stripe_account_id, stripe_charges_enabled)')
    .eq('status', 'published')
    .gt('ticket_tiers.price', 0)
    .limit(1)
    .maybeSingle()
  if (eErr || !ev || !ev.ticket_tiers?.length) throw new Error(`no published paid event: ${eErr?.message}`)
  const tier = ev.ticket_tiers[0]
  const org = ev.organisation
  const notOnSale = !(org?.stripe_account_id && org?.stripe_charges_enabled === true)

  const { data: order, error: oErr } = await svc.from('orders').insert({
    user_id: userId, event_id: ev.id, organisation_id: ev.organisation_id,
    order_number: ORDER_NUMBER, status: 'confirmed', currency: 'AUD',
    subtotal_cents: 4500, total_cents: 4500, confirmed_at: new Date().toISOString(),
  }).select('id').single()
  if (oErr) throw new Error(`order: ${oErr.message}`)

  const { error: oiErr } = await svc.from('order_items').insert({
    order_id: order.id, ticket_tier_id: tier.id, item_type: 'ticket',
    item_name: 'General Admission (fixture)', quantity: 1,
    unit_price_cents: 4500, total_cents: 4500,
    attendee_email: EMAIL, attendee_first_name: 'Ticket', attendee_last_name: 'Fixture',
  })
  if (oiErr) throw new Error(`order_item: ${oiErr.message}`)

  const { error: issErr } = await svc.rpc('issue_tickets_for_order', { p_order_id: order.id })
  if (issErr) throw new Error(`issue: ${issErr.message}`)

  const { data: ticket, error: kErr } = await svc
    .from('tickets').select('ticket_code, secret').eq('order_id', order.id).single()
  if (kErr || !ticket) throw new Error(`ticket read: ${kErr?.message}`)

  const fixture = {
    email: EMAIL, password: PASSWORD, orderNumber: ORDER_NUMBER,
    code: ticket.ticket_code, secret: ticket.secret, userId, orderId: order.id,
    // For the not-on-sale gate assertion: a published paid event and whether
    // its organiser is currently unable to sell (no connected/charges account).
    eventSlug: ev.slug, notOnSale,
  }
  writeFileSync(FIXTURE, JSON.stringify(fixture, null, 2))
  console.log(`[fixture] seeded ticket ${ticket.ticket_code} for ${EMAIL}`)
  console.log(`[fixture] written to ${FIXTURE}`)
}

const mode = process.argv[2]
;(mode === 'clean' ? clean() : seed())
  .then(() => process.exit(0))
  .catch((e) => { console.error('[fixture] error:', e.message ?? e); process.exit(1) })

// keep import for clean-mode readback symmetry / future use
void readFileSync
