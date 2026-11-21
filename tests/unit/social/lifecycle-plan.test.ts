import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ctaFor } from '@/lib/events/cta'
import { creativeRefusals, type CampaignNight } from '@/lib/social/campaign'
import { law37Refusal } from '@/lib/social/law37'
import { parseMomentKey, planLifecyclePieces } from '@/lib/social/lifecycle-plan'

// Train AI-2 (law 37 (l), law 40): the lifecycle planner's reads and pieces, end to end on a fixture. The history is read
// first; the day's few are planned, each a law 37 photograph whole with its own words and its own link per network; a
// feed post about one organiser's festival invites their verified Instagram account, a story never does; a failed read
// plans nothing (fail closed).

const NOW = new Date('2026-11-28T01:00:00Z') // noon, Saturday 28 November, Melbourne

const night = (over: Partial<CampaignNight>): CampaignNight => ({
  eventId: 'e-fest',
  slug: 'harbour-lights-festival',
  title: 'Harbour Lights Festival',
  startDate: '2026-11-28T00:00:00Z',
  endDate: '2026-11-28T11:00:00Z',
  timezone: 'Australia/Melbourne',
  citySlug: 'geelong',
  cityName: 'Geelong',
  venueName: 'Eastern Beach',
  placeName: 'Eastern Beach',
  host: 'Harbour Lights Collective',
  categorySlug: 'festivals',
  summary: 'Lanterns, food stalls and live music along the water all afternoon. Bring a picnic.',
  approvedPhotoUrl: null,
  photoCredit: null,
  cta: ctaFor({ isFree: true }),
  priceLine: 'Free',
  listedAt: '2026-11-01T00:00:00Z',
  seriesId: null,
  ...over,
})

type Rows = { history?: unknown[]; postings?: unknown[]; schedules?: unknown[]; assets?: unknown[]; organisers?: unknown[]; past?: unknown[]; failHistory?: boolean; failPast?: boolean }
function fakeDb(rows: Rows): SupabaseClient {
  // readPlatformOrganiserIds (the one rule) reads the listings organisation by slug and the test organisers by is_test;
  // here there are neither, so those reads answer empty and the Collab read answers the fixture's organisers.
  const chain = (data: unknown[], error: { message: string } | null = null) => {
    let platformRead = false
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'not', 'neq', 'or', 'order', 'limit', 'in', 'range', 'gt', 'lte']) b[m] = () => b
    b.eq = (col: string) => {
      if (col === 'is_test' || col === 'slug') platformRead = true
      return b
    }
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: platformRead ? [] : data, error })
    return b
  }
  return {
    from: (table: string) => {
      if (table === 'social_pieces') return chain(rows.history ?? [], rows.failHistory ? { message: 'connection reset' } : null)
      if (table === 'organisers') return chain(rows.organisers ?? [])
      if (table === 'organisations') return chain([])
      if (table === 'social_piece_postings') return chain(rows.postings ?? [])
      if (table === 'social_piece_schedules') return chain(rows.schedules ?? [])
      // The season's ended nights (lifecycle-plan.ts readSeasonPast); the fixture holds only those it means as ended.
      if (table === 'events') return chain(rows.past ?? [], rows.failPast ? { message: 'connection reset' } : null)
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async (name: string) => {
      if (name !== 'social_usable_images_all') throw new Error(`unexpected rpc ${name}`)
      return { data: rows.assets ?? [], error: null }
    },
  } as unknown as SupabaseClient
}

const asset = (id: string, url: string, rank: number | null, w = 1440, h = 1080) => ({ event_id: 'e-fest', asset_id: id, asset_url: url, asset_type: 'photo', lead_rank: rank, source_width: w, source_height: h })
const verified = { id: 'o1', name_key: 'harbour lights collective', instagram_handle: 'harbourlights.geelong', instagram_verified_at: '2026-11-20T00:00:00Z', collab_preference: 'open', is_test: false, collab_invitations: [] }

describe('the lifecycle planner, end to end on a fixture', () => {
  it("plans the festival's first day: a feed post with a Collab and a story without, each its own photo and words", async () => {
    // Key 'harbour lights collective' is what crmNameKey gives the host; read from the module so the fixture cannot drift.
    const { crmNameKey } = await import('@/lib/listings/discovery-organisers')
    const db = fakeDb({
      assets: [asset('a1', 'https://x/lead.jpg', 1), asset('a2', 'https://x/second.jpg', 2, 1080, 1350), asset('a3', 'https://x/unlooked.jpg', null)],
      organisers: [{ ...verified, name_key: crmNameKey('Harbour Lights Collective') }],
    })
    const { pieces } = await planLifecyclePieces(db, { now: NOW, nights: [night({})], origin: 'https://www.eventlinqs.com.au' })
    expect(pieces.map((p) => p.format).sort()).toEqual(['feed', 'story'])
    const feed = pieces.find((p) => p.format === 'feed')!
    const story = pieces.find((p) => p.format === 'story')!
    expect(feed.versions.instagram.collaborators).toEqual(['harbourlights.geelong'])
    expect(story.versions.instagram.collaborators).toBeUndefined()
    // Two different photographs, never the unlooked one; each whole, the story with its one line.
    const photos = pieces.map((p) => (p.slides[0] as { photo: string }).photo)
    expect(new Set(photos).size).toBe(2)
    expect(photos).not.toContain('https://x/unlooked.jpg')
    expect(story.slides[0]).toMatchObject({ t: 'photo', composition: 'photo_whole', line: 'Starts today at Eastern Beach.' })
    expect(feed.slides[0]).toMatchObject({ t: 'photo', line: null })
    // Its moment and its day.
    expect(parseMomentKey(feed.momentKey)).toMatchObject({ kind: 'first_day', format: 'feed', day: '2026-11-28' })
    // Each network's own link, and every rule of the publish path holds.
    // The words carry the counted /go hop, its id written when the piece is written (go-hop.ts; AV (e)); a press lands
    // on the stored link, the event page with its tags.
    expect(feed.versions.facebook.cta).toBe('https://www.eventlinqs.com.au/go/PIECE_ID_HERE?via=facebook')
    expect(feed.link).toMatch(/utm_source=instagram/)
    for (const p of pieces) {
      expect(law37Refusal(p.slides)).toBeNull()
      expect(creativeRefusals({ slides: p.slides, versions: p.versions } as never, new Map()).filter((r) => /utm_source/.test(r))).toEqual([])
    }
  })

  it('never posts a photograph already used, and plans nothing when no looked-at photograph is left', async () => {
    const used = [{ id: 'p0', format: 'feed', moment_key: 'announce|feed|2026-11-01|t:harbour lights festival|Eastern Beach|2026-11-28', planned_at: '2026-11-01T00:00:00Z', social_piece_revisions: [{ version: 1, slides: [{ t: 'photo', photo: 'https://x/lead.jpg' }], versions: { instagram: { caption: 'One for the calendar.' } } }], social_piece_decisions: [] }]
    const db = fakeDb({ history: used, postings: [{ piece_id: 'p0' }], assets: [asset('a1', 'https://x/lead.jpg', 1)] })
    const { pieces } = await planLifecyclePieces(db, { now: NOW, nights: [night({})], origin: 'https://www.eventlinqs.com.au' })
    expect(pieces).toEqual([])
  })

  it('a photograph whose piece was rejected before it ever posted is free again; one that posted is spent for good', async () => {
    const piece = (decisions: unknown[], postings: unknown[]) => [{ id: 'p0', format: 'feed', moment_key: 'announce|feed|2026-11-01|t:harbour lights festival|Eastern Beach|2026-11-28', planned_at: '2026-11-01T00:00:00Z', social_piece_revisions: [{ version: 1, slides: [{ t: 'photo', photo: 'https://x/lead.jpg' }], versions: { instagram: { caption: 'One for the calendar.' } } }], social_piece_decisions: decisions, posted: postings }]
    const rejected = [{ revision: 1, decision: 'rejected' }]
    const freed = await planLifecyclePieces(fakeDb({ history: piece(rejected, []), assets: [asset('a1', 'https://x/lead.jpg', 1)] }), { now: NOW, nights: [night({})], origin: 'https://www.eventlinqs.com.au' })
    expect(freed.pieces.map((p) => p.slides[0])).toEqual([expect.objectContaining({ photo: 'https://x/lead.jpg' })])
    const spent = await planLifecyclePieces(fakeDb({ history: piece(rejected, []), postings: [{ piece_id: 'p0' }], assets: [asset('a1', 'https://x/lead.jpg', 1)] }), { now: NOW, nights: [night({})], origin: 'https://www.eventlinqs.com.au' })
    expect(spent.pieces).toEqual([])
  })

  it('a history it cannot read plans nothing: the planner fails closed', async () => {
    const db = fakeDb({ failHistory: true, assets: [asset('a1', 'https://x/lead.jpg', 1)] })
    await expect(planLifecyclePieces(db, { now: NOW, nights: [night({})], origin: 'https://www.eventlinqs.com.au' })).rejects.toThrow(/history could not be read/)
  })

  it('an organiser who declined is never invited, and a workshop is not worth a Collab', async () => {
    const { crmNameKey } = await import('@/lib/listings/discovery-organisers')
    const declined = { ...verified, name_key: crmNameKey('Harbour Lights Collective'), collab_preference: 'declined' }
    const a = await planLifecyclePieces(fakeDb({ assets: [asset('a1', 'https://x/1.jpg', 1)], organisers: [declined] }), { now: NOW, nights: [night({})], origin: 'https://www.eventlinqs.com.au' })
    expect(a.pieces.find((p) => p.format === 'feed')?.versions.instagram.collaborators).toBeUndefined()
    const open = { ...verified, name_key: crmNameKey('Harbour Lights Collective') }
    const b = await planLifecyclePieces(fakeDb({ assets: [asset('a1', 'https://x/1.jpg', 1)], organisers: [open] }), {
      now: NOW,
      nights: [night({ title: 'Pottery basics', categorySlug: 'arts', slug: 'pottery-basics' })],
      origin: 'https://www.eventlinqs.com.au',
    })
    expect(b.pieces.find((p) => p.format === 'feed')?.versions.instagram.collaborators).toBeUndefined()
  })
})

describe('the hourly sweep draws a stale lifecycle draft again, for its own moment (21 November 2026)', () => {
  // AMCF's two pieces of 05:10 on 21 November were drawn before the rules of 19:45Z and printed 'Fri 20' on a Saturday;
  // the sweep matched them against the week's plan, which holds no lifecycle moment, and kept them ('0 drawn again').
  it('a draft the sweep names is planned again with its own moment and its own photograph; unnamed, it holds its moment', async () => {
    const assets = [asset('a1', 'https://x/lead.jpg', 1), asset('a2', 'https://x/second.jpg', 2, 1080, 1350)]
    const first = await planLifecyclePieces(fakeDb({ assets }), { now: NOW, nights: [night({})], origin: 'https://www.eventlinqs.com.au' })
    const feed = first.pieces.find((p) => p.format === 'feed')!
    const photoOf = (slides: readonly unknown[]) => (slides[0] as { photo: string }).photo
    const stale = {
      id: 'p-stale',
      format: 'feed',
      moment_key: feed.momentKey,
      planned_at: '2026-11-27T18:10:00Z',
      social_piece_revisions: [{ version: 1, slides: feed.slides, versions: { instagram: { caption: 'An older first line.' } } }],
      social_piece_decisions: [],
    }
    // Unnamed, the draft holds its moment, and its photograph is never drawn twice.
    const held = await planLifecyclePieces(fakeDb({ history: [stale], assets }), { now: NOW, nights: [night({})], origin: 'https://www.eventlinqs.com.au' })
    expect(held.pieces.some((p) => p.momentKey === feed.momentKey)).toBe(false)
    expect(held.pieces.map((p) => photoOf(p.slides))).not.toContain(photoOf(feed.slides))
    // Named by the sweep, the same moment is planned again with the same photograph, to be written as its next version.
    const again = await planLifecyclePieces(fakeDb({ history: [stale], assets }), {
      now: NOW,
      nights: [night({})],
      origin: 'https://www.eventlinqs.com.au',
      redrawing: new Set(['p-stale']),
    })
    const redrawn = again.pieces.find((p) => p.momentKey === feed.momentKey)
    expect(redrawn).toBeDefined()
    expect(photoOf(redrawn!.slides)).toBe(photoOf(feed.slides))
  })
})

describe("an owner's Post now and a photograph that can no longer post (Colours of Asia, 22 November 2026)", () => {
  // Saturday's tomorrow story for Sunday's night, never approved and never sent, held Asia Oasis's only Sunday
  // photograph; Sunday's planner then said 'no permitted photograph for a story', and AMCF held the day's one feed place.
  const SUNDAY = new Date('2026-11-28T14:30:00Z') // 01:30, Sunday 29 November, Melbourne
  const sunday = night({ eventId: 'e-sun', slug: 'colours-sunday', title: 'Colours of Asia: Garden of Wonders', startDate: '2026-11-29T00:00:00Z', endDate: '2026-11-29T11:00:00Z', host: null })
  const other = night({ eventId: 'e-other', slug: 'other-festival', title: 'Another Festival', startDate: '2026-11-27T00:00:00Z', endDate: '2026-11-29T11:00:00Z', host: null })
  const photo = { event_id: 'e-sun', asset_id: 'a-sun', asset_url: 'https://x/her-sunday.jpg', asset_type: 'photo', lead_rank: 1, source_width: 916, source_height: 654 }
  const otherPhoto = { event_id: 'e-other', asset_id: 'a-other', asset_url: 'https://x/other.jpg', asset_type: 'photo', lead_rank: 1, source_width: 1440, source_height: 1080 }
  const yesterdaysStory = {
    id: 'p-tomorrow',
    format: 'story',
    moment_key: 'tomorrow|story|2026-11-28|t:colours of asia: garden of wonders|Eastern Beach|2026-11-29',
    planned_at: '2026-11-27T14:04:00Z',
    social_piece_revisions: [
      { version: 1, slides: [{ t: 'photo', photo: 'https://x/her-sunday.jpg' }], versions: { instagram: { caption: 'Tomorrow.' } } },
      { version: 2, slides: [{ t: 'photo', photo: 'https://x/her-sunday.jpg' }], versions: { instagram: { caption: 'Tomorrow, again.' } } },
    ],
    social_piece_decisions: [{ revision: 1, decision: 'rejected' }, { revision: 2, decision: 'edited' }],
  }
  const todaysOtherFeed = {
    id: 'p-other-feed',
    format: 'feed',
    moment_key: 'final_day|feed|2026-11-29|t:another festival|Eastern Beach|2026-11-27',
    planned_at: '2026-11-28T13:10:00Z',
    social_piece_revisions: [{ version: 1, slides: [{ t: 'photo', photo: 'https://x/other-earlier.jpg' }], versions: { instagram: { caption: 'Last day.' } } }],
    social_piece_decisions: [],
  }
  const plan = (rows: Rows, ownerAsked?: { eventId: string }) =>
    planLifecyclePieces(fakeDb(rows), { now: SUNDAY, nights: [sunday, other], origin: 'https://www.eventlinqs.com.au', ...(ownerAsked ? { ownerAsked } : {}) })
  const herPieces = <T extends { readonly eventIds: readonly string[] }>(pieces: readonly T[]): T[] => pieces.filter((p) => p.eventIds.includes('e-sun'))

  it("a piece whose day has passed without going frees its photograph: her Sunday photograph is drawn on Sunday", async () => {
    const { pieces, notes } = await plan({ history: [yesterdaysStory], assets: [photo] })
    expect(notes.join(' ')).not.toMatch(/Colours of Asia[^;]*no permitted photograph/)
    expect(herPieces(pieces).map((p) => (p.slides[0] as { photo: string }).photo)).toContain('https://x/her-sunday.jpg')
  })

  it('a piece the provider accepted keeps its photograph spent, posting row or not', async () => {
    const { pieces } = await plan({ history: [yesterdaysStory], schedules: [{ piece_id: 'p-tomorrow' }], assets: [photo] })
    expect(herPieces(pieces)).toEqual([])
  })

  it("another night's feed post today never takes her day's post (no daily count); the owner's word draws hers alone", async () => {
    const rows = { history: [yesterdaysStory, todaysOtherFeed], assets: [photo, otherPhoto] }
    const usual = await plan(rows)
    // Her one photograph goes once (law 37 (l), never twice): it carries her day's feed post.
    expect(herPieces(usual.pieces).map((p) => p.format)).toEqual(['feed'])
    const asked = await plan(rows, { eventId: 'e-sun' })
    expect(asked.pieces).toHaveLength(1)
    expect(asked.pieces[0]).toMatchObject({ format: 'feed', eventIds: ['e-sun'] })
    expect(asked.pieces[0].slides[0]).toMatchObject({ t: 'photo', composition: 'photo_whole', photo: 'https://x/her-sunday.jpg' })
  })

  it("the owner's word never draws a night that has ended, nor a photograph not permitted", async () => {
    const ended = await planLifecyclePieces(fakeDb({ assets: [photo] }), { now: new Date('2026-11-29T12:00:00Z'), nights: [sunday], origin: 'https://www.eventlinqs.com.au', ownerAsked: { eventId: 'e-sun' } })
    expect(ended.pieces).toEqual([])
    const none = await plan({ assets: [] }, { eventId: 'e-sun' })
    expect(none.pieces).toEqual([])
  })
})

describe('the season, whole (5C 03:12, the PM 03:39)', () => {
  // Colours of Asia: Garden of Wonders as production holds it: six rows, each its own one-off series, 11am to 10pm.
  const DAYS = ['13', '14', '15', '20', '21', '22']
  const rows = DAYS.map((d, i) =>
    night({ eventId: `coa-${d}`, slug: `colours-of-asia-2026-11-${d}`, title: 'Colours of Asia: Garden of Wonders', seriesId: `one-off-${i}`, host: null, startDate: `2026-11-${d}T00:00:00Z`, endDate: `2026-11-${d}T11:00:00Z` }),
  )
  const assets = DAYS.map((d) => ({ event_id: `coa-${d}`, asset_id: `a-${d}`, asset_url: `https://x/coa-${d}.jpg`, asset_type: 'photo', lead_rank: 1, source_width: 1440, source_height: 1080 }))
  const asPast = (n: (typeof rows)[number]) => ({ id: n.eventId, title: n.title, start_date: n.startDate, end_date: n.endDate, timezone: n.timezone, created_at: n.listedAt, listing_series_id: n.seriesId, venue_id: null, venue_name: n.venueName })
  const planOn = (day: string) => {
    const now = new Date(`2026-11-${day}T01:00:00Z`) // noon in Melbourne
    const open = rows.filter((n) => Date.parse(n.endDate as string) > now.getTime())
    const ended = rows.filter((n) => Date.parse(n.endDate as string) <= now.getTime()).map(asPast)
    return planLifecyclePieces(fakeDb({ assets, past: ended }), { now, nights: open, origin: 'https://www.eventlinqs.com.au' })
  }

  it('a festival of 13, 14, 15, 20, 21, 22 November reads final_day on the 22nd and never Opening today after the 13th', async () => {
    for (const day of ['14', '15', '16', '17', '18', '19', '20', '21', '22']) {
      const { pieces } = await planOn(day)
      for (const p of pieces) {
        expect(parseMomentKey(p.momentKey)?.kind, `${day}: ${p.momentKey}`).not.toBe('first_day')
        expect(p.caption.startsWith('Opening today.'), `${day}: ${p.caption.split('\n')[0]}`).toBe(false)
      }
    }
    const last = await planOn('22')
    expect(last.pieces.map((p) => parseMomentKey(p.momentKey)?.kind)).toContain('final_day')
    const first = await planOn('13')
    expect(first.pieces.map((p) => parseMomentKey(p.momentKey)?.kind)).toContain('first_day')
  })

  it("an ended night is read for the season's days only and never drawn", async () => {
    const { pieces } = await planOn('22')
    for (const p of pieces) expect(p.eventIds).toEqual(['coa-22'])
  })

  it("a failed read of the season's ended nights plans nothing: the planner fails closed", async () => {
    const db = fakeDb({ assets, failPast: true })
    await expect(planLifecyclePieces(db, { now: new Date('2026-11-22T01:00:00Z'), nights: rows.slice(5), origin: 'https://www.eventlinqs.com.au' })).rejects.toThrow(/ended nights could not be read/)
  })
})
