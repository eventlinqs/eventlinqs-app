// Load-test seed: the designated flash-sale "drop" event for the staging rig.
//
// docs/SCALE-AND-LOAD-TEST-PLAN.md section 4.4 needs ONE event with a
// deliberately constrained hot tier so the spike/drop test has real
// contention and a real sell-out. The rest of the catalogue already exists on
// staging because the seed migrations run during `supabase db push`; this
// script only adds the drop event and its tiers.
//
// It writes DATA only (no schema), through the service-role REST client, so it
// needs no psql and no direct Postgres connection. It is idempotent: re-running
// it is a no-op once the event exists.
//
// SAFETY: this script hard-refuses to run against the production Supabase ref.
// Point STAGING_SUPABASE_URL / STAGING_SUPABASE_SERVICE_ROLE_KEY at the STAGING
// project only (see .env.staging.example).
//
// Usage (from the repo root, with .env.staging loaded into the environment):
//   node scripts/staging-seed.mjs
//
// On Windows PowerShell, load the env file first or pass the two vars inline:
//   $env:STAGING_SUPABASE_URL="https://<staging-ref>.supabase.co"; `
//   $env:STAGING_SUPABASE_SERVICE_ROLE_KEY="<staging-service-role-key>"; `
//   node scripts/staging-seed.mjs

import { createClient } from '@supabase/supabase-js'

const PROD_REF = 'gndnldyfudbytbboxesk' // production Supabase project ref - never seed this
const EVENT_ID = 'dd000000-0000-4000-8000-000000000001'
const EVENT_SLUG = 'loadtest-national-flash-drop'
const COVER =
  'https://images.pexels.com/photos/1190298/pexels-photo-1190298.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200'
const THUMB =
  'https://images.pexels.com/photos/1190298/pexels-photo-1190298.jpeg?auto=compress&cs=tinysrgb&h=450&w=600'

// Three tiers. "Early Bird (HOT)" is the contention target: a small capacity
// the spike test will oversubscribe by a large multiple to prove zero oversell.
const TIERS = [
  { id: 'dd000000-0000-4000-8000-000000000002', name: 'Early Bird (HOT)', price: 4500, total_capacity: 1000, sort_order: 0 },
  { id: 'dd000000-0000-4000-8000-000000000003', name: 'General Admission', price: 6500, total_capacity: 5000, sort_order: 1 },
  { id: 'dd000000-0000-4000-8000-000000000004', name: 'VIP', price: 18500, total_capacity: 200, sort_order: 2 },
]

const url = process.env.STAGING_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function die(msg) {
  console.error(`\n[staging-seed] ABORT: ${msg}\n`)
  process.exit(1)
}

if (!url || !key) die('set STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY (see .env.staging.example).')
if (url.includes(PROD_REF)) die(`refusing to run against the PRODUCTION project (${PROD_REF}). Point at staging only.`)

const s = createClient(url, key, { auth: { persistSession: false } })

async function firstId(table, sel, order) {
  let q = s.from(table).select(sel).limit(1)
  if (order) q = q.order(order, { ascending: true })
  const { data, error } = await q
  if (error) die(`reading ${table}: ${error.message}`)
  return data?.[0] ?? null
}

async function main() {
  console.log(`[staging-seed] target ${url}`)

  // Skip cleanly if the drop event already exists.
  const { data: existing } = await s.from('events').select('id,slug').eq('slug', EVENT_SLUG).maybeSingle()
  if (existing) {
    console.log(`[staging-seed] drop event already present (${existing.id}); nothing to do.`)
    return
  }

  // Attach to real seeded rows so the FKs and RLS-bypass writes are valid.
  const org = await firstId('organisations', 'id,slug', 'created_at')
  const profile = await firstId('profiles', 'id,role', 'created_at')
  if (!org) die('no organisations found - did `supabase db push` (with seed migrations) run against staging first?')
  if (!profile) die('no profiles found - run migrations/seed against staging first.')
  const music = (await s.from('event_categories').select('id,slug').eq('slug', 'music').maybeSingle()).data
  const category = music ?? (await firstId('event_categories', 'id,slug'))

  const start = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days out
  const end = new Date(start.getTime() + 4 * 60 * 60 * 1000)

  const event = {
    id: EVENT_ID,
    title: 'LOADTEST National Flash Drop',
    slug: EVENT_SLUG,
    description:
      'Synthetic high-demand on-sale used only by the staging load-test rig. The Early Bird tier is deliberately small so the spike/drop scenario can oversubscribe it and prove zero oversell. Not a real event.',
    summary: 'Staging load-test drop event | constrained hot tier | not real',
    organisation_id: org.id,
    created_by: profile.id,
    category_id: category?.id ?? null,
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    timezone: 'Australia/Sydney',
    event_type: 'in_person',
    venue_name: 'Load Test Arena',
    venue_address: 'Olympic Boulevard, Sydney Olympic Park',
    venue_city: 'Sydney',
    venue_state: 'NSW',
    venue_country: 'Australia',
    cover_image_url: COVER,
    thumbnail_url: THUMB,
    status: 'published',
    visibility: 'public',
    published_at: new Date().toISOString(),
    is_age_restricted: false,
    max_capacity: 6200,
    tags: ['loadtest', 'staging', 'drop'],
    fee_pass_type: 'pass_to_buyer',
    is_high_demand: true, // engages the virtual queue for this event
    waitlist_enabled: true,
    has_reserved_seating: false,
    squad_booking_enabled: false,
    is_free: false,
  }

  const { error: evErr } = await s.from('events').insert(event)
  if (evErr) die(`inserting drop event: ${evErr.message}`)
  console.log(`[staging-seed] inserted drop event ${EVENT_ID} (is_high_demand=true)`)

  const tierRows = TIERS.map(t => ({
    id: t.id,
    event_id: EVENT_ID,
    name: t.name,
    description: `${t.name} - staging load-test tier`,
    tier_type: 'general_admission',
    price: t.price,
    currency: 'AUD',
    total_capacity: t.total_capacity,
    sold_count: 0,
    reserved_count: 0,
    min_per_order: 1,
    max_per_order: 10,
    sort_order: t.sort_order,
    is_visible: true,
    is_active: true,
    dynamic_pricing_enabled: false,
    requires_access_code: false,
  }))

  const { error: tErr } = await s.from('ticket_tiers').insert(tierRows)
  if (tErr) die(`inserting tiers: ${tErr.message}`)
  console.log(`[staging-seed] inserted ${tierRows.length} tiers (hot tier "Early Bird (HOT)" = 1000 capacity)`)

  console.log(`\n[staging-seed] done. Drop event live at /events/${EVENT_SLUG} on staging.`)
}

main().catch(e => die(e.message))
