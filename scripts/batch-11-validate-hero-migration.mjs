// Validate the Pacific + Middle Eastern + 3 other founder-locked
// hero events migration by applying the equivalent INSERTs via REST.
// Idempotent: each insert UPSERTs on a known UUID; re-running this
// matches what supabase db push --linked will do.
//
// Run this with `node scripts/batch-11-validate-hero-migration.mjs`
// after editing .env.local to make sure NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set. The script reports per-row
// success / failure so any check constraint or schema issue surfaces
// immediately.
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync('.env.local','utf8').split('\n').filter(l => l && !l.startsWith('#')).map(l => {
    const i = l.indexOf('='); return [l.slice(0,i), l.slice(i+1)]
  })
)
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

const events = [
  {
    id: 'e2110000-0000-4000-8000-000000000001',
    organisation_id: 'a1000000-0000-4000-8000-000000000002',
    created_by: '00000000-0000-4000-8000-000000000001',
    title: 'Africultures Festival',
    slug: 'africultures-festival-sydney-2027',
    description: "A whole-day celebration of African community at Wyatt Park Auburn. Three stages of Afrobeats, Amapiano, Highlife, Soukous, Coupé-Décalé, and West African live drumming. Aso-ebi parade, Yoruba and Igbo language workshops, a kids village with adire fabric painting and folktale storytelling, a continental food court representing Nigeria, Ghana, Senegal, DRC, Kenya, and Ethiopia, plus a sundown afro-fusion DJ set to close. Family-friendly, halal options, accessible.",
    summary: 'Wyatt Park, Auburn | three stages, food court, kids village | Sydney',
    start_date: '2027-03-12 10:00:00+11',
    end_date:   '2027-03-12 22:00:00+11',
    timezone: 'Australia/Sydney',
    venue_name: 'Wyatt Park',
    venue_address: 'Auburn Park, Auburn',
    venue_city: 'Sydney', venue_state: 'NSW', venue_country: 'Australia',
    venue_latitude: -33.8493, venue_longitude: 151.0339,
    cover_image_url: 'https://images.pexels.com/photos/36675302/pexels-photo-36675302.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200',
    thumbnail_url:  'https://images.pexels.com/photos/36675302/pexels-photo-36675302.jpeg?auto=compress&cs=tinysrgb&h=450&w=600',
    status: 'published', visibility: 'public',
    max_capacity: 15000,
    tags: ['african','africultures','afrobeats','amapiano','festival','sydney','2027'],
  },
  {
    id: 'e2110000-0000-4000-8000-000000000002',
    organisation_id: 'a2000000-0000-4000-8000-000000000004',
    created_by: '00000000-0000-4000-8000-000000000001',
    title: 'Pasifika Festival 2027',
    slug: 'pasifika-festival-melbourne-2027',
    description: 'The flagship Pasifika Festival of 2027 lands at Federation Square. Two stages of Samoan, Tongan, Fijian, Cook Islands, and Maori performances, a food village representing every Pacific nation, weaving and tapa demonstrations, a kava tent, and a closing fire-knife showcase. Whanau-friendly, free entry to most of the festival, ticketed access to the closing show and seated dinner.',
    summary: 'Federation Square, Melbourne | Pacific main stage, food village, fire-knife closing show',
    start_date: '2027-02-21 10:00:00+11',
    end_date:   '2027-02-21 21:00:00+11',
    timezone: 'Australia/Melbourne',
    venue_name: 'Federation Square',
    venue_address: 'Cnr Swanston and Flinders St',
    venue_city: 'Melbourne', venue_state: 'VIC', venue_country: 'Australia',
    venue_latitude: -37.8180, venue_longitude: 144.9690,
    cover_image_url: 'https://images.pexels.com/photos/8197530/pexels-photo-8197530.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200',
    thumbnail_url:  'https://images.pexels.com/photos/8197530/pexels-photo-8197530.jpeg?auto=compress&cs=tinysrgb&h=450&w=600',
    status: 'published', visibility: 'public',
    max_capacity: 8000,
    tags: ['pacific','pasifika','samoan','tongan','fijian','maori','festival','melbourne','2027'],
  },
  {
    id: 'e2110000-0000-4000-8000-000000000003',
    organisation_id: 'a1000000-0000-4000-8000-000000000009',
    created_by: '00000000-0000-4000-8000-000000000001',
    title: 'Diwali Mela Brisbane',
    slug: 'diwali-mela-brisbane-2026',
    description: "Brisbane's biggest Diwali Mela of 2026 lights up Brisbane Powerhouse. Live Bollywood, Bhangra, and Carnatic music sets across two stages, a diya-lighting ceremony at sundown, a fireworks finale on the river, a vegetarian and Jain-friendly food court with chaat, dosa, and mithai, plus a kids zone with rangoli and mehndi stations. Family-friendly, accessible, vegetarian options throughout.",
    summary: 'Brisbane Powerhouse | Bollywood and Bhangra stages, diya ceremony, fireworks',
    start_date: '2026-10-24 16:00:00+10',
    end_date:   '2026-10-24 23:00:00+10',
    timezone: 'Australia/Brisbane',
    venue_name: 'Brisbane Powerhouse',
    venue_address: '119 Lamington St, New Farm',
    venue_city: 'Brisbane', venue_state: 'QLD', venue_country: 'Australia',
    venue_latitude: -27.4661, venue_longitude: 153.0479,
    cover_image_url: 'https://images.pexels.com/photos/9534913/pexels-photo-9534913.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200',
    thumbnail_url:  'https://images.pexels.com/photos/9534913/pexels-photo-9534913.jpeg?auto=compress&cs=tinysrgb&h=450&w=600',
    status: 'published', visibility: 'public',
    max_capacity: 6500,
    tags: ['south-asian','diwali','mela','bollywood','bhangra','brisbane','2026'],
  },
  {
    id: 'e2110000-0000-4000-8000-000000000004',
    organisation_id: 'a2000000-0000-4000-8000-000000000003',
    created_by: '00000000-0000-4000-8000-000000000001',
    title: 'Lebanese Eid Festival',
    slug: 'lebanese-eid-festival-sydney-2027',
    description: "Sydney's biggest Lebanese Eid celebration. Live tabla and oud bands rotating across two stages, dabke dance circles, halal food court with manakish, shawarma, and knafeh, calligraphy workshops, a kids village with face painting and storytelling, and a closing fireworks show at sundown. Halal, family-friendly, accessible.",
    summary: 'Sydney Olympic Park, Sydney | tabla and oud bands, dabke circles, halal food court, fireworks',
    start_date: '2027-04-19 14:00:00+10',
    end_date:   '2027-04-19 22:00:00+10',
    timezone: 'Australia/Sydney',
    venue_name: 'Sydney Olympic Park',
    venue_address: 'Olympic Boulevard, Sydney Olympic Park',
    venue_city: 'Sydney', venue_state: 'NSW', venue_country: 'Australia',
    venue_latitude: -33.8480, venue_longitude: 151.0686,
    cover_image_url: 'https://images.pexels.com/photos/8939568/pexels-photo-8939568.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200',
    thumbnail_url:  'https://images.pexels.com/photos/8939568/pexels-photo-8939568.jpeg?auto=compress&cs=tinysrgb&h=450&w=600',
    status: 'published', visibility: 'public',
    max_capacity: 12000,
    tags: ['middle-eastern','lebanese','eid','dabke','family','sydney','2027'],
  },
  {
    id: 'e2110000-0000-4000-8000-000000000005',
    organisation_id: 'a1000000-0000-4000-8000-000000000006',
    created_by: '00000000-0000-4000-8000-000000000001',
    title: 'Caribbean Carnival Melbourne',
    slug: 'caribbean-carnival-melbourne-2027',
    description: "Melbourne's biggest Caribbean Carnival of 2027 takes over Birrarung Marr. Live steel pan, soca, calypso, and dancehall sets across three stages, a parade of mas troupes in full costume, a jerk food court, rum punch bars, a kids zone with steel pan workshops, and a closing j'ouvert party. Family-friendly until 8pm, 18+ for the late-night j'ouvert.",
    summary: "Birrarung Marr, Melbourne | steel pan, soca, dancehall, mas troupes, j'ouvert",
    start_date: '2027-02-14 11:00:00+11',
    end_date:   '2027-02-15 02:00:00+11',
    timezone: 'Australia/Melbourne',
    venue_name: 'Birrarung Marr',
    venue_address: 'Birrarung Marr, Batman Ave, Melbourne',
    venue_city: 'Melbourne', venue_state: 'VIC', venue_country: 'Australia',
    venue_latitude: -37.8174, venue_longitude: 144.9737,
    cover_image_url: 'https://images.pexels.com/photos/6301776/pexels-photo-6301776.jpeg?auto=compress&cs=tinysrgb&h=900&w=1200',
    thumbnail_url:  'https://images.pexels.com/photos/6301776/pexels-photo-6301776.jpeg?auto=compress&cs=tinysrgb&h=450&w=600',
    status: 'published', visibility: 'public',
    max_capacity: 10000,
    tags: ['caribbean','carnival','soca','steel-pan','mas','melbourne','2027'],
  },
]

console.log('=== Upserting hero events ===')
for (const e of events) {
  const r = await fetch(URL + `/rest/v1/events?on_conflict=organisation_id,slug`, {
    method: 'POST',
    headers: {
      apikey: KEY, Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(e),
  })
  const data = await r.json()
  if (r.ok) {
    console.log(' OK', e.slug, '(http', r.status + ')')
  } else {
    console.log(' FAIL', e.slug, '(http', r.status + ')')
    console.log('  ->', JSON.stringify(data).slice(0, 400))
  }
}

console.log('\n=== Upserting ticket tiers (2 per event) ===')
const tiers = [
  // Africultures
  { id:'f2110000-0000-4000-8000-000000000101', event_id:'e2110000-0000-4000-8000-000000000001', name:'General Admission', description:'Day-pass access to all three stages, food court, kids village, and the sundown DJ set.', tier_type:'general_admission', price:4500, currency:'AUD', total_capacity:12000, is_visible:true, is_active:true, sort_order:1 },
  { id:'f2110000-0000-4000-8000-000000000102', event_id:'e2110000-0000-4000-8000-000000000001', name:'VIP + Backstage', description:'Front-of-stage access, complimentary food and drinks, backstage meet-and-greet with two headline artists.', tier_type:'general_admission', price:18500, currency:'AUD', total_capacity:500, is_visible:true, is_active:true, sort_order:2 },
  // Pasifika
  { id:'f2110000-0000-4000-8000-000000000201', event_id:'e2110000-0000-4000-8000-000000000002', name:'General Admission', description:'Free entry to the festival village, main stages, food village, and weaving demonstrations.', tier_type:'general_admission', price:0, currency:'AUD', total_capacity:6000, is_visible:true, is_active:true, sort_order:1 },
  { id:'f2110000-0000-4000-8000-000000000202', event_id:'e2110000-0000-4000-8000-000000000002', name:'Closing Show + Dinner', description:'Reserved seating at the closing fire-knife showcase plus a Pacific feast dinner.', tier_type:'general_admission', price:9500, currency:'AUD', total_capacity:2000, is_visible:true, is_active:true, sort_order:2 },
  // Diwali Mela
  { id:'f2110000-0000-4000-8000-000000000301', event_id:'e2110000-0000-4000-8000-000000000003', name:'General Admission', description:'All-day access to both stages, food court, kids zone, and the fireworks finale.', tier_type:'general_admission', price:3500, currency:'AUD', total_capacity:5500, is_visible:true, is_active:true, sort_order:1 },
  { id:'f2110000-0000-4000-8000-000000000302', event_id:'e2110000-0000-4000-8000-000000000003', name:'Family Pass (2 adults + 3 kids)', description:'Discounted family pass for two adults and up to three children under 12.', tier_type:'general_admission', price:9500, currency:'AUD', total_capacity:1000, is_visible:true, is_active:true, sort_order:2 },
  // Lebanese Eid
  { id:'f2110000-0000-4000-8000-000000000401', event_id:'e2110000-0000-4000-8000-000000000004', name:'General Admission', description:'All-day access to the festival grounds, dance stages, food court, kids village, and fireworks.', tier_type:'general_admission', price:2500, currency:'AUD', total_capacity:10000, is_visible:true, is_active:true, sort_order:1 },
  { id:'f2110000-0000-4000-8000-000000000402', event_id:'e2110000-0000-4000-8000-000000000004', name:'Family Pass (2 adults + 3 kids)', description:'Discounted family pass for two adults and up to three children under 12.', tier_type:'general_admission', price:7500, currency:'AUD', total_capacity:2000, is_visible:true, is_active:true, sort_order:2 },
  // Caribbean Carnival
  { id:'f2110000-0000-4000-8000-000000000501', event_id:'e2110000-0000-4000-8000-000000000005', name:'General Admission', description:'Day-pass access to all three stages, mas troupe parade, jerk food court, and rum punch bars.', tier_type:'general_admission', price:5500, currency:'AUD', total_capacity:8000, is_visible:true, is_active:true, sort_order:1 },
  { id:'f2110000-0000-4000-8000-000000000502', event_id:'e2110000-0000-4000-8000-000000000005', name:"J'ouvert After-Party (18+)", description:"Late-night j'ouvert party with steel pan and soca sets through to 2am. 18+ only.", tier_type:'general_admission', price:4500, currency:'AUD', total_capacity:2000, is_visible:true, is_active:true, sort_order:2 },
]

for (const t of tiers) {
  // No (event_id,name) unique constraint exists yet, so use id as the
  // conflict target. Migration adds the proper unique constraint
  // before its UPSERT.
  const r = await fetch(URL + `/rest/v1/ticket_tiers?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: KEY, Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(t),
  })
  const data = await r.json()
  if (r.ok) {
    console.log(' OK', t.event_id.slice(-3), t.name, '(http', r.status + ')')
  } else {
    console.log(' FAIL', t.event_id.slice(-3), t.name, '(http', r.status + ')')
    console.log('  ->', JSON.stringify(data).slice(0, 300))
  }
}

console.log('\n=== Verify by reading back ===')
const slugList = '("africultures-festival-sydney-2027","pasifika-festival-melbourne-2027","diwali-mela-brisbane-2026","lebanese-eid-festival-sydney-2027","caribbean-carnival-melbourne-2027")'
const verify = await fetch(URL + '/rest/v1/events?select=slug,status,visibility,venue_name,venue_city,start_date&slug=in.' + encodeURIComponent(slugList), {
  headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }
})
const verifyRows = await verify.json()
for (const r of (Array.isArray(verifyRows) ? verifyRows : [])) {
  console.log(' ', r.slug, '|', r.status, '|', r.venue_name, '|', r.venue_city, '|', r.start_date?.slice(0,10))
}
