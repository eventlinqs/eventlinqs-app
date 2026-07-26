/**
 * Seeds the seat-map REBUILD proof set on TEST: three rooms exercising every
 * new primitive (stage geometry, aisles punched through blocks, stagger,
 * uneven rows, rotated galleries, all ten venue objects plus text and icon,
 * a Group-of-3 ticket via min_per_order) at 500, 2000 and 5000 seats, each
 * attached to a published event on the payment-ready test organisation.
 *
 * TEST only (hard guard). Idempotent: deterministic ids, existing rows kept.
 * Run: node --experimental-strip-types scripts/seed-seating-rebuild.mjs
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

// ── Room 1: the Play House, ~500 seats, EVERY primitive on one sheet ────────
// One wide stalls block with TWO vertical aisles punched through it and one
// horizontal cross aisle, staggered uneven rows, two rotated side galleries,
// a numeric balcony, a Group-of-3 terrace, a GA standing band, the
// proscenium stage, all ten venue objects, a text caption and a free icon.
const PLAYHOUSE_BLOCKS = [
  {
    id: 'ph-stage', kind: 'stage', section: '', shape: 'proscenium',
    x: 180, y: -20, width: 380, depth: 72,
  },
  {
    id: 'ph-stalls', kind: 'rows', section: 'Stalls', tierName: 'A Reserve',
    color: '#1F5673', x: 120, y: 130, rows: 16,
    seatsPerRow: [18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24, 24, 24, 24],
    align: 'centre', stagger: 8, curveDepth: 12, rowSpacing: 26, seatSpacing: 23,
    accessibleSeats: ['P-1', 'P-2'], companionSeats: ['P-3'],
  },
  { id: 'ph-aisle-left', kind: 'aisle', section: '', orientation: 'vertical', x: 288, y: 110, length: 460, width: 30 },
  { id: 'ph-aisle-right', kind: 'aisle', section: '', orientation: 'vertical', x: 470, y: 110, length: 460, width: 30 },
  { id: 'ph-cross', kind: 'aisle', section: '', orientation: 'horizontal', x: 90, y: 336, length: 620, width: 34 },
  {
    id: 'ph-gallery-west', kind: 'rows', section: 'West Gallery', tierName: 'B Reserve',
    color: '#7A1F3D', x: 30, y: 200, rows: 3, seatsPerRow: 8, rotation: 90, rowLabelStart: 'W',
  },
  {
    id: 'ph-gallery-east', kind: 'rows', section: 'East Gallery', tierName: 'B Reserve',
    color: '#7A1F3D', x: 760, y: 390, rows: 3, seatsPerRow: 8, rotation: -90, rowLabelStart: 'E',
  },
  {
    id: 'ph-balcony', kind: 'rows', section: 'Balcony', tierName: 'C Reserve',
    color: '#2D5A3D', x: 150, y: 640, rows: 4, seatsPerRow: 22,
    rowLabelScheme: 'numeric', rowLabelStart: 1, rowOrder: 'up', seatOrder: 'rtl',
    align: 'centre', curveDepth: 8,
  },
  {
    id: 'ph-terrace', kind: 'rows', section: 'Group Terrace', tierName: 'Group of 3',
    color: '#9A3E1C', x: 240, y: 780, rows: 2, seatsPerRow: 12, rowLabelStart: 'T', align: 'centre',
  },
  {
    id: 'ph-ga', kind: 'area', section: 'Standing', tierName: 'Standing',
    color: '#215E5E', label: 'General admission', x: 150, y: 862, width: 420, height: 64, capacity: 60,
  },
  // The ten venue objects, the text caption and the free icon.
  { id: 'ph-bar', kind: 'object', section: '', object: 'bar', x: 800, y: 130, width: 64, height: 64, label: 'Long bar' },
  { id: 'ph-food', kind: 'object', section: '', object: 'food', x: 800, y: 210, width: 64, height: 64, label: 'Food stalls' },
  { id: 'ph-toilet', kind: 'object', section: '', object: 'toilet', x: 800, y: 290, width: 64, height: 64, label: 'Toilets' },
  { id: 'ph-lift', kind: 'object', section: '', object: 'lift', x: 800, y: 630, width: 64, height: 64, label: 'Lift' },
  { id: 'ph-entrance', kind: 'object', section: '', object: 'entrance', x: -60, y: 620, width: 64, height: 64, label: 'Entrance' },
  { id: 'ph-exit', kind: 'object', section: '', object: 'exit', x: -60, y: 130, width: 64, height: 64, label: 'Exit' },
  { id: 'ph-stairs', kind: 'object', section: '', object: 'stairs', x: -60, y: 380, width: 64, height: 64, label: 'Stairs' },
  { id: 'ph-balc-obj', kind: 'object', section: '', object: 'balcony', x: 800, y: 470, width: 64, height: 64, label: 'Balcony' },
  { id: 'ph-box', kind: 'object', section: '', object: 'box', x: 800, y: 550, width: 64, height: 64, label: 'Box' },
  { id: 'ph-rail', kind: 'object', section: '', object: 'rail', x: 800, y: 390, width: 64, height: 64, label: 'Standing rail' },
  { id: 'ph-caption', kind: 'text', section: '', text: 'Balcony centre', x: 380, y: 620, size: 14 },
  { id: 'ph-icon', kind: 'icon', section: '', object: 'stairs', x: 730, y: 620, size: 30 },
]

// ── Room 2: the Grand Hall, exactly 2000 seats, five sections ───────────────
const GRAND_BLOCKS = [
  {
    id: 'gh-stage', kind: 'stage', section: '', shape: 'proscenium',
    x: 340, y: -30, width: 560, depth: 84,
  },
  {
    id: 'gh-stalls', kind: 'rows', section: 'Premium Stalls', tierName: 'Premium Stalls',
    color: '#1F5673', x: 160, y: 140, rows: 26,
    seatsPerRow: [30, 30, 31, 31, 32, 32, 33, 33, 34, 34, 35, 35, 36, 36, 36, 36, 35, 35, 34, 34, 36, 36, 38, 38, 40, 40],
    align: 'centre', stagger: 9, curveDepth: 20, curveBack: 6, rowSpacing: 25, seatSpacing: 22,
  },
  { id: 'gh-aisle-l', kind: 'aisle', section: '', orientation: 'vertical', x: 420, y: 120, length: 700, width: 30 },
  { id: 'gh-aisle-r', kind: 'aisle', section: '', orientation: 'vertical', x: 700, y: 120, length: 700, width: 30 },
  { id: 'gh-cross', kind: 'aisle', section: '', orientation: 'horizontal', x: 120, y: 465, length: 940, width: 32 },
  {
    id: 'gh-royal', kind: 'rows', section: 'Royal Circle', tierName: 'Royal Circle',
    color: '#5B2A5E', x: 360, y: 850, rows: 2, seatsPerRow: 30, rowLabelStart: 'R', align: 'centre', curveDepth: 8,
  },
  {
    id: 'gh-lower', kind: 'rows', section: 'Lower Balcony', tierName: 'A Reserve',
    color: '#2D5A3D', x: 250, y: 940, rows: 12, seatsPerRow: 40,
    rowLabelScheme: 'numeric', rowLabelStart: 1, align: 'centre', curveDepth: 12, stagger: 7,
  },
  {
    id: 'gh-upper', kind: 'rows', section: 'Upper Balcony', tierName: 'B Reserve',
    color: '#9A3E1C', x: 210, y: 1290, rows: 12, seatsPerRow: 44,
    rowLabelScheme: 'numeric', rowLabelStart: 13, align: 'centre', curveDepth: 8,
  },
  {
    id: 'gh-box-w', kind: 'rows', section: 'Boxes', tierName: 'Box seat',
    color: '#8C3B2E', x: 60, y: 240, rows: 4, seatsPerRow: 6, rotation: 90, rowLabelStart: 'V',
  },
  {
    id: 'gh-box-e', kind: 'rows', section: 'Boxes', tierName: 'Box seat',
    color: '#8C3B2E', x: 1180, y: 380, rows: 4, seatsPerRow: 6, rotation: -90, rowLabelStart: 'Z',
  },
  { id: 'gh-entrance', kind: 'object', section: '', object: 'entrance', x: 40, y: 1500, width: 60, height: 60, label: 'Entrance' },
  { id: 'gh-exit', kind: 'object', section: '', object: 'exit', x: 1180, y: 1500, width: 60, height: 60, label: 'Exit' },
  { id: 'gh-stairs', kind: 'object', section: '', object: 'stairs', x: 40, y: 900, width: 60, height: 60, label: 'Stairs' },
  { id: 'gh-bar', kind: 'object', section: '', object: 'bar', x: 1180, y: 900, width: 60, height: 60, label: 'Circle bar' },
]

// ── Room 3: Endurance Hall, 5000 seats, the frame-time proof ────────────────
const ENDURANCE_BLOCKS = [
  {
    id: 'eh-stage', kind: 'stage', section: '', shape: 'band',
    x: 100, y: -20, width: 1300, depth: 64,
  },
  {
    id: 'eh-floor', kind: 'rows', section: 'Floor', tierName: 'Endurance seat',
    color: '#1F5673', x: 120, y: 120, rows: 50, seatsPerRow: 60, rowSpacing: 24, seatSpacing: 22,
  },
  { id: 'eh-aisle', kind: 'aisle', section: '', orientation: 'vertical', x: 770, y: 100, length: 1250, width: 36 },
  {
    id: 'eh-tier', kind: 'rows', section: 'Tier Two', tierName: 'Endurance seat',
    color: '#2D5A3D', x: 60, y: 1380, rows: 25, seatsPerRow: 80,
    rowLabelScheme: 'numeric', rowLabelStart: 1, rowSpacing: 24, seatSpacing: 21,
  },
]

const VENUES = [
  {
    key: 'playhouse', name: 'Play House Proof Room', city: 'Geelong', capacity: 560,
    blocks: PLAYHOUSE_BLOCKS, mapName: 'Play House rebuild chart',
    event: {
      key: 'rebuild-500', title: 'Play House Proof: A Seated Evening',
      summary: 'Around five hundred seats: stalls split by real aisles, galleries, balcony, terrace groups and a standing band.',
      tiers: [
        { name: 'A Reserve', price: 12900, cap: 342, min: 1 },
        { name: 'B Reserve', price: 8900, cap: 48, min: 1 },
        { name: 'C Reserve', price: 5900, cap: 88, min: 1 },
        { name: 'Group of 3', price: 4900, cap: 24, min: 3 },
        { name: 'Standing', price: 3900, cap: 60, min: 1 },
      ],
    },
  },
  {
    key: 'grandhall', name: 'Grand Hall Proof Room', city: 'Melbourne', capacity: 2100,
    blocks: GRAND_BLOCKS, mapName: 'Grand Hall two thousand',
    event: {
      key: 'rebuild-2000', title: 'Grand Hall Proof: The Full House',
      summary: 'Two thousand seats across five sections, punched aisles, staggered rows, boxes and balconies.',
      tiers: [
        { name: 'Premium Stalls', price: 14900, cap: 880, min: 1 },
        { name: 'Royal Circle', price: 12900, cap: 60, min: 1 },
        { name: 'A Reserve', price: 9900, cap: 480, min: 1 },
        { name: 'B Reserve', price: 6900, cap: 528, min: 1 },
        { name: 'Box seat', price: 17900, cap: 48, min: 1 },
      ],
    },
  },
  {
    key: 'endurance', name: 'Endurance Hall Proof Room', city: 'Melbourne', capacity: 5200,
    blocks: ENDURANCE_BLOCKS, mapName: 'Endurance five thousand',
    event: {
      key: 'rebuild-5000', title: 'Endurance Hall: Five Thousand Seats',
      summary: 'The frame-time proof room: five thousand chairs on one sheet.',
      tiers: [{ name: 'Endurance seat', price: 4900, cap: 5000, min: 1 }],
    },
  },
]

async function main() {
  const coverRes = await fetch(
    `${URL}/rest/v1/events?status=eq.published&select=cover_image_url&cover_image_url=not.is.null&limit=1`,
    { headers: H },
  )
  const cover = (await coverRes.json())[0]?.cover_image_url
  if (!cover) throw new Error('No cover available on TEST')

  const catRes = await fetch(`${URL}/rest/v1/event_categories?select=id,slug&slug=in.(music,comedy,community)`, { headers: H })
  const cats = Object.fromEntries((await catRes.json()).map(c => [c.slug, c.id]))

  const out = []
  for (const venueDef of VENUES) {
    const venueId = uuidFrom(`rebuildvenue:${venueDef.key}`)
    await upsert('venues', {
      id: venueId, organisation_id: ORG_ID, name: venueDef.name,
      city: venueDef.city, state: 'VIC', country: 'Australia',
      capacity: venueDef.capacity, is_active: true,
    })

    const layout = generateLayout(venueDef.blocks)
    const mapId = uuidFrom(`rebuildmap:${venueDef.key}`)
    await upsert('seat_maps', {
      id: mapId, venue_id: venueId, name: venueDef.mapName,
      layout, total_seats: layout.totalSeats, is_active: true,
    })
    for (const section of layout.sections) {
      await upsert(
        'seat_map_sections',
        {
          id: uuidFrom(`rebuildsection:${venueDef.key}:${section.name}`),
          seat_map_id: mapId, name: section.name, color: section.color, sort_order: section.sort_order,
        },
        'seat_map_id,name',
      )
    }

    const eventDef = venueDef.event
    const eventId = uuidFrom(`rebuildevent:${eventDef.key}`)
    const slug = eventDef.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 70)
    await upsert('events', {
      id: eventId, title: eventDef.title, slug, summary: eventDef.summary,
      description: `${eventDef.summary} Reserved seating at ${venueDef.name}: pick your exact seat on the plan.`,
      organisation_id: ORG_ID, created_by: OWNER_ID,
      category_id: cats.music ?? cats.comedy ?? null,
      start_date: '2026-08-28T09:30:00Z', end_date: '2026-08-28T13:00:00Z',
      timezone: 'Australia/Melbourne', event_type: 'in_person',
      venue_id: venueId, venue_name: venueDef.name, venue_city: venueDef.city,
      venue_state: 'VIC', venue_country: 'Australia',
      cover_image_url: cover, thumbnail_url: cover,
      status: 'published', visibility: 'public', published_at: '2026-07-20T00:00:00Z',
      is_age_restricted: false, max_capacity: eventDef.tiers.reduce((a, t) => a + t.cap, 0),
      tags: ['catalogue', 'rebuild-proof'], fee_pass_type: 'pass_to_buyer',
      is_free: false, is_seed_data: true,
      has_reserved_seating: true, seat_map_id: mapId,
    })

    for (const [ti, tier] of eventDef.tiers.entries()) {
      await upsert('ticket_tiers', {
        id: uuidFrom(`rebuildtier:${eventDef.key}:${tier.name}`),
        event_id: eventId, name: tier.name, description: tier.name,
        tier_type: 'general_admission', price: tier.price, currency: 'AUD',
        total_capacity: tier.cap, sold_count: 0, reserved_count: 0,
        min_per_order: tier.min, max_per_order: 10, sort_order: ti,
        is_visible: true, is_active: true, dynamic_pricing_enabled: false,
        requires_access_code: false,
      })
    }

    const count = await rpc('materialize_seats', { p_event_id: eventId, p_seat_map_id: mapId })
    out.push({ event: eventDef.key, slug, eventId, mapId, totalSeats: layout.totalSeats, materialized: Number(count) })
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch(e => {
  console.error('[seed-rebuild] FATAL', e.message)
  process.exit(1)
})
