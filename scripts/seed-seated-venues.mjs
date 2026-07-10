/**
 * Seeds the reserved-seating evidence set on TEST: three differently shaped
 * venues (a tiny irregular comedy cellar, a mid-size multi-section theatre,
 * a table-seating gala) plus a 1,200-seat performance chart, each with a
 * seating chart built from the SAME generator the organiser builder uses,
 * attached to published events under the payment-ready test organisation so
 * paid card-4242 checkout works.
 *
 * TEST only (hard guard). Idempotent: deterministic ids, existing rows kept.
 * Run: node --experimental-strip-types scripts/seed-seated-venues.mjs
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { generateLayout } from '../src/lib/seating/generate.ts'

const PROD_REF = 'gndnldyfudbytbboxesk'
const ORG_ID = '5886d5cb-09d8-4f91-9b13-ba6d5c0ecbe2' // Harbour Lights Collective (Stripe-ready)
const OWNER_ID = '73e72297-dd68-4208-b6a3-266289172bdf'

const env = {}
for (const line of fs.readFileSync('.env.test', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}
const URL = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) throw new Error('Missing TEST credentials in .env.test')
if (URL.includes(PROD_REF)) throw new Error('SAFETY STOP: target is PRODUCTION')

const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

function uuidFrom(str) {
  const h = createHash('md5').update(str).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

async function upsert(table, row, conflict = 'id') {
  const res = await fetch(`${URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: { ...H, prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${table} upsert failed: ${JSON.stringify(body).slice(0, 300)}`)
  return Array.isArray(body) ? body[0] : body
}

async function rpc(name, args) {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: H, body: JSON.stringify(args) })
  const text = await res.text()
  if (!res.ok) throw new Error(`${name} failed: ${text.slice(0, 300)}`)
  return text
}

// ── Chart definitions (built with the builder's own block vocabulary) ────────

// 1. The Cellar: a 30-seat irregular comedy room. Uneven rows (4,6,7,6,5),
//    a gentle curve, two seats removed around a pillar, an accessible pair
//    plus companion seat in the back row, one blocked production seat, and
//    a small standing zone at the bar sold as GA.
const CELLAR_BLOCKS = [
  {
    id: 'cellar-rows', kind: 'rows', section: 'Main room', tierName: 'Cellar seat',
    color: '#0EA5E9', x: 120, y: 120, rows: 5, seatsPerRow: [4, 6, 7, 6, 5],
    curveDepth: 14, removedSeats: ['C-4', 'D-3'], blockedSeats: ['A-1'],
    accessibleSeats: ['E-1', 'E-2'], companionSeats: ['E-3'],
  },
  {
    id: 'cellar-bar', kind: 'area', section: 'Bar', tierName: 'Bar standing',
    color: '#FF9800', label: 'Bar standing', x: 320, y: 120, width: 130, height: 120, capacity: 10,
  },
]

// 2. Regent Theatre: mid-size multi-section (about 500 seats). Curved stalls
//    with a centre aisle feel via uneven rows, a numeric-row balcony, and two
//    rotated box blocks. Per-section tiers.
const THEATRE_BLOCKS = [
  {
    id: 'stalls', kind: 'rows', section: 'Stalls', tierName: 'A Reserve',
    color: '#0EA5E9', x: 100, y: 140, rows: 14,
    seatsPerRow: [18, 18, 20, 20, 22, 22, 24, 24, 24, 24, 22, 22, 20, 20],
    curveDepth: 22, rowSpacing: 26, seatSpacing: 22,
    accessibleSeats: ['N-1', 'N-2', 'N-19', 'N-20'], companionSeats: ['N-3', 'N-18'],
  },
  {
    id: 'balcony', kind: 'rows', section: 'Balcony', tierName: 'B Reserve',
    color: '#9C27B0', x: 130, y: 560, rows: 8, seatsPerRow: 24,
    rowLabelScheme: 'numeric', rowLabelStart: 1, curveDepth: 12,
  },
  {
    id: 'box-left', kind: 'rows', section: 'Boxes', tierName: 'Box seat',
    color: '#FF9800', x: 30, y: 200, rows: 2, seatsPerRow: 3,
    rowLabelStart: 'X', rotation: 90,
  },
  {
    id: 'box-right', kind: 'rows', section: 'Boxes', tierName: 'Box seat',
    color: '#FF9800', x: 680, y: 260, rows: 2, seatsPerRow: 3,
    rowLabelStart: 'Z', rotation: -90,
  },
]

// 3. Harbourside Gala: table seating. Twelve round tables of ten plus a
//    square head table of eight, sold per seat.
const GALA_BLOCKS = [
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `table-${i + 1}`, kind: 'table', shape: 'round',
    section: 'Gala floor', tierName: 'Gala seat', color: '#4CAF50',
    label: `Table ${i + 1}`, seats: 10,
    x: 140 + (i % 4) * 170, y: 190 + Math.floor(i / 4) * 170,
  })),
  {
    id: 'head-table', kind: 'table', shape: 'square', section: 'Head table',
    tierName: 'VIP table seat', color: '#FF9800', label: 'Head table', seats: 8,
    x: 395, y: 40, radius: 46,
  },
]

// 4. Performance chart: 1,200 seats (30 rows x 40), one section.
const ARENA_BLOCKS = [
  {
    id: 'arena', kind: 'rows', section: 'Arena', tierName: 'Arena seat',
    color: '#3F51B5', x: 80, y: 120, rows: 30, seatsPerRow: 40,
    rowSpacing: 24, seatSpacing: 22,
  },
]

const VENUES = [
  {
    key: 'cellar', name: 'The Cellar Comedy Room', city: 'Geelong', capacity: 40,
    blocks: CELLAR_BLOCKS, mapName: 'Cellar standard layout',
    events: [
      {
        key: 'comedy-paid', title: 'Cellar Comedy Night: Seated Season Opener',
        summary: 'A packed hour of stand-up in a 30-seat room. Pick your seat.',
        tiers: [
          { name: 'Cellar seat', price: 2500, cap: 30 },
          { name: 'Bar standing', price: 1500, cap: 10 },
        ],
      },
      {
        key: 'comedy-free', title: 'Cellar Open Mic: Free Seated Trial Night',
        summary: 'Free entry, allocated seats, new material night.',
        tiers: [
          { name: 'Cellar seat', price: 0, cap: 30 },
          { name: 'Bar standing', price: 0, cap: 10 },
        ],
      },
    ],
  },
  {
    key: 'regent', name: 'Regent Theatre Geelong', city: 'Geelong', capacity: 520,
    blocks: THEATRE_BLOCKS, mapName: 'Regent full house',
    events: [
      {
        key: 'theatre', title: 'Winter Gala Concert at the Regent',
        summary: 'A full orchestral night across stalls, balcony and boxes.',
        tiers: [
          { name: 'A Reserve', price: 8900, cap: 300 },
          { name: 'B Reserve', price: 6900, cap: 192 },
          { name: 'Box seat', price: 12000, cap: 12 },
        ],
      },
    ],
  },
  {
    key: 'gala', name: 'Harbourside Pavilion', city: 'Geelong', capacity: 140,
    blocks: GALA_BLOCKS, mapName: 'Gala dinner rounds',
    events: [
      {
        key: 'gala', title: 'Harbour Lights Charity Gala Dinner',
        summary: 'Black tie, ten to a table, seats allocated on booking.',
        tiers: [
          { name: 'Gala seat', price: 15000, cap: 120 },
          { name: 'VIP table seat', price: 25000, cap: 8 },
        ],
      },
    ],
  },
  {
    key: 'arena', name: 'Geelong Arena Hall', city: 'Geelong', capacity: 1300,
    blocks: ARENA_BLOCKS, mapName: 'Arena 1200 performance chart',
    events: [
      {
        key: 'arena', title: 'Arena Sessions: Large Room Performance Test',
        summary: 'A 1,200-seat chart for scale and performance proof.',
        tiers: [{ name: 'Arena seat', price: 4900, cap: 1200 }],
      },
    ],
  },
]

async function main() {
  // Cover image reused from the existing seeded catalogue (published events
  // must carry a real cover per the TEST constraint).
  const coverRes = await fetch(
    `${URL}/rest/v1/events?status=eq.published&select=cover_image_url&cover_image_url=not.is.null&limit=1`,
    { headers: H },
  )
  const cover = (await coverRes.json())[0]?.cover_image_url
  if (!cover) throw new Error('No cover available on TEST')

  const catRes = await fetch(`${URL}/rest/v1/event_categories?select=id,slug&slug=in.(comedy,music,community)`, { headers: H })
  const cats = Object.fromEntries((await catRes.json()).map(c => [c.slug, c.id]))

  const out = []
  for (const venueDef of VENUES) {
    const venueId = uuidFrom(`seatvenue:${venueDef.key}`)
    await upsert('venues', {
      id: venueId, organisation_id: ORG_ID, name: venueDef.name,
      city: venueDef.city, state: 'VIC', country: 'Australia',
      capacity: venueDef.capacity, is_active: true,
    })

    const layout = generateLayout(venueDef.blocks)
    const mapId = uuidFrom(`seatmap:${venueDef.key}`)
    await upsert('seat_maps', {
      id: mapId, venue_id: venueId, name: venueDef.mapName,
      layout, total_seats: layout.totalSeats, is_active: true,
    })
    for (const section of layout.sections) {
      await upsert(
        'seat_map_sections',
        {
          id: uuidFrom(`section:${venueDef.key}:${section.name}`),
          seat_map_id: mapId, name: section.name, color: section.color, sort_order: section.sort_order,
        },
        'seat_map_id,name',
      )
    }

    for (const eventDef of venueDef.events) {
      const eventId = uuidFrom(`seatevent:${eventDef.key}`)
      const slug = eventDef.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 70)
      const start = eventDef.key === 'comedy-free' ? '2026-08-14T09:30:00Z' : '2026-08-21T09:30:00Z'
      const end = eventDef.key === 'comedy-free' ? '2026-08-14T12:30:00Z' : '2026-08-21T13:00:00Z'
      await upsert('events', {
        id: eventId, title: eventDef.title, slug, summary: eventDef.summary,
        description: `${eventDef.summary} Reserved seating at ${venueDef.name}: pick your exact seat on the map. Doors 45 minutes before start.`,
        organisation_id: ORG_ID, created_by: OWNER_ID,
        category_id: cats.comedy ?? cats.music ?? null,
        start_date: start, end_date: end, timezone: 'Australia/Melbourne', event_type: 'in_person',
        venue_id: venueId, venue_name: venueDef.name, venue_city: venueDef.city,
        venue_state: 'VIC', venue_country: 'Australia',
        cover_image_url: cover, thumbnail_url: cover,
        status: 'published', visibility: 'public', published_at: '2026-07-05T00:00:00Z',
        is_age_restricted: false, max_capacity: eventDef.tiers.reduce((a, t) => a + t.cap, 0),
        tags: ['catalogue', 'seated-proof'], fee_pass_type: 'pass_to_buyer',
        is_free: eventDef.tiers.every(t => t.price === 0), is_seed_data: true,
        has_reserved_seating: true, seat_map_id: mapId,
      })

      for (const [ti, tier] of eventDef.tiers.entries()) {
        await upsert('ticket_tiers', {
          id: uuidFrom(`seattier:${eventDef.key}:${tier.name}`),
          event_id: eventId, name: tier.name, description: `${tier.name}`,
          tier_type: 'general_admission', price: tier.price, currency: 'AUD',
          total_capacity: tier.cap, sold_count: 0, reserved_count: 0,
          min_per_order: 1, max_per_order: 10, sort_order: ti,
          is_visible: true, is_active: true, dynamic_pricing_enabled: false,
          requires_access_code: false,
        })
      }

      const count = await rpc('materialize_seats', { p_event_id: eventId, p_seat_map_id: mapId })
      out.push({ event: eventDef.key, slug, eventId, mapId, seats: Number(count), areas: layout.areas.length })
    }
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch(e => {
  console.error('[seed-seated] FATAL', e.message)
  process.exit(1)
})
