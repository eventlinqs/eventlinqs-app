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

type Rows = { history?: unknown[]; postings?: unknown[]; assets?: unknown[]; organisers?: unknown[]; failHistory?: boolean }
function fakeDb(rows: Rows): SupabaseClient {
  // readPlatformOrganiserIds (the one rule) reads the listings organisation by slug and the test organisers by is_test;
  // here there are neither, so those reads answer empty and the Collab read answers the fixture's organisers.
  const chain = (data: unknown[], error: { message: string } | null = null) => {
    let platformRead = false
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'not', 'neq', 'order', 'limit', 'in', 'range']) b[m] = () => b
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
    expect(feed.versions.facebook.cta).toMatch(/utm_source=facebook/)
    expect(feed.link).toMatch(/utm_source=instagram/)
    for (const p of pieces) {
      expect(law37Refusal(p.slides)).toBeNull()
      expect(creativeRefusals({ slides: p.slides, versions: p.versions } as never, new Map()).filter((r) => /utm_source/.test(r))).toEqual([])
    }
  })

  it('never posts a photograph already used, and plans nothing when no looked-at photograph is left', async () => {
    const used = [{ id: 'p0', format: 'feed', moment_key: 'announce|feed|2026-11-01|t:harbour lights festival|Eastern Beach|2026-11-28', planned_at: '2026-11-01T00:00:00Z', social_piece_revisions: [{ version: 1, slides: [{ t: 'photo', photo: 'https://x/lead.jpg' }], versions: { instagram: { caption: 'One for the calendar.' } } }], social_piece_decisions: [] }]
    const db = fakeDb({ history: used, assets: [asset('a1', 'https://x/lead.jpg', 1)] })
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
