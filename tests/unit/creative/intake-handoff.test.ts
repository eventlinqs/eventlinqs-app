import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntakeInput } from '@/lib/creative/intake'
import { goHop } from '@/lib/social/go-hop'
import { listingCta } from '@/lib/social/plan'
import { toBookingLink, type BookingLinkRow } from '@/lib/events/booking-links'

/*
 * THE HANDOFF TO PUBLISHING AND THE GATES AGAIN BEFORE IT (the founder's section F; the PM's 12:18, items 2 and 3). Car A's
 * own functions over an in-memory database: a received record that passes becomes ONE piece of kind 'creative' with its
 * first revision, unapproved; a record that fails is held with its reasons and NOTHING is drawn in its place; and at
 * publishing the record's gates run again, so a piece whose image lost its permission, or a network the record does not
 * name, is held with the reason and the publisher is never called.
 */
const STORAGE = 'https://gndnldyfudbytbboxesk.supabase.co'
const ORIGIN = 'https://www.eventlinqs.com.au'
const EVENT = '3f6f2d8e-5c1b-4a7e-9d2c-1b2a3c4d5e6f'
const VENUE = 'a1b2c3d4-0000-4000-8000-000000000001'
const DESIGN = `${STORAGE}/storage/v1/object/public/event-images/creative/0b5c3c8e-1d6f-4b4e-9a51-8a2f1c7d9e10/cover-1.jpg`
const PHOTO = `${STORAGE}/storage/v1/object/public/event-images/org/sanity/circle.jpg`
const TICKETS = 'https://www.trybooking.com/BXYZ'
const RECEIVED = new Date('2026-11-23T22:00:00.000Z') // Tuesday 24 November, 09:00 in Melbourne

const hoisted = vi.hoisted(() => ({
  row: {
    id: 'b0000000-0000-4000-8000-000000000001', provider: 'trybooking', url: 'https://www.trybooking.com/BXYZ', kind: 'tickets', availability: 'on_sale',
    price_from_cents: null, price_checked_at: null, is_primary: true, set_by: 'organiser', pointed_to_by_organiser: true, position: 0, created_at: '2026-11-01T00:00:00.000Z',
  },
}))
vi.mock('@/lib/events/booking-links-read', async () => {
  const { toBookingLink } = await import('@/lib/events/booking-links')
  return { readBookingLinks: async () => [toBookingLink(hoisted.row as never)] }
})
const linkRow = hoisted.row as unknown as BookingLinkRow
const SELLER = listingCta([toBookingLink(linkRow)], false).where as string

type Row = Record<string, unknown>

/** An in-memory database answering the chains Car A and the intake make; an unknown function answers nothing. */
function memoryDb(tables: Record<string, Row[]>, rpcs: Record<string, (args: Row) => unknown>) {
  let seq = 0
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
  const DEFAULTS: Record<string, () => Row> = {
    creative_intake: () => ({ state: 'received', check_reasons: [], piece_id: null, checked_at: null, checked_stage: null, received_at: RECEIVED.toISOString() }),
    social_piece_schedules: () => ({ state: 'scheduled', submission_ref: null, held_reason: null, published_ref: null }),
  }
  const query = (table: string) => {
    const tests: ((r: Row) => boolean)[] = []
    let sort: { key: string; up: boolean } | null = null
    let cap = Number.POSITIVE_INFINITY
    let skip = 0
    let one: 'maybe' | 'single' | null = null
    let op: { kind: 'select' } | { kind: 'insert'; rows: Row[] } | { kind: 'upsert'; rows: Row[]; on: string[]; ignore: boolean } | { kind: 'update'; patch: Row } | { kind: 'delete' } = { kind: 'select' }
    let returning = false
    const time = (v: unknown) => Date.parse(String(v))
    const run = () => {
      const all = (tables[table] ??= [])
      if (op.kind === 'insert' || op.kind === 'upsert') {
        const made: Row[] = []
        for (const r of op.rows) {
          if (op.kind === 'upsert') {
            const keys = op.on
            const hit = all.find((x) => keys.every((k) => String(x[k]) === String(r[k])))
            if (hit) {
              if (!op.ignore) Object.assign(hit, r)
              continue
            }
          }
          const row = { id: id(), ...(DEFAULTS[table]?.() ?? {}), ...r }
          all.push(row)
          made.push(row)
        }
        return { data: one ? (made[0] ?? null) : returning ? made : null, error: null }
      }
      const rows = all.filter((r) => tests.every((t) => t(r)))
      if (op.kind === 'update') {
        for (const r of rows) Object.assign(r, op.patch)
        return { data: null, error: null }
      }
      if (op.kind === 'delete') {
        tables[table] = all.filter((r) => !rows.includes(r))
        return { data: null, error: null }
      }
      const at = (r: Row, k: string) => String(r[k] ?? '')
      const sorted = sort ? [...rows].sort((a, b) => (sort!.up ? 1 : -1) * at(a, sort!.key).localeCompare(at(b, sort!.key), 'en', { numeric: true })) : rows
      const kept = sorted.slice(skip, skip + cap)
      if (one) return { data: kept[0] ?? null, error: one === 'single' && !kept[0] ? { message: 'no row' } : null }
      return { data: kept, error: null }
    }
    const q = {
      select: () => ((returning = true), q),
      eq: (k: string, v: unknown) => (tests.push((r) => String(r[k]) === String(v)), q),
      neq: (k: string, v: unknown) => (tests.push((r) => String(r[k]) !== String(v)), q),
      is: (k: string, v: unknown) => (tests.push((r) => (r[k] ?? null) === v), q),
      not: (k: string, o: string, v: unknown) => (tests.push((r) => (o === 'is' && v === null ? r[k] !== null && r[k] !== undefined : true)), q),
      in: (k: string, vs: unknown[]) => (tests.push((r) => vs.map(String).includes(String(r[k]))), q),
      gt: (k: string, v: unknown) => (tests.push((r) => time(r[k]) > time(v)), q),
      gte: (k: string, v: unknown) => (tests.push((r) => time(r[k]) >= time(v)), q),
      lt: (k: string, v: unknown) => (tests.push((r) => time(r[k]) < time(v)), q),
      lte: (k: string, v: unknown) => (tests.push((r) => time(r[k]) <= time(v)), q),
      or: () => q,
      contains: () => q,
      order: (k: string, o?: { ascending?: boolean }) => ((sort = { key: k, up: o?.ascending !== false }), q),
      limit: (n: number) => ((cap = n), q),
      range: (from: number, to: number) => ((skip = from), (cap = to - from + 1), q),
      maybeSingle: () => ((one = 'maybe'), q),
      single: () => ((one = 'single'), q),
      insert: (rows: Row | Row[]) => ((op = { kind: 'insert', rows: Array.isArray(rows) ? rows : [rows] }), q),
      upsert: (rows: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) => ((op = { kind: 'upsert', rows: Array.isArray(rows) ? rows : [rows], on: (o?.onConflict ?? 'id').split(','), ignore: o?.ignoreDuplicates === true }), q),
      update: (patch: Row) => ((op = { kind: 'update', patch }), q),
      delete: () => ((op = { kind: 'delete' }), q),
      then: (ok: (v: unknown) => unknown, no: (e: unknown) => unknown) => Promise.resolve().then(run).then(ok, no),
    }
    return q
  }
  return {
    from: (table: string) => query(table),
    rpc: async (name: string, args: Row) => ({ data: rpcs[name] ? rpcs[name](args) : [], error: null }),
  }
}

/** A JPEG's first bytes, 1080 by 1350, as Instagram's feed takes it. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x05, 0x46, 0x04, 0x38, 0x03, ...new Array(52).fill(0)])
const fetcher = async (url: string): Promise<Response> => {
  if (url === DESIGN) return new Response(JPEG)
  if (url === TICKETS) return new Response('<html>tickets</html>', { status: 200 })
  if (new URL(url).hostname === 'www.eventlinqs.com.au') return new Response('<a href="/events/a-moment-of-sanity">A Moment of Sanity</a>', { status: 200 })
  throw new Error(`no answer for ${url}`)
}

const IG = [
  '🧘 Two hours to breathe at Thornbury Apothecary.',
  'A Moment of Sanity, by GroovyTown Wellbeing',
  '📍 Thornbury Apothecary, 800 High Street, Thornbury',
  '📅 Tuesday 1 December, 7pm to 9pm',
  `🎟 Tickets are sold by ${SELLER}; find them through the link in our bio`,
].join('\n')
const FB = [
  '🧘 Two hours to breathe at Thornbury Apothecary.',
  'A Moment of Sanity, by GroovyTown Wellbeing',
  '📍 Thornbury Apothecary, 800 High Street, Thornbury',
  '📅 Tuesday 1 December, 7pm to 9pm',
  `🎟 Tickets are sold by ${SELLER}:`,
  goHop(ORIGIN, 'facebook'),
].join('\n')

const input = (over: Partial<IntakeInput> = {}): IntakeInput => ({
  briefId: '9e8d7c6b-5a49-4382-a716-b5c4d3e2f1a0',
  eventIds: [EVENT],
  format: 'feed',
  images: [{ url: DESIGN, restsOn: { kind: 'asset', assetId: 'c0000000-0000-4000-8000-000000000001' } }],
  captions: { instagram: IG, facebook: FB },
  destinations: ['facebook', 'instagram'],
  facts: [{ eventId: EVENT, title: 'A Moment of Sanity', startDate: '2026-12-01T08:00:00.000Z', endDate: '2026-12-01T10:00:00.000Z', venue: 'Thornbury Apothecary', organiser: 'GroovyTown Wellbeing' }],
  link: `${ORIGIN}/events/a-moment-of-sanity`,
  objective: 'conversion',
  preferredAt: '2026-11-24T06:30:00.000Z',
  latestAt: '2026-11-30T12:00:00.000Z',
  expiresAt: '2026-12-01T06:00:00.000Z',
  ...over,
})

function world(opts: { usable?: () => boolean } = {}) {
  const usable = opts.usable ?? (() => true)
  const tables: Record<string, Row[]> = {
    cities: [{ slug: 'melbourne', name: 'Melbourne', free_guide: true, is_active: true, display_order: 1 }],
    events: [{
      id: EVENT, slug: 'a-moment-of-sanity', title: 'A Moment of Sanity', start_date: '2026-12-01T08:00:00.000Z', end_date: '2026-12-01T10:00:00.000Z',
      timezone: 'Australia/Melbourne', created_at: '2026-11-10T00:00:00.000Z', listing_series_id: null, status: 'published', visibility: 'public',
      venue_name: 'Thornbury Apothecary', venue_address: '800 High Street, Thornbury', venue_city: 'Melbourne', venue_id: VENUE, is_age_restricted: false,
      age_restriction_min: null, cover_image_url: null, summary: 'An evening to breathe.', is_free: false, entry_mode: null, external_ticket_url: TICKETS,
      listing_source: null, host_name: null, category: { slug: 'wellness' }, organisation: { name: 'GroovyTown Wellbeing', slug: 'groovytown-wellbeing' },
      ticket_tiers: [], event_booking_links: [{ availability: 'on_sale' }], venue_row: { name: 'Thornbury Apothecary' },
    }],
    venues: [{ id: VENUE, name: 'Thornbury Apothecary' }],
    venue_aliases: [],
    social_assets: [{ id: 'c0000000-0000-4000-8000-000000000001', asset_url: PHOTO, asset_type: 'photo', event_id: EVENT, source_width: 1440, source_height: 1800 }],
    creative_intake: [],
    social_campaigns: [],
    social_pieces: [],
    social_piece_revisions: [],
    social_piece_approvals: [],
    social_piece_schedules: [],
    social_piece_postings: [],
    feature_flags: [{ flag: 'social_auto_publish', enabled: true }],
  }
  const db = memoryDb(tables, {
    social_asset_usable: (a) => a.p_url === PHOTO && a.p_event === EVENT && usable(),
    organiser_permission_for: () => null,
  })
  return { tables, db: db as never }
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL_PREVIEW', '')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', STORAGE)
})
afterEach(() => vi.unstubAllEnvs())

describe('the creative intake, received and handed to publishing', () => {
  it("hands a record that passes every gate to Car A as one 'creative' piece, unapproved, its /go hop given the piece's id", async () => {
    const { receiveIntake } = await import('@/lib/social/store')
    const { tables, db } = world()
    const out = await receiveIntake(db, input(), { now: RECEIVED, siteOrigin: ORIGIN, fetcher })
    expect(out.state, JSON.stringify(out)).toBe('handed_off')
    if (out.state === 'refused') throw new Error(out.reason)
    expect(tables.social_pieces).toHaveLength(1)
    const piece = tables.social_pieces[0]
    expect(piece.kind).toBe('creative')
    expect(out.pieceId).toBe(piece.id)
    expect(tables.creative_intake[0]).toMatchObject({ state: 'handed_off', piece_id: piece.id, checked_stage: 'intake', check_reasons: [] })
    const rev = tables.social_piece_revisions[0] as { version: number; slides: { t: string; url?: string }[]; versions: { facebook: { caption: string } } }
    expect(rev.version).toBe(1)
    expect(rev.slides).toEqual([expect.objectContaining({ t: 'file', url: DESIGN })])
    expect(rev.versions.facebook.caption).toContain(`/go/${String(piece.id)}?via=facebook`)
    expect(tables.social_piece_approvals).toHaveLength(0)
    expect(tables.social_piece_schedules).toHaveLength(0)
  })

  it('holds a record that fails with every reason and draws nothing in its place (no fallback)', async () => {
    const { receiveIntake } = await import('@/lib/social/store')
    const { tables, db } = world()
    const out = await receiveIntake(db, input({ captions: { instagram: IG.replace('Two hours to breathe', 'Two hours to breathe tomorrow'), facebook: FB } }), { now: RECEIVED, siteOrigin: ORIGIN, fetcher })
    expect(out.state).toBe('held')
    expect(tables.creative_intake[0].state).toBe('held')
    expect((tables.creative_intake[0].check_reasons as string[]).join('\n')).toContain('says "tomorrow"')
    expect(tables.social_pieces).toHaveLength(0)
    expect(tables.social_piece_revisions).toHaveLength(0)
  })
})

describe('the creative intake, again immediately before publishing', () => {
  async function handedOff(destinations: IntakeInput['destinations'], usable: { now: boolean }) {
    const store = await import('@/lib/social/store')
    const w = world({ usable: () => usable.now })
    const out = await store.receiveIntake(w.db, input({ destinations }), { now: RECEIVED, siteOrigin: ORIGIN, fetcher })
    if (out.state !== 'handed_off' || !out.pieceId) throw new Error(`not handed off: ${JSON.stringify(out)}`)
    const goAt = '2026-11-24T06:30:00.000Z'
    w.tables.social_piece_approvals.push({ id: 'a0000000-0000-4000-8000-000000000001', piece_id: out.pieceId, revision: 1, approved_by: 'pm', approved_at: RECEIVED.toISOString() })
    for (const platform of ['instagram', 'facebook']) {
      w.tables.social_piece_schedules.push({ id: `5c000000-0000-4000-8000-00000000000${platform === 'instagram' ? 1 : 2}`, piece_id: out.pieceId, approval_id: 'a0000000-0000-4000-8000-000000000001', platform, go_at: goAt, latest_at: null, objective: null, state: 'scheduled', submission_ref: null, created_at: RECEIVED.toISOString() })
    }
    return { ...w, store, pieceId: out.pieceId }
  }

  it("holds the schedule with the intake's reason when an image's permission went after intake, and never calls the publisher", async () => {
    const usable = { now: true }
    const { tables, db, store } = await handedOff(['facebook', 'instagram'], usable)
    usable.now = false
    const publisher = vi.fn(async () => ({ ref: 'https://www.facebook.com/1/posts/2' }))
    const ran = await store.publishDuePieces(db, new Date('2026-11-24T06:31:00.000Z'), { siteOrigin: ORIGIN, publisher, fetcher })
    expect(publisher).not.toHaveBeenCalled()
    expect(ran.published).toEqual([])
    for (const s of tables.social_piece_schedules) {
      expect(s.state).toBe('held')
      expect(String(s.held_reason)).toContain('[intake] [rights] Image 1: the asset c0000000-0000-4000-8000-000000000001 has no approved, current permission')
    }
    expect(tables.creative_intake[0]).toMatchObject({ state: 'held', checked_stage: 'publish' })
  })

  it("posts only to the record's destinations: a network it does not name is held and skipped, the other goes", async () => {
    const { tables, db, store } = await handedOff(['facebook'], { now: true })
    const publisher = vi.fn(async (p: { platform: string }) => ({ ref: p.platform === 'facebook' ? 'https://www.facebook.com/1/posts/2' : 'https://www.instagram.com/p/x' }))
    await store.publishDuePieces(db, new Date('2026-11-24T06:31:00.000Z'), { siteOrigin: ORIGIN, publisher, fetcher })
    expect(publisher.mock.calls.map((c) => (c[0] as { platform: string }).platform)).toEqual(['facebook'])
    const ig = tables.social_piece_schedules.find((s) => s.platform === 'instagram')
    expect(ig?.state).toBe('held')
    expect(String(ig?.held_reason)).toContain('instagram is not a destination of its intake record')
  })
})
