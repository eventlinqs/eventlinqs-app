// Seed a single FREE published event (organiser + profile + category + event +
// tier) into a NON-PROD Supabase, for the self-contained purchase E2E. The free
// path needs no Stripe: processCheckout writes the order confirmed and the DB
// trigger issues the ticket synchronously, so the whole journey runs against a
// local stack with no live keys and no live DB.
//
// Refuses the production ref. Idempotent (fixed ids). Prints the seeded slug.
//
// Env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'gndnldyfudbytbboxesk'
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('[seed:purchase] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (url.includes(PROD_REF)) { console.error(`[seed:purchase] refusing to seed PRODUCTION (${PROD_REF})`); process.exit(1) }

const s = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const log = (...a) => console.log('[seed:purchase]', ...a)
const die = msg => { console.error('[seed:purchase] FAIL:', msg); process.exit(1) }

const ORG_ID = '00000000-0000-4000-8001-000000000001'
const FREE_EVENT_ID = '00000000-0000-4000-8002-000000000001'
const FREE_TIER_ID = '00000000-0000-4000-8003-000000000001'
const FREE_SLUG = 'e2e-free-event'
const ORGANISER_EMAIL = 'e2e-organiser@eventlinqs.test'

// 1. Organiser owner (auth user + profile).
let ownerId
const created = await s.auth.admin.createUser({ email: ORGANISER_EMAIL, password: 'E2e-Organiser-Pass-1!', email_confirm: true })
if (created.error && !/already|exists|registered/i.test(created.error.message)) die(`create owner: ${created.error.message}`)
ownerId = created.data?.user?.id
if (!ownerId) {
  const { data: list } = await s.auth.admin.listUsers()
  ownerId = list?.users?.find(u => u.email === ORGANISER_EMAIL)?.id
}
if (!ownerId) die('could not resolve organiser owner id')

const { data: prof } = await s.from('profiles').select('id').eq('id', ownerId).maybeSingle()
if (!prof) {
  const { error } = await s.from('profiles').insert({
    id: ownerId, email: ORGANISER_EMAIL, full_name: 'E2E Organiser', display_name: 'E2E Organiser', is_verified: true,
  })
  if (error) die(`profile: ${error.message}`)
}
log('owner', ownerId)

// 2. Category (reuse any, else create one).
let categoryId
const { data: cat } = await s.from('event_categories').select('id').limit(1).maybeSingle()
if (cat) categoryId = cat.id
else {
  const { data: ins, error } = await s.from('event_categories').insert({ name: 'Music', slug: 'music' }).select('id').maybeSingle()
  if (error) die(`category: ${error.message}`)
  categoryId = ins.id
}

// 3. Organisation (active, sellable).
const { data: org } = await s.from('organisations').select('id').eq('id', ORG_ID).maybeSingle()
if (!org) {
  const { error } = await s.from('organisations').insert({
    id: ORG_ID, name: 'E2E Test Organiser', slug: 'e2e-test-organiser', owner_id: ownerId,
    status: 'active', payout_status: 'active', stripe_charges_enabled: true,
    stripe_account_id: process.env.E2E_STRIPE_ACCOUNT_ID ?? null, email: ORGANISER_EMAIL,
  })
  if (error) die(`organisation: ${error.message}`)
}

// 4. Free event + free tier (columns mirror scripts/seed-events-catalogue.mjs).
const startDate = new Date(Date.now() + 14 * 24 * 3600 * 1000)
const endDate = new Date(startDate.getTime() + 3 * 3600 * 1000)
const { data: existing } = await s.from('events').select('id').eq('id', FREE_EVENT_ID).maybeSingle()
if (!existing) {
  const { error: evErr } = await s.from('events').insert({
    id: FREE_EVENT_ID, title: 'E2E Free Event', slug: FREE_SLUG,
    description: 'A free event used by the purchase E2E.', summary: 'Free E2E event',
    organisation_id: ORG_ID, created_by: ownerId, category_id: categoryId,
    start_date: startDate.toISOString(), end_date: endDate.toISOString(), timezone: 'Australia/Sydney',
    event_type: 'in_person', venue_name: 'Test Venue', venue_address: '1 Test St',
    venue_city: 'Sydney', venue_state: 'NSW', venue_country: 'Australia',
    cover_image_url: null, thumbnail_url: null,
    status: 'published', visibility: 'public', published_at: new Date().toISOString(),
    is_age_restricted: false, max_capacity: 100,
    tags: ['e2e'], fee_pass_type: 'pass_to_buyer', is_free: true,
  })
  if (evErr) die(`event: ${evErr.message}`)
  const { error: tErr } = await s.from('ticket_tiers').insert({
    id: FREE_TIER_ID, event_id: FREE_EVENT_ID, name: 'Free GA', description: 'Free general admission',
    tier_type: 'general_admission', price: 0, currency: 'AUD',
    total_capacity: 100, sold_count: 0, reserved_count: 0,
    min_per_order: 1, max_per_order: 10, sort_order: 0, is_visible: true, is_active: true,
    dynamic_pricing_enabled: false, requires_access_code: false,
  })
  if (tErr) die(`tier: ${tErr.message}`)
}

log(`seeded free event slug=${FREE_SLUG}`)
console.log(`CERT_FREE_EVENT_SLUG=${FREE_SLUG}`)
