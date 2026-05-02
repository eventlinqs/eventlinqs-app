/**
 * One-shot seed script: 8 culturally-relevant sample events + ticket tiers
 * Run: node scripts/seed-events.mjs
 * Uses service role key - bypasses RLS. Delete this file after seeding.
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

// Get user from DB (organisations are upserted below)
const { data: profile } = await supabase.from('profiles').select('id').limit(1).single()

if (!profile) {
  console.error('No profile found. Cannot seed.')
  process.exit(1)
}

const USER_ID = profile.id

/**
 * Eight diaspora-aligned organisations. Each event picks one via
 * pickOrgId() so the homepage, Live Vibe marquee, and event detail
 * pages show real, thematically-matched organiser names instead of
 * a single generic entity.
 */
const ORGS = {
  melbourneAfrobeats: {
    id: '22222222-2222-4222-8222-222222222201',
    name: 'Melbourne Afrobeats Collective',
    slug: 'melbourne-afrobeats-collective',
    description: 'Melbourne-based collective curating Afrobeats nights, festival takeovers, and diaspora showcases.',
  },
  jollofSupperClub: {
    id: '22222222-2222-4222-8222-222222222202',
    name: 'Jollof Rice Supper Club',
    slug: 'jollof-rice-supper-club',
    description: 'Pop-up supper club series celebrating West African cuisine across Australia and the diaspora.',
  },
  sydneyAmapiano: {
    id: '22222222-2222-4222-8222-222222222203',
    name: 'Sydney Amapiano Sessions',
    slug: 'sydney-amapiano-sessions',
    description: 'Sydney nightlife crew booking top Amapiano DJs and hosting the citys biggest Amapiano nights.',
  },
  lagosNightsAustralia: {
    id: '22222222-2222-4222-8222-222222222204',
    name: 'Lagos Nights Australia',
    slug: 'lagos-nights-australia',
    description: 'Traditional Owambe and West African celebration producers for the Australian diaspora.',
  },
  diasporaBusinessForum: {
    id: '22222222-2222-4222-8222-222222222205',
    name: 'Diaspora Business Forum',
    slug: 'diaspora-business-forum',
    description: 'Conferences, summits, and roundtables connecting African and diaspora founders with capital and partners.',
  },
  gospelCulturalNetwork: {
    id: '22222222-2222-4222-8222-222222222206',
    name: 'Gospel Cultural Network',
    slug: 'gospel-cultural-network',
    description: 'Gospel concerts, choir nights, and worship gatherings for the global African Christian diaspora.',
  },
  perthAfricanMarket: {
    id: '22222222-2222-4222-8222-222222222207',
    name: 'Perth African Market',
    slug: 'perth-african-market',
    description: 'Perth collective running African food markets, family days, and regional community events.',
  },
  aucklandCulturalAlliance: {
    id: '22222222-2222-4222-8222-222222222208',
    name: 'Auckland Cultural Alliance',
    slug: 'auckland-cultural-alliance',
    description: 'Multicultural collective producing cultural festivals, art exhibitions, and community events across Aotearoa.',
  },
}

function pickOrgId(ev) {
  const tags = new Set(ev.tags ?? [])
  const city = (ev.venue_city ?? '').toLowerCase()

  if (tags.has('owambe') || tags.has('yoruba')) return ORGS.lagosNightsAustralia.id
  if (tags.has('gospel') || tags.has('christian') || tags.has('worship') || tags.has('choir')) return ORGS.gospelCulturalNetwork.id
  if (tags.has('business') || tags.has('networking') || tags.has('entrepreneurship') || tags.has('summit')) return ORGS.diasporaBusinessForum.id
  if (tags.has('amapiano') && city === 'sydney') return ORGS.sydneyAmapiano.id
  if (tags.has('amapiano')) return ORGS.sydneyAmapiano.id
  if (tags.has('afrobeats') && city === 'melbourne') return ORGS.melbourneAfrobeats.id
  if (city === 'auckland') return ORGS.aucklandCulturalAlliance.id
  if (city === 'perth') return ORGS.perthAfricanMarket.id
  if (tags.has('food') || tags.has('supper') || tags.has('market')) return ORGS.jollofSupperClub.id
  return ORGS.melbourneAfrobeats.id
}

// Upsert all 8 organisations up front
for (const org of Object.values(ORGS)) {
  const { error } = await supabase.from('organisations').upsert({
    id: org.id,
    name: org.name,
    slug: org.slug,
    description: org.description,
    owner_id: USER_ID,
    status: 'active',
  }, { onConflict: 'id' })
  if (error) {
    console.error(`  ERROR upserting organisation ${org.name}:`, error.message)
  } else {
    console.log(`  ORG   ${org.name}`)
  }
}

// Category IDs (from event_categories seed)
const CAT = {
  music:               'b62551e2-4010-45fa-be8c-f9353ba0f39d',
  nightlife:           '2443fb27-a02c-412c-b05c-06d1a8e070a6',
  religion:            '310ec098-563e-46cb-97d2-fea1eb048bb7',
  arts:                '0fcd5166-fcba-4df3-95f8-26fa0e8ff1bc',
  arts_culture:        '0fcd5166-fcba-4df3-95f8-26fa0e8ff1bc',
  business:            '8234412f-2a88-42d2-a9d2-406425f67ad9',
  business_networking: '8234412f-2a88-42d2-a9d2-406425f67ad9',
  community:           'db15a8f5-6aa2-40b7-b018-3d1087e3eb73',
  charity:             '51093545-2307-4d9f-a211-1db68576e20e',
  comedy:              '342836b3-f047-4b4a-a19d-21b7ca98837a',
  education:           '365dbe13-eb67-446b-9a19-8bcecd1f19e1',
  family:              'e227e1e0-beba-49c4-97bc-62f96114f456',
  fashion:             '5d6c0ed9-72f3-45e4-b3f6-e5e0ac86aeb0',
  festival:            '4084278c-83fe-4325-a730-5135c8b60042',
  film:                '4b03fe74-12e9-4c3b-8904-a5c2b73da424',
  food_drink:          '36ee7cf5-5908-452c-92e6-a720903b2445',
  health_wellness:     'd2547529-773f-44c0-ac7b-1f186c549323',
  sports:              'b413cc36-2c85-4f5f-97e1-6217402c8601',
  technology:          'b06fcc5d-21d5-4c70-91ce-0eb47e4cfb4e',
}

const events = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    title: 'Afrobeats Melbourne Summer Sessions',
    slug: 'afrobeats-melbourne-summer-sessions-2026',
    description: 'The biggest Afrobeats event of the Melbourne summer. Three stages, international DJs, Nigerian street food, and a crowd that knows every word.',
    summary: 'Live Afrobeats, 3 stages, street food - Melbourne Showgrounds',
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
    title: 'Afrobeats All Night - London',
    slug: 'afrobeats-all-night-london-2026',
    description: "London's premier monthly Afrobeats session returns for a special extended night. The freshest Afrobeats, Afropop, and Alte sounds from a world-class DJ lineup.",
    summary: "London's top Afrobeats night - extended session, world-class DJs",
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
    title: 'Amapiano Takeover - Sydney',
    slug: 'amapiano-takeover-sydney-2026',
    description: "Sydney's wildest Amapiano party is back. Log drums, wailing piano, and a dancefloor that never stops. This is the sound of South Africa in the heart of the city.",
    summary: "Sydney's biggest Amapiano night - log drums, wailing piano, all night",
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
    title: 'Highlife Heritage Night - Brisbane',
    slug: 'highlife-heritage-night-brisbane-2026',
    description: 'A celebration of West African Highlife music across the decades. Live band, traditional attire welcome, authentic Ghanaian and Nigerian cuisine.',
    summary: 'Live Highlife band, traditional attire, West African cuisine - Brisbane',
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
    title: 'Gospel on the Hills - Melbourne',
    slug: 'gospel-on-the-hills-melbourne-2026',
    description: "An uplifting evening of Gospel music bringing together choirs and soloists from across Melbourne's African and Pacific Islander communities. Family-friendly.",
    summary: 'Gospel night - choirs, soloists, African community, all welcome',
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
    title: 'African Comedy Night - The Showcase',
    slug: 'african-comedy-night-the-showcase-2026',
    description: "Six of Australia's funniest African comedians take the stage for a night of stories, cultural observations, and laughs that hit different. Doors open 7pm.",
    summary: '6 African comedians, cultural humour, Melbourne - an unmissable night',
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
    summary: 'Keynotes, panels, pitching, gala dinner - African diaspora entrepreneurs, Sydney',
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
    title: 'Owambe - The Gathering',
    slug: 'owambe-the-gathering-2026',
    description: 'Owambe is the Yoruba word for "it is there" - and this party will be there in every sense. Traditional wear, live band, jollof rice cook-off, and West African culture.',
    summary: 'West African cultural celebration - live band, jollof cook-off, traditional attire',
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
    // Backfill organisation to the diaspora-aligned pick.
    const { error: orgUpdErr } = await supabase
      .from('events')
      .update({ organisation_id: pickOrgId(ev) })
      .eq('id', ev.id)
    if (orgUpdErr) {
      console.error(`  ERROR org backfill ${ev.title}:`, orgUpdErr.message)
    }
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
    organisation_id: pickOrgId(ev),
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

  console.log(`  OK    ${ev.title} - AUD $${(ev.price_cents / 100).toFixed(0)}, cap ${ev.max_capacity}`)
  inserted++
}

// --- M5 Step 5: demo dataset ------------------------------------------------
// 25 extra events designed so /events can exercise every filter chip, every
// social-proof badge, four cities across AU/NZ/NG/GH, and a $5-$500 price
// spread. Covers are intentionally null so m5-events-grid's Pexels fallback
// kicks in (confirms Step 5 Pre-work A end-to-end).

const now = new Date()
const HOUR = 3_600_000
const DAY = 24 * HOUR
const iso = ms => new Date(now.getTime() + ms).toISOString()

// Approximate city centre coordinates used to place demo events on the
// map. Each event gets small jitter (~±0.005 deg, ≈500m) around the
// centre so map clustering has something meaningful to merge/split
// without every pin stacking on the same lat/lng.
const CITY_COORDS = {
  'Perth':     { lat: -31.9505, lng: 115.8605 },
  'Auckland':  { lat: -36.8485, lng: 174.7633 },
  'Lagos':     { lat:   6.5244, lng:   3.3792 },
  'Accra':     { lat:   5.6037, lng:  -0.1870 },
  'Brisbane':  { lat: -27.4698, lng: 153.0251 },
  'Melbourne': { lat: -37.8136, lng: 144.9631 },
  'Sydney':    { lat: -33.8688, lng: 151.2093 },
}

function jitter() {
  return (Math.random() - 0.5) * 0.010
}

function resolveCityCoords(city) {
  const base = CITY_COORDS[city]
  if (!base) return { lat: null, lng: null }
  return { lat: +(base.lat + jitter()).toFixed(6), lng: +(base.lng + jitter()).toFixed(6) }
}

const DEMO_EVENTS = [
  // -------- badge: last_chance (starts < 24h) --------
  {
    id: '11111111-1111-4111-8111-111111112101',
    title: 'Amapiano Sundown - Perth',
    slug: 'amapiano-sundown-perth-m5',
    description: 'Rooftop Amapiano at golden hour. Log-drum bass, wailing piano, diaspora dancefloor - Perth in full colour.',
    summary: 'Rooftop Amapiano, golden hour, Perth',
    category_id: CAT.nightlife,
    start_date: iso(6 * HOUR),
    end_date: iso(12 * HOUR),
    timezone: 'Australia/Perth',
    venue_name: 'Northbridge Rooftop', venue_city: 'Perth', venue_state: 'WA', venue_country: 'Australia',
    max_capacity: 300, tags: ['amapiano','nightlife','rooftop'],
    tiers: [{ name: 'GA', price: 6500, capacity: 280, sold: 40, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112102',
    title: 'Gospel Easter Vigil - Accra',
    slug: 'gospel-easter-vigil-accra-m5',
    description: 'An all-night gospel vigil bringing together choirs from across Accra. Traditional Ghanaian hymns and contemporary worship under one roof.',
    summary: 'All-night gospel vigil, Accra choirs united',
    category_id: CAT.religion,
    start_date: iso(18 * HOUR),
    end_date: iso(28 * HOUR),
    timezone: 'Africa/Accra',
    venue_name: 'Accra International Conference Centre', venue_city: 'Accra', venue_state: 'Greater Accra', venue_country: 'Ghana',
    max_capacity: 1200, tags: ['gospel','worship','ghana','religion'],
    tiers: [{ name: 'GA', price: 2500, capacity: 1100, sold: 60, reserved: 0 }],
  },

  // -------- badge: few_left (< 10 remaining) --------
  {
    id: '11111111-1111-4111-8111-111111112103',
    title: 'Intimate Jazz Supper - Auckland',
    slug: 'intimate-jazz-supper-auckland-m5',
    description: 'A 100-seat-only candlelit jazz supper. Diaspora jazz quartet, three-course Afro-fusion menu, no phones on the table.',
    summary: '100-seat candlelit jazz supper, Afro-fusion menu',
    category_id: CAT.music,
    start_date: iso(9 * DAY),
    end_date: iso(9 * DAY + 4 * HOUR),
    timezone: 'Pacific/Auckland',
    venue_name: 'The Civic Lounge', venue_city: 'Auckland', venue_state: 'Auckland', venue_country: 'New Zealand',
    max_capacity: 100, tags: ['jazz','intimate','auckland','supper'],
    tiers: [{ name: 'Reserved Seat', price: 14500, capacity: 100, sold: 95, reserved: 4 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112104',
    title: 'Lagos Fashion Week - Gala Night',
    slug: 'lagos-fashion-week-gala-m5',
    description: 'The closing gala of Lagos Fashion Week. Runway finale, afterparty, 100 gala seats only.',
    summary: 'Lagos Fashion Week closing gala - 100 seats',
    category_id: CAT.fashion,
    start_date: iso(14 * DAY),
    end_date: iso(14 * DAY + 6 * HOUR),
    timezone: 'Africa/Lagos',
    venue_name: 'Eko Hotel Gala Suite', venue_city: 'Lagos', venue_state: 'Lagos', venue_country: 'Nigeria',
    max_capacity: 100, tags: ['fashion','gala','lagos','runway'],
    tiers: [{ name: 'Gala Seat', price: 22000, capacity: 100, sold: 96, reserved: 3 }],
  },

  // -------- badge: selling_fast (> 70% sold) --------
  {
    id: '11111111-1111-4111-8111-111111112105',
    title: 'Amapiano Takeover - Brisbane',
    slug: 'amapiano-takeover-brisbane-m5',
    description: 'Brisbane gets its first dedicated Amapiano takeover. Sydney and Melbourne DJs invade the River City.',
    summary: 'Brisbane Amapiano takeover - interstate DJs',
    category_id: CAT.nightlife,
    start_date: iso(21 * DAY),
    end_date: iso(21 * DAY + 7 * HOUR),
    timezone: 'Australia/Brisbane',
    venue_name: 'The Tivoli', venue_city: 'Brisbane', venue_state: 'QLD', venue_country: 'Australia',
    max_capacity: 100, tags: ['amapiano','nightlife','brisbane'],
    tiers: [{ name: 'GA', price: 7500, capacity: 100, sold: 92, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112106',
    title: 'Tech Founders Demo Day - Perth',
    slug: 'tech-founders-demo-day-perth-m5',
    description: 'Twelve African-diaspora founders pitch their startups. Investor panel, networking, jollof after-party.',
    summary: '12 diaspora founders pitch, investors in room',
    category_id: CAT.technology,
    start_date: iso(17 * DAY),
    end_date: iso(17 * DAY + 6 * HOUR),
    timezone: 'Australia/Perth',
    venue_name: 'Spacecubed Riff', venue_city: 'Perth', venue_state: 'WA', venue_country: 'Australia',
    max_capacity: 180, tags: ['tech','startups','pitching','networking'],
    tiers: [{ name: 'Founder Pass', price: 5500, capacity: 180, sold: 140, reserved: 0 }],
  },

  // -------- badge: just_announced (created < 48h ago) --------
  {
    id: '11111111-1111-4111-8111-111111112107',
    title: 'Accra Comedy Pop-Up',
    slug: 'accra-comedy-pop-up-m5',
    description: 'A surprise one-night-only comedy showcase with six of West Africa\u2019s best touring comedians. Just announced.',
    summary: 'Surprise 6-comedian comedy showcase, Accra',
    category_id: CAT.comedy,
    start_date: iso(12 * DAY),
    end_date: iso(12 * DAY + 3 * HOUR),
    timezone: 'Africa/Accra',
    venue_name: 'Alliance Fran\u00e7aise Accra', venue_city: 'Accra', venue_state: 'Greater Accra', venue_country: 'Ghana',
    created_at_override: iso(-6 * HOUR),
    max_capacity: 280, tags: ['comedy','stand-up','west-africa','accra'],
    tiers: [{ name: 'GA', price: 3000, capacity: 250, sold: 12, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112108',
    title: 'Coastal Yoga Retreat - Auckland',
    slug: 'coastal-yoga-retreat-auckland-m5',
    description: 'A weekend of coastal vinyasa, breathwork, and West African drumming circles. Just added for this season.',
    summary: 'Coastal vinyasa + West African drumming',
    category_id: CAT.health_wellness,
    start_date: iso(30 * DAY),
    end_date: iso(32 * DAY),
    timezone: 'Pacific/Auckland',
    venue_name: 'Piha Beach Retreat', venue_city: 'Auckland', venue_state: 'Auckland', venue_country: 'New Zealand',
    created_at_override: iso(-12 * HOUR),
    max_capacity: 40, tags: ['yoga','wellness','retreat','drumming'],
    tiers: [{ name: 'Full Retreat', price: 12000, capacity: 40, sold: 4, reserved: 0 }],
  },

  // -------- badge: free (is_free=true, no tiers) --------
  {
    id: '11111111-1111-4111-8111-111111112109',
    title: 'Perth Diaspora Community Picnic',
    slug: 'perth-diaspora-community-picnic-m5',
    description: 'A free afternoon picnic bringing Perth\u2019s African, Caribbean and Pacific communities together. BYO food, shared dessert table.',
    summary: 'Free community picnic, Perth diaspora',
    category_id: CAT.community,
    start_date: iso(10 * DAY),
    end_date: iso(10 * DAY + 5 * HOUR),
    timezone: 'Australia/Perth',
    venue_name: 'Kings Park Lawn', venue_city: 'Perth', venue_state: 'WA', venue_country: 'Australia',
    max_capacity: 600, tags: ['community','picnic','family','free'],
    is_free: true,
  },
  {
    id: '11111111-1111-4111-8111-11111111210a',
    title: 'Lagos Youth Gospel Worship',
    slug: 'lagos-youth-gospel-worship-m5',
    description: 'A free open-air worship gathering led by Lagos\u2019 youth ministries. Acoustic sets, prayer, fellowship.',
    summary: 'Free open-air youth worship, Lagos',
    category_id: CAT.religion,
    start_date: iso(19 * DAY),
    end_date: iso(19 * DAY + 4 * HOUR),
    timezone: 'Africa/Lagos',
    venue_name: 'Freedom Park Lagos', venue_city: 'Lagos', venue_state: 'Lagos', venue_country: 'Nigeria',
    max_capacity: 2000, tags: ['gospel','youth','worship','free'],
    is_free: true,
  },
  {
    id: '11111111-1111-4111-8111-11111111210b',
    title: 'Auckland African Food Market',
    slug: 'auckland-african-food-market-m5',
    description: 'A free Saturday market with 20+ African food vendors. Nigerian, Ethiopian, Somali, Ghanaian, South African stalls.',
    summary: 'Free Saturday market, 20+ African food stalls',
    category_id: CAT.food_drink,
    start_date: iso(6 * DAY),
    end_date: iso(6 * DAY + 8 * HOUR),
    timezone: 'Pacific/Auckland',
    venue_name: 'Aotea Square', venue_city: 'Auckland', venue_state: 'Auckland', venue_country: 'New Zealand',
    max_capacity: 3000, tags: ['food','market','african','free'],
    is_free: true,
  },

  // -------- regular events: category + city + price spread --------
  {
    id: '11111111-1111-4111-8111-11111111210c',
    title: 'Diaspora Founders Forum - Accra',
    slug: 'diaspora-founders-forum-accra-m5',
    description: 'A full-day forum for African-diaspora founders returning to the continent. Panels, office hours, capital roundtable.',
    summary: 'Diaspora founders forum - capital + community',
    category_id: CAT.business_networking,
    start_date: iso(24 * DAY),
    end_date: iso(24 * DAY + 10 * HOUR),
    timezone: 'Africa/Accra',
    venue_name: 'Kempinski Hotel Gold Coast', venue_city: 'Accra', venue_state: 'Greater Accra', venue_country: 'Ghana',
    max_capacity: 400, tags: ['business','networking','diaspora','founders'],
    tiers: [{ name: 'Standard Pass', price: 18000, capacity: 350, sold: 40, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-11111111210d',
    title: 'Perth Women in Business Gala',
    slug: 'perth-women-in-business-gala-m5',
    description: 'Black-tie gala honouring 12 women-led businesses across Western Australia. Keynote, awards, networking dinner.',
    summary: 'Black-tie gala, 12 women-led businesses',
    category_id: CAT.business_networking,
    start_date: iso(27 * DAY),
    end_date: iso(27 * DAY + 5 * HOUR),
    timezone: 'Australia/Perth',
    venue_name: 'Crown Towers Perth', venue_city: 'Perth', venue_state: 'WA', venue_country: 'Australia',
    max_capacity: 250, tags: ['business','gala','women','networking'],
    tiers: [{ name: 'Gala Ticket', price: 50000, capacity: 250, sold: 30, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-11111111210e',
    title: 'Afro-Contemporary Art Exhibition - Auckland',
    slug: 'afro-contemporary-art-auckland-m5',
    description: 'A six-week exhibition featuring 18 contemporary African artists. Opening night includes live jazz and catering.',
    summary: '18 African artists, opening night jazz',
    category_id: CAT.arts_culture,
    start_date: iso(15 * DAY),
    end_date: iso(15 * DAY + 6 * HOUR),
    timezone: 'Pacific/Auckland',
    venue_name: 'Auckland Art Gallery', venue_city: 'Auckland', venue_state: 'Auckland', venue_country: 'New Zealand',
    max_capacity: 500, tags: ['arts','culture','exhibition','opening-night'],
    tiers: [{ name: 'Opening Night', price: 2500, capacity: 500, sold: 60, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-11111111210f',
    title: 'Nigerian Literature Festival - Lagos',
    slug: 'nigerian-literature-festival-lagos-m5',
    description: 'A one-day festival of Nigerian writers, poets, and spoken-word artists. Affordable cultural programming for all.',
    summary: 'Nigerian writers, poets, spoken-word - Lagos',
    category_id: CAT.arts_culture,
    start_date: iso(20 * DAY),
    end_date: iso(20 * DAY + 9 * HOUR),
    timezone: 'Africa/Lagos',
    venue_name: 'Freedom Park Lagos', venue_city: 'Lagos', venue_state: 'Lagos', venue_country: 'Nigeria',
    max_capacity: 800, tags: ['literature','poetry','nigeria','festival'],
    tiers: [{ name: 'GA', price: 500, capacity: 800, sold: 180, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112110',
    title: 'Perth Family Fun Day',
    slug: 'perth-family-fun-day-m5',
    description: 'Face painting, jumping castles, West African drumming workshops, and kids\u2019 Jollof lunch box - a full afternoon for the family.',
    summary: 'Kids activities, drumming, Jollof lunch',
    category_id: CAT.family,
    start_date: iso(11 * DAY),
    end_date: iso(11 * DAY + 6 * HOUR),
    timezone: 'Australia/Perth',
    venue_name: 'Whiteman Park', venue_city: 'Perth', venue_state: 'WA', venue_country: 'Australia',
    max_capacity: 600, tags: ['family','kids','drumming','picnic'],
    tiers: [{ name: 'Family Pass', price: 1500, capacity: 600, sold: 120, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112111',
    title: 'Kids African Drumming Workshop - Auckland',
    slug: 'kids-african-drumming-workshop-auckland-m5',
    description: 'A hands-on drumming circle for kids 5-12. Instruments provided, cultural storytelling, parent tea-break lounge.',
    summary: 'Kids drumming workshop, instruments provided',
    category_id: CAT.family,
    start_date: iso(13 * DAY),
    end_date: iso(13 * DAY + 3 * HOUR),
    timezone: 'Pacific/Auckland',
    venue_name: 'Corban Estate Arts Centre', venue_city: 'Auckland', venue_state: 'Auckland', venue_country: 'New Zealand',
    max_capacity: 80, tags: ['family','kids','drumming','workshop'],
    tiers: [{ name: 'Child Ticket', price: 2000, capacity: 80, sold: 18, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112112',
    title: 'Accra Independence Festival',
    slug: 'accra-independence-festival-m5',
    description: 'Three stages, parade, food, fashion, cultural showcases. Accra\u2019s biggest outdoor festival of the season.',
    summary: 'Three stages, parade, food, fashion',
    category_id: CAT.festival,
    start_date: iso(26 * DAY),
    end_date: iso(27 * DAY),
    timezone: 'Africa/Accra',
    venue_name: 'Black Star Square', venue_city: 'Accra', venue_state: 'Greater Accra', venue_country: 'Ghana',
    max_capacity: 8000, tags: ['festival','independence','ghana','cultural'],
    tiers: [{ name: 'Day Pass', price: 5000, capacity: 5000, sold: 520, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112113',
    title: 'Perth World Music Festival',
    slug: 'perth-world-music-festival-m5',
    description: 'Two days of global music - Afrobeats, reggae, bossa nova, Amapiano. Two stages, global food village, family-friendly.',
    summary: 'Two-day world music festival, two stages',
    category_id: CAT.festival,
    start_date: iso(33 * DAY),
    end_date: iso(34 * DAY),
    timezone: 'Australia/Perth',
    venue_name: 'Elizabeth Quay', venue_city: 'Perth', venue_state: 'WA', venue_country: 'Australia',
    max_capacity: 4000, tags: ['festival','world-music','afrobeats','amapiano'],
    tiers: [{ name: 'Weekend Pass', price: 9500, capacity: 4000, sold: 380, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112114',
    title: 'Lagos Half Marathon',
    slug: 'lagos-half-marathon-m5',
    description: '21.1km course through the heart of Lagos. Live Afrobeat bands every 2km, finish-line jollof and zobo.',
    summary: '21.1km Lagos course, live bands every 2km',
    category_id: CAT.sports,
    start_date: iso(35 * DAY),
    end_date: iso(35 * DAY + 5 * HOUR),
    timezone: 'Africa/Lagos',
    venue_name: 'Lekki-Ikoyi Bridge', venue_city: 'Lagos', venue_state: 'Lagos', venue_country: 'Nigeria',
    max_capacity: 3000, tags: ['sports','running','marathon','lagos'],
    tiers: [{ name: 'Runner Entry', price: 3500, capacity: 3000, sold: 340, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112115',
    title: 'Auckland 5K Community Run',
    slug: 'auckland-5k-community-run-m5',
    description: '5km community fun run for the Piha Beach environmental trust. Chip-timed, kid-friendly, rain or shine.',
    summary: '5km community fun run, chip-timed',
    category_id: CAT.sports,
    start_date: iso(16 * DAY),
    end_date: iso(16 * DAY + 3 * HOUR),
    timezone: 'Pacific/Auckland',
    venue_name: 'Piha Beach', venue_city: 'Auckland', venue_state: 'Auckland', venue_country: 'New Zealand',
    max_capacity: 800, tags: ['sports','running','community','charity'],
    tiers: [{ name: 'Entry', price: 2500, capacity: 800, sold: 90, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112116',
    title: 'Accra Jollof Wars Cook-Off',
    slug: 'accra-jollof-wars-cook-off-m5',
    description: 'Ghanaian vs Nigerian vs Senegalese Jollof, judged by three celebrity chefs. Taste all three with your ticket.',
    summary: 'Three-country Jollof cook-off, tasting ticket',
    category_id: CAT.food_drink,
    start_date: iso(23 * DAY),
    end_date: iso(23 * DAY + 5 * HOUR),
    timezone: 'Africa/Accra',
    venue_name: 'Labadi Beach Hotel', venue_city: 'Accra', venue_state: 'Greater Accra', venue_country: 'Ghana',
    max_capacity: 450, tags: ['food','jollof','cook-off','accra'],
    tiers: [{ name: 'Tasting Pass', price: 4000, capacity: 400, sold: 110, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112117',
    title: 'Auckland Stand-Up Showcase',
    slug: 'auckland-stand-up-showcase-m5',
    description: 'Four African-diaspora comedians from across AU/NZ take the stage for a no-holds-barred 90 minutes.',
    summary: '4 diaspora comedians, 90 minutes',
    category_id: CAT.comedy,
    start_date: iso(18 * DAY),
    end_date: iso(18 * DAY + 3 * HOUR),
    timezone: 'Pacific/Auckland',
    venue_name: 'The Classic Comedy Club', venue_city: 'Auckland', venue_state: 'Auckland', venue_country: 'New Zealand',
    max_capacity: 220, tags: ['comedy','stand-up','diaspora'],
    tiers: [{ name: 'GA', price: 4500, capacity: 220, sold: 60, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112118',
    title: 'Lagos Nollywood Cinema Night',
    slug: 'lagos-nollywood-cinema-night-m5',
    description: 'An open-air Nollywood premiere screening with director Q&A, red-carpet photo wall, and small chops catering.',
    summary: 'Open-air Nollywood premiere + director Q&A',
    category_id: CAT.film,
    start_date: iso(22 * DAY),
    end_date: iso(22 * DAY + 4 * HOUR),
    timezone: 'Africa/Lagos',
    venue_name: 'Muri Okunola Park', venue_city: 'Lagos', venue_state: 'Lagos', venue_country: 'Nigeria',
    max_capacity: 500, tags: ['film','nollywood','cinema','premiere'],
    tiers: [{ name: 'GA', price: 2000, capacity: 500, sold: 85, reserved: 0 }],
  },
  {
    id: '11111111-1111-4111-8111-111111112119',
    title: 'Diaspora Mentorship Summit - Perth',
    slug: 'diaspora-mentorship-summit-perth-m5',
    description: 'A one-day summit pairing senior African-diaspora professionals with emerging talent. 1:1 mentor circles, career workshops.',
    summary: '1:1 mentor circles + career workshops',
    category_id: CAT.education,
    start_date: iso(29 * DAY),
    end_date: iso(29 * DAY + 9 * HOUR),
    timezone: 'Australia/Perth',
    venue_name: 'UWA Business School', venue_city: 'Perth', venue_state: 'WA', venue_country: 'Australia',
    max_capacity: 180, tags: ['education','mentorship','career','summit'],
    tiers: [{ name: 'Attendee', price: 9500, capacity: 180, sold: 34, reserved: 0 }],
  },
]

console.log(`\n--- M5 demo dataset (${DEMO_EVENTS.length} events) ---`)

let coordsBackfilled = 0

for (const ev of DEMO_EVENTS) {
  const coords = resolveCityCoords(ev.venue_city)

  const { data: existing } = await supabase
    .from('events')
    .select('id, venue_latitude, venue_longitude')
    .eq('id', ev.id)
    .single()

  if (existing) {
    // Idempotent coord backfill: only write when the row has no coords yet,
    // so re-runs never overwrite organiser edits made through the dashboard.
    if (
      coords.lat !== null &&
      (existing.venue_latitude === null || existing.venue_longitude === null)
    ) {
      const { error: updErr } = await supabase
        .from('events')
        .update({ venue_latitude: coords.lat, venue_longitude: coords.lng })
        .eq('id', ev.id)
      if (updErr) {
        console.error(`  ERROR coord backfill ${ev.title}:`, updErr.message)
      } else {
        coordsBackfilled++
        console.log(`  COORDS ${ev.title.padEnd(55)} (${coords.lat}, ${coords.lng})`)
      }
    } else {
      console.log(`  SKIP  ${ev.title} (already exists)`)
    }
    // Backfill organisation to the diaspora-aligned pick so existing rows
    // seeded earlier (with the single placeholder org) switch over too.
    const { error: orgUpdErr } = await supabase
      .from('events')
      .update({ organisation_id: pickOrgId(ev) })
      .eq('id', ev.id)
    if (orgUpdErr) {
      console.error(`  ERROR org backfill ${ev.title}:`, orgUpdErr.message)
    }
    skipped++
    continue
  }

  const insert = {
    id: ev.id,
    title: ev.title,
    slug: ev.slug,
    description: ev.description,
    summary: ev.summary,
    organisation_id: pickOrgId(ev),
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
    venue_latitude: coords.lat,
    venue_longitude: coords.lng,
    cover_image_url: null,
    thumbnail_url: null,
    status: 'published',
    visibility: 'public',
    published_at: new Date().toISOString(),
    max_capacity: ev.max_capacity,
    tags: ev.tags,
    fee_pass_type: 'pass_to_buyer',
    is_age_restricted: false,
    is_free: ev.is_free ?? false,
  }
  if (ev.created_at_override) insert.created_at = ev.created_at_override

  const { error: evErr } = await supabase.from('events').insert(insert)
  if (evErr) {
    console.error(`  ERROR ${ev.title}:`, evErr.message)
    continue
  }

  if (Array.isArray(ev.tiers) && ev.tiers.length > 0) {
    const tierRows = ev.tiers.map((t, i) => ({
      event_id: ev.id,
      name: t.name,
      description: t.description ?? 'General entry',
      tier_type: t.tier_type ?? 'general_admission',
      price: t.price,
      currency: 'AUD',
      total_capacity: t.capacity,
      sold_count: t.sold ?? 0,
      reserved_count: t.reserved ?? 0,
      sort_order: i,
    }))
    const { error: tierErr } = await supabase.from('ticket_tiers').insert(tierRows)
    if (tierErr) {
      console.error(`  ERROR ticket tier for ${ev.title}:`, tierErr.message)
      continue
    }
  }

  const priceLabel = ev.is_free
    ? 'FREE'
    : `$${((ev.tiers?.[0]?.price ?? 0) / 100).toFixed(0)}`
  console.log(`  OK    ${ev.title.padEnd(55)} ${priceLabel}`)
  inserted++
}

const { count } = await supabase.from('events').select('*', { count: 'exact', head: true })
console.log(
  `\nDone. Inserted: ${inserted}  Skipped: ${skipped}  Coords backfilled: ${coordsBackfilled}  Total events in DB: ${count}`,
)
