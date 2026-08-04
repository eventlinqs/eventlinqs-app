/**
 * Seeds the seating FINAL BUILD proof set on TEST: five rooms proving the
 * five founder corrections and the restraint rules.
 *
 *   final-theatre    - the three-block theatre: one stalls band punched by
 *                      two vertical aisles (the aisle primitive drives the
 *                      gaps), deliberate taper 0.5, rows A to O so the
 *                      dash convention shows I- and O-, accessible and
 *                      companion seats in place.
 *   final-two-block  - the approved room-proof geometry: 500 seats, two
 *                      mirrored 10 x 25 blocks split by one centre aisle,
 *                      SKIP lettering (no I, no O, rollover to AA).
 *   final-cabaret    - twelve round tables and four square, two tiers.
 *   final-mixed      - a seated grandstand split by a centre aisle plus a
 *                      general admission zone behind it.
 *   final-four-tier  - four stacked bands, one ticket tier each, so the
 *                      four editorial hues prove calm together.
 *
 * Every room gets ~30% sold (front-weighted, deterministic) and a handful
 * of house holds so the contrast states are visible in every capture.
 *
 * TEST only (hard guard). Idempotent: deterministic ids, existing rows
 * kept, statuses repainted on every run.
 * Run: node --experimental-strip-types scripts/seed-seating-final.mjs
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

/** Deterministic [0,1) from a string: the sold pattern never wanders. */
function unitRand(str) {
  return parseInt(createHash('md5').update(str).digest('hex').slice(0, 8), 16) / 0x100000000
}

async function q(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: H })
  const body = await res.json()
  if (!res.ok) throw new Error(`GET ${path.slice(0, 80)}: ${JSON.stringify(body).slice(0, 200)}`)
  return body
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

async function patchSeats(eventId, ids, patch) {
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80)
    const res = await fetch(
      `${URL}/rest/v1/seats?event_id=eq.${eventId}&id=in.(${chunk.join(',')})`,
      { method: 'PATCH', headers: H, body: JSON.stringify(patch) },
    )
    if (!res.ok) throw new Error(`seats patch failed: ${(await res.text()).slice(0, 200)}`)
  }
}

async function rpc(name, args) {
  const res = await fetch(`${URL}/rest/v1/rpc/${name}`, { method: 'POST', headers: H, body: JSON.stringify(args) })
  const text = await res.text()
  if (!res.ok) throw new Error(`${name} failed: ${text.slice(0, 300)}`)
  return text
}

// ── Room A: the three-block theatre ─────────────────────────────────────────
const THEATRE_BLOCKS = [
  { id: 'ft-stage', kind: 'stage', section: '', shape: 'proscenium', x: 370, y: -14, width: 352, depth: 64 },
  {
    id: 'ft-stalls', kind: 'rows', section: 'Stalls', tierName: 'Stalls',
    color: '#1F5673', x: 80, y: 120, rows: 15, seatsPerRow: 30, taper: 0.5,
    align: 'centre', rowSpacing: 26, seatSpacing: 24,
    accessibleSeats: ['A-1', 'A-2', 'O-1'], companionSeats: ['A-3', 'O-2'],
  },
  { id: 'ft-aisle-w', kind: 'aisle', section: '', orientation: 'vertical', x: 350, y: 90, length: 440, width: 34 },
  { id: 'ft-aisle-e', kind: 'aisle', section: '', orientation: 'vertical', x: 650, y: 90, length: 440, width: 34 },
  { id: 'ft-entrance', kind: 'object', section: '', object: 'entrance', x: 470, y: 580, width: 120, height: 30 },
  { id: 'ft-exit-w', kind: 'object', section: '', object: 'exit', x: -70, y: 20, width: 70, height: 28 },
  { id: 'ft-exit-e', kind: 'object', section: '', object: 'exit', x: 1030, y: 20, width: 70, height: 28 },
]

// ── Room B: the approved two-block room, skip lettering ─────────────────────
const TWO_BLOCK_BLOCKS = [
  { id: 'tb-stage', kind: 'stage', section: '', shape: 'proscenium', x: 188, y: -18, width: 320, depth: 58 },
  {
    id: 'tb-house', kind: 'rows', section: 'House', tierName: 'House seat',
    color: '#1F5673', x: 100, y: 100, rows: 25, seatsPerRow: 20,
    rowSpacing: 24, seatSpacing: 24, rowLetterConvention: 'skip',
    accessibleSeats: ['A-1', 'A-20'], companionSeats: ['A-2'],
  },
  { id: 'tb-aisle', kind: 'aisle', section: '', orientation: 'vertical', x: 330, y: 80, length: 700, width: 40 },
]

// ── Room C: the cabaret room ────────────────────────────────────────────────
const CABARET_BLOCKS = [
  { id: 'cb-stage', kind: 'stage', section: '', shape: 'band', x: 90, y: -20, width: 760, depth: 56 },
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `cb-front-${i + 1}`,
    kind: 'table',
    section: 'Floor Tables',
    tierName: 'Front table',
    color: '#7A1F3D',
    shape: 'round',
    label: `Table ${i + 1}`,
    seats: 10,
    x: 170 + (i % 4) * 200 + (Math.floor(i / 4) % 2) * 100,
    y: 170 + Math.floor(i / 4) * 190,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `cb-rear-${i + 1}`,
    kind: 'table',
    section: 'Rear Tables',
    tierName: 'Rear table',
    color: '#3A4675',
    shape: 'round',
    label: `Table ${i + 9}`,
    seats: 10,
    x: 170 + i * 200,
    y: 550,
  })),
  ...Array.from({ length: 4 }, (_, i) => ({
    id: `cb-square-${i + 1}`,
    kind: 'table',
    section: 'Rear Tables',
    tierName: 'Rear table',
    color: '#3A4675',
    shape: 'square',
    label: `Table ${i + 13}`,
    seats: 8,
    radius: 44,
    x: 170 + i * 200,
    y: 720,
  })),
]

// ── Room D: the mixed room, seated blocks plus a GA zone ────────────────────
const MIXED_BLOCKS = [
  { id: 'mx-stage', kind: 'stage', section: '', shape: 'band', x: 100, y: -16, width: 620, depth: 54 },
  {
    id: 'mx-grandstand', kind: 'rows', section: 'Grandstand', tierName: 'Grandstand seat',
    color: '#1F5673', x: 110, y: 110, rows: 8, seatsPerRow: 22,
    rowSpacing: 26, seatSpacing: 24, accessibleSeats: ['A-1', 'A-22'],
  },
  { id: 'mx-aisle', kind: 'aisle', section: '', orientation: 'vertical', x: 362, y: 90, length: 300, width: 38 },
  {
    id: 'mx-lawn', kind: 'area', section: 'The Lawn', tierName: 'The Lawn',
    color: '#215E5E', label: 'General admission', x: 140, y: 380, width: 500, height: 130, capacity: 250,
  },
]

// ── Room E: the four-tier room ──────────────────────────────────────────────
const FOUR_TIER_BLOCKS = [
  { id: 'fq-stage', kind: 'stage', section: '', shape: 'proscenium', x: 220, y: -16, width: 340, depth: 60 },
  {
    id: 'fq-premium', kind: 'rows', section: 'Premium Stalls', tierName: 'Premium',
    color: '#1F5673', x: 116, y: 110, rows: 6, seatsPerRow: 24, align: 'centre',
    rowSpacing: 25, seatSpacing: 23, accessibleSeats: ['A-1', 'A-24'],
  },
  {
    id: 'fq-stalls', kind: 'rows', section: 'Stalls', tierName: 'A Reserve',
    color: '#7A1F3D', x: 93, y: 300, rows: 6, seatsPerRow: 26, align: 'centre',
    rowLabelStart: 'G', rowSpacing: 25, seatSpacing: 23,
  },
  {
    id: 'fq-lower', kind: 'rows', section: 'Lower Balcony', tierName: 'B Reserve',
    color: '#2D5A3D', x: 70, y: 490, rows: 5, seatsPerRow: 28, align: 'centre',
    rowLabelStart: 'N', rowSpacing: 25, seatSpacing: 23,
  },
  {
    id: 'fq-upper', kind: 'rows', section: 'Upper Balcony', tierName: 'C Reserve',
    color: '#9A3E1C', x: 47, y: 655, rows: 5, seatsPerRow: 30, align: 'centre',
    rowLabelStart: 'T', rowSpacing: 25, seatSpacing: 23,
  },
]

const VENUES = [
  {
    key: 'theatre', name: 'Final Theatre Proof Room', city: 'Geelong', capacity: 520,
    blocks: THEATRE_BLOCKS, mapName: 'Final three-block theatre',
    soldShare: 0.3, holds: 8,
    event: {
      key: 'final-theatre', title: 'Final Proof: Three Block Theatre',
      summary: 'One stalls band split by two real aisles into three blocks, a deliberate raked taper, rows A to O.',
      tiers: [{ name: 'Stalls', price: 8900, cap: 520, min: 1 }],
    },
  },
  {
    key: 'twoblock', name: 'Final Two Block Proof Room', city: 'Melbourne', capacity: 500,
    blocks: TWO_BLOCK_BLOCKS, mapName: 'Final two-block house',
    soldShare: 0.3, holds: 6,
    event: {
      key: 'final-two-block', title: 'Final Proof: Two Block House',
      summary: 'The approved five hundred seat room: two mirrored blocks, one centre aisle, skip lettering.',
      tiers: [{ name: 'House seat', price: 6900, cap: 500, min: 1 }],
    },
  },
  {
    key: 'cabaret', name: 'Final Cabaret Proof Room', city: 'Melbourne', capacity: 160,
    blocks: CABARET_BLOCKS, mapName: 'Final cabaret floor',
    soldShare: 0.3, holds: 4,
    event: {
      key: 'final-cabaret', title: 'Final Proof: Cabaret Floor',
      summary: 'Sixteen tables on a cabaret floor: twelve round, four square, two tiers.',
      tiers: [
        { name: 'Front table', price: 12900, cap: 80, min: 1 },
        { name: 'Rear table', price: 9900, cap: 72, min: 1 },
      ],
    },
  },
  {
    key: 'mixed', name: 'Final Mixed Proof Room', city: 'Geelong', capacity: 430,
    blocks: MIXED_BLOCKS, mapName: 'Final mixed floor',
    soldShare: 0.3, holds: 5,
    event: {
      key: 'final-mixed', title: 'Final Proof: Grandstand and Lawn',
      summary: 'A seated grandstand split by a centre aisle, with a general admission lawn behind it.',
      tiers: [
        { name: 'Grandstand seat', price: 7900, cap: 176, min: 1 },
        { name: 'The Lawn', price: 4900, cap: 250, min: 1 },
      ],
    },
  },
  {
    key: 'fourtier', name: 'Final Four Tier Proof Room', city: 'Melbourne', capacity: 600,
    blocks: FOUR_TIER_BLOCKS, mapName: 'Final four-tier house',
    soldShare: 0.3, holds: 8,
    event: {
      key: 'final-four-tier', title: 'Final Proof: Four Tier House',
      summary: 'Four stacked bands, one ticket tier each, so the editorial hues prove calm together.',
      tiers: [
        { name: 'Premium', price: 14900, cap: 144, min: 1 },
        { name: 'A Reserve', price: 11900, cap: 156, min: 1 },
        { name: 'B Reserve', price: 8900, cap: 140, min: 1 },
        { name: 'C Reserve', price: 5900, cap: 150, min: 1 },
      ],
    },
  },
]

async function main() {
  const cover = (
    await q('events?status=eq.published&select=cover_image_url&cover_image_url=not.is.null&limit=1')
  )[0]?.cover_image_url
  if (!cover) throw new Error('No cover available on TEST')
  const cats = Object.fromEntries(
    (await q('event_categories?select=id,slug&slug=in.(music,comedy,community)')).map(c => [c.slug, c.id]),
  )

  const out = []
  for (const venueDef of VENUES) {
    const venueId = uuidFrom(`finalvenue:${venueDef.key}`)
    await upsert('venues', {
      id: venueId, organisation_id: ORG_ID, name: venueDef.name,
      city: venueDef.city, state: 'VIC', country: 'Australia',
      capacity: venueDef.capacity, is_active: true,
    })

    const layout = generateLayout(venueDef.blocks)
    const mapId = uuidFrom(`finalmap:${venueDef.key}`)
    await upsert('seat_maps', {
      id: mapId, venue_id: venueId, name: venueDef.mapName,
      layout, total_seats: layout.totalSeats, is_active: true,
    })
    for (const section of layout.sections) {
      await upsert(
        'seat_map_sections',
        {
          id: uuidFrom(`finalsection:${venueDef.key}:${section.name}`),
          seat_map_id: mapId, name: section.name, color: section.color, sort_order: section.sort_order,
        },
        'seat_map_id,name',
      )
    }

    const eventDef = venueDef.event
    const eventId = uuidFrom(`finalevent:${eventDef.key}`)
    const slug = eventDef.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 70)
    await upsert('events', {
      id: eventId, title: eventDef.title, slug, summary: eventDef.summary,
      description: `${eventDef.summary} Reserved seating at ${venueDef.name}: pick your exact seat on the plan.`,
      organisation_id: ORG_ID, created_by: OWNER_ID,
      category_id: cats.music ?? cats.comedy ?? null,
      start_date: '2026-09-04T09:30:00Z', end_date: '2026-09-04T13:00:00Z',
      timezone: 'Australia/Melbourne', event_type: 'in_person',
      venue_id: venueId, venue_name: venueDef.name, venue_city: venueDef.city,
      venue_state: 'VIC', venue_country: 'Australia',
      cover_image_url: cover, thumbnail_url: cover,
      status: 'published', visibility: 'public', published_at: '2026-07-25T00:00:00Z',
      is_age_restricted: false, max_capacity: eventDef.tiers.reduce((a, t) => a + t.cap, 0),
      tags: ['catalogue', 'final-proof'], fee_pass_type: 'pass_to_buyer',
      is_free: false, is_seed_data: true,
      has_reserved_seating: true, seat_map_id: mapId,
    })

    for (const [ti, tier] of eventDef.tiers.entries()) {
      await upsert('ticket_tiers', {
        id: uuidFrom(`finaltier:${eventDef.key}:${tier.name}`),
        event_id: eventId, name: tier.name, description: tier.name,
        tier_type: 'general_admission', price: tier.price, currency: 'AUD',
        total_capacity: tier.cap, sold_count: 0, reserved_count: 0,
        min_per_order: tier.min, max_per_order: 10, sort_order: ti,
        is_visible: true, is_active: true, dynamic_pricing_enabled: false,
        requires_access_code: false,
      })
    }

    const count = await rpc('materialize_seats', { p_event_id: eventId, p_seat_map_id: mapId })

    // ── Paint the states: ~30% sold, front-weighted, deterministic; a
    // handful of house holds; everything else reset to available so the
    // seeder is honestly idempotent. ──
    const seats = await q(
      `seats?event_id=eq.${eventId}&select=id,row_label,seat_number,y,seat_type&order=y.asc&limit=3000`,
    )
    const ys = seats.map(s => s.y)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const span = Math.max(1, maxY - minY)
    const sold = []
    const heldPick = []
    const avail = []
    for (const s of seats) {
      const t = (s.y - minY) / span
      const p = venueDef.soldShare * (1.7 - 1.4 * t) // front-weighted, mean = soldShare
      const r = unitRand(`${eventDef.key}:${s.id}`)
      if (s.seat_type !== 'accessible' && r < p) sold.push(s.id)
      else if (heldPick.length < venueDef.holds && s.seat_type !== 'accessible' && t > 0.2 && t < 0.5 && r < p + 0.06) heldPick.push(s.id)
      else avail.push(s.id)
    }
    await patchSeats(eventId, avail, { status: 'available', held_reason: null })
    await patchSeats(eventId, sold, { status: 'sold' })
    await patchSeats(eventId, heldPick, { status: 'held', held_reason: 'House hold' })

    out.push({
      event: eventDef.key, slug, eventId, mapId,
      totalSeats: layout.totalSeats, materialized: Number(count),
      sold: sold.length, held: heldPick.length,
      soldShare: +(sold.length / Math.max(1, seats.length)).toFixed(3),
    })
  }
  console.log(JSON.stringify(out, null, 2))
}

main().catch(e => {
  console.error('[seed-final] FATAL', e.message)
  process.exit(1)
})
