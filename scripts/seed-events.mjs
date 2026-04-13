/**
 * One-shot seed script: 8 culturally-relevant sample events + ticket tiers
 * Run: node scripts/seed-events.mjs
 * Uses service role key — bypasses RLS. Delete this file after seeding.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local manually
const envPath = resolve(__dirname, '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => l.split('=').map(s => s.trim()))
    .map(([k, ...v]) => [k, v.join('=')])
)

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Get org + user from DB
const { data: org } = await supabase.from('organisations').select('id').limit(1).single()
const { data: profile } = await supabase.from('profiles').select('id').limit(1).single()

if (!org || !profile) {
  console.error('No organisation or profile found. Cannot seed.')
  process.exit(1)
}

const ORG_ID = org.id
const USER_ID = profile.id

// Category IDs (from event_categories seed)
const CAT = {
  music:    'b62551e2-4010-45fa-be8c-f9353ba0f39d',
  nightlife:'2443fb27-a02c-412c-b05c-06d1a8e070a6',
  religion: '310ec098-563e-46cb-97d2-fea1eb048bb7',
  arts:     '0fcd5166-fcba-4df3-95f8-26fa0e8ff1bc',
  business: '8234412f-2a88-42d2-a9d2-406425f67ad9',
  community:'db15a8f5-6aa2-40b7-b018-3d1087e3eb73',
}

const events = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    title: 'Afrobeats Melbourne Summer Sessions',
    slug: 'afrobeats-melbourne-summer-sessions-2026',
    description: 'The biggest Afrobeats event of the Melbourne summer. Three stages, international DJs, Nigerian street food, and a crowd that knows every word.',
    summary: 'Live Afrobeats, 3 stages, street food — Melbourne Showgrounds',
    category_id: CAT.music,
    start_date: '2026-04-26T08:00:00Z', // 18:00 AEST
    end_date:   '2026-04-26T16:00:00Z', // 02:00 AEST next day
    timezone: 'Australia/Melbourne',
    venue_name: 'Melbourne Showgrounds', venue_city: 'Melbourne', venue_state: 'VIC', venue_country: 'Australia',
    cover_image_url: 'https://picsum.photos/seed/afrobeats1/1200/900',
    thumbnail_url:   'https://picsum.photos/seed/afrobeats1/600/450',
    max_capacity: 1500,
    tags: ['afrobeats','music','culture','african'],
    price_cents: 6500, tier_name: 'General Admission', tier_capacity: 1200,
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    title: 'Afrobeats All Night — London',
    slug: 'afrobeats-all-night-london-2026',
    description: "London's premier monthly Afrobeats session returns for a special extended night. The freshest Afrobeats, Afropop, and Alte sounds from a world-class DJ lineup.",
    summary: "London's top Afrobeats night — extended session, world-class DJs",
    category_id: CAT.music,
    start_date: '2026-05-02T20:00:00Z', // 21:00 BST
    end_date:   '2026-05-03T03:00:00Z', // 04:00 BST
    timezone: 'Europe/London',
    venue_name: 'Fabric London', venue_city: 'London', venue_state: 'England', venue_country: 'United Kingdom',
    cover_image_url: 'https://picsum.photos/seed/afrobeats2/1200/900',
    thumbnail_url:   'https://picsum.photos/seed/afrobeats2/600/450',
    max_capacity: 2000,
    tags: ['afrobeats','afropop','alte','music','london'],
    price_cents: 7500, tier_name: 'General Admission', tier_capacity: 1800,
  },
  {
    id: '11111111-1111-4111-8111-111111111103',
    title: 'Amapiano Takeover — Sydney',
    slug: 'amapiano-takeover-sydney-2026',
    description: "Sydney's wildest Amapiano party is back. Log drums, wailing piano, and a dancefloor that never stops. This is the sound of South Africa in the heart of the city.",
    summary: "Sydney's biggest Amapiano night — log drums, wailing piano, all night",
    category_id: CAT.nightlife,
    start_date: '2026-05-03T10:00:00Z', // 20:00 AEST
    end_date:   '2026-05-03T17:00:00Z', // 03:00 AEST next day
    timezone: 'Australia/Sydney',
    venue_name: 'The Metro Theatre', venue_city: 'Sydney', venue_state: 'NSW', venue_country: 'Australia',
    cover_image_url: 'https://picsum.photos/seed/amapiano/1200/900',
    thumbnail_url:   'https://picsum.photos/seed/amapiano/600/450',
    max_capacity: 800,
    tags: ['amapiano','south-african','nightlife','music'],
    price_cents: 5500, tier_name: 'General Admission', tier_capacity: 700,
  },
  {
    id: '11111111-1111-4111-8111-111111111104',
    title: 'Highlife Heritage Night — Brisbane',
    slug: 'highlife-heritage-night-brisbane-2026',
    description: 'A celebration of West African Highlife music across the decades. Live band, traditional attire welcome, authentic Ghanaian and Nigerian cuisine.',
    summary: 'Live Highlife band, traditional attire, West African cuisine — Brisbane',
    category_id: CAT.music,
    start_date: '2026-05-10T07:00:00Z', // 17:00 AEST
    end_date:   '2026-05-10T13:00:00Z', // 23:00 AEST
    timezone: 'Australia/Brisbane',
    venue_name: 'Brisbane City Hall', venue_city: 'Brisbane', venue_state: 'QLD', venue_country: 'Australia',
    cover_image_url: 'https://picsum.photos/seed/highlife/1200/900',
    thumbnail_url:   'https://picsum.photos/seed/highlife/600/450',
    max_capacity: 400,
    tags: ['highlife','west-african','live-band','ghanaian','nigerian'],
    price_cents: 4500, tier_name: 'General Admission', tier_capacity: 350,
  },
  {
    id: '11111111-1111-4111-8111-111111111105',
    title: 'Gospel on the Hills — Melbourne',
    slug: 'gospel-on-the-hills-melbourne-2026',
    description: "An uplifting evening of Gospel music bringing together choirs and soloists from across Melbourne's African and Pacific Islander communities. Family-friendly.",
    summary: 'Gospel night — choirs, soloists, African community, all welcome',
    category_id: CAT.religion,
    start_date: '2026-05-17T05:00:00Z', // 15:00 AEST
    end_date:   '2026-05-17T10:00:00Z', // 20:00 AEST
    timezone: 'Australia/Melbourne',
    venue_name: 'Hamer Hall', venue_city: 'Melbourne', venue_state: 'VIC', venue_country: 'Australia',
    cover_image_url: 'https://picsum.photos/seed/gospel/1200/900',
    thumbnail_url:   'https://picsum.photos/seed/gospel/600/450',
    max_capacity: 600,
    tags: ['gospel','christian','choir','family','community'],
    price_cents: 3500, tier_name: 'General Admission', tier_capacity: 500,
  },
  {
    id: '11111111-1111-4111-8111-111111111106',
    title: 'African Comedy Night — The Showcase',
    slug: 'african-comedy-night-the-showcase-2026',
    description: "Six of Australia's funniest African comedians take the stage for a night of stories, cultural observations, and laughs that hit different. Doors open 7pm.",
    summary: '6 African comedians, cultural humour, Melbourne — an unmissable night',
    category_id: CAT.arts,
    start_date: '2026-05-09T09:00:00Z', // 19:00 AEST
    end_date:   '2026-05-09T13:00:00Z', // 23:00 AEST
    timezone: 'Australia/Melbourne',
    venue_name: 'The Comedy Theatre', venue_city: 'Melbourne', venue_state: 'VIC', venue_country: 'Australia',
    cover_image_url: 'https://picsum.photos/seed/comedy1/1200/900',
    thumbnail_url:   'https://picsum.photos/seed/comedy1/600/450',
    max_capacity: 350,
    tags: ['comedy','african','stand-up','culture'],
    price_cents: 4500, tier_name: 'General Admission', tier_capacity: 300,
  },
  {
    id: '11111111-1111-4111-8111-111111111107',
    title: 'Diaspora Business Summit 2026',
    slug: 'diaspora-business-summit-2026',
    description: 'The annual gathering of African diaspora entrepreneurs, investors, and professionals. Keynotes, panels, pitch sessions, and a gala dinner. Network with 300+ leaders.',
    summary: 'Keynotes, panels, pitching, gala dinner — African diaspora entrepreneurs, Sydney',
    category_id: CAT.business,
    start_date: '2026-05-22T22:00:00Z', // 08:00 AEST
    end_date:   '2026-05-23T12:00:00Z', // 22:00 AEST
    timezone: 'Australia/Sydney',
    venue_name: 'International Convention Centre Sydney', venue_city: 'Sydney', venue_state: 'NSW', venue_country: 'Australia',
    cover_image_url: 'https://picsum.photos/seed/diaspora/1200/900',
    thumbnail_url:   'https://picsum.photos/seed/diaspora/600/450',
    max_capacity: 300,
    tags: ['business','networking','diaspora','entrepreneurship','summit'],
    price_cents: 18000, tier_name: 'Standard Pass', tier_capacity: 250,
  },
  {
    id: '11111111-1111-4111-8111-111111111108',
    title: 'Owambe — The Gathering',
    slug: 'owambe-the-gathering-2026',
    description: 'Owambe is the Yoruba word for "it is there" — and this party will be there in every sense. Traditional wear, live band, jollof rice cook-off, and West African culture.',
    summary: 'West African cultural celebration — live band, jollof cook-off, traditional attire',
    category_id: CAT.community,
    start_date: '2026-06-07T04:00:00Z', // 14:00 AEST
    end_date:   '2026-06-07T13:00:00Z', // 23:00 AEST
    timezone: 'Australia/Melbourne',
    venue_name: 'Royal Exhibition Building', venue_city: 'Melbourne', venue_state: 'VIC', venue_country: 'Australia',
    cover_image_url: 'https://picsum.photos/seed/owambe/1200/900',
    thumbnail_url:   'https://picsum.photos/seed/owambe/600/450',
    max_capacity: 1200,
    tags: ['owambe','yoruba','nigerian','cultural','celebration','west-african'],
    price_cents: 5500, tier_name: 'General Admission', tier_capacity: 1000,
  },
]

let inserted = 0
let skipped = 0

for (const ev of events) {
  // Check if already exists
  const { data: existing } = await supabase
    .from('events')
    .select('id')
    .eq('id', ev.id)
    .single()

  if (existing) {
    console.log(`  SKIP  ${ev.title} (already exists)`)
    skipped++
    continue
  }

  const { error: evErr } = await supabase.from('events').insert({
    id: ev.id,
    title: ev.title,
    slug: ev.slug,
    description: ev.description,
    summary: ev.summary,
    organisation_id: ORG_ID,
    created_by: USER_ID,
    category_id: ev.category_id,
    start_date: ev.start_date,
    end_date: ev.end_date,
    timezone: ev.timezone,
    event_type: 'in_person',
    venue_name: ev.venue_name,
    venue_city: ev.venue_city,
    venue_state: ev.venue_state,
    venue_country: ev.venue_country,
    cover_image_url: ev.cover_image_url,
    thumbnail_url: ev.thumbnail_url,
    status: 'published',
    visibility: 'public',
    published_at: new Date().toISOString(),
    max_capacity: ev.max_capacity,
    tags: ev.tags,
    fee_pass_type: 'pass_to_buyer',
    is_age_restricted: false,
  })

  if (evErr) {
    console.error(`  ERROR ${ev.title}:`, evErr.message)
    continue
  }

  const { error: tierErr } = await supabase.from('ticket_tiers').insert({
    event_id: ev.id,
    name: ev.tier_name,
    description: ev.tier_name === 'Standard Pass' ? 'Full day access + gala dinner' : 'General entry',
    tier_type: 'general_admission',
    price: ev.price_cents,
    currency: 'AUD',
    total_capacity: ev.tier_capacity,
    sort_order: 0,
  })

  if (tierErr) {
    console.error(`  ERROR ticket tier for ${ev.title}:`, tierErr.message)
    continue
  }

  console.log(`  OK    ${ev.title} — AUD $${(ev.price_cents / 100).toFixed(0)}, cap ${ev.max_capacity}`)
  inserted++
}

const { count } = await supabase.from('events').select('*', { count: 'exact', head: true })
console.log(`\nDone. Inserted: ${inserted}  Skipped: ${skipped}  Total events in DB: ${count}`)
