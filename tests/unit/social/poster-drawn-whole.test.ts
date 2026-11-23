import { PLAYBOOK } from '@/lib/social/playbook'
import { describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ctaFor } from '@/lib/events/cta'
import type { CampaignNight, Slide } from '@/lib/social/campaign'
import { law37Refusal } from '@/lib/social/law37'
import { rankPhotos, type PhotoAsset } from '@/lib/social/lifecycle'
import { planLifecyclePieces } from '@/lib/social/lifecycle-plan'

/*
 * AN ORGANISER'S POSTER IS DRAWN WHOLE (the PM's intake read of 23 November 2026, 22:15): the lifecycle planner drew only
 * assets typed 'photo', so A Moment of Sanity's poster (9080529b), rightly typed 'artwork', dropped out of the engine.
 * Lawal's 13:41 and the PM's 13:55 item 3: "The only thing kept whole is an organiser's POSTER". On main the poster below
 * draws nothing.
 */

// The poster: a 1080 by 1350 image, its top band red and its bottom band blue, so a crop at either end shows.
const RED = { r: 200, g: 30, b: 40 }
const BLUE = { r: 20, g: 40, b: 200 }
let source: Buffer = Buffer.alloc(0)
vi.mock('@/lib/media/fetch-image', () => ({ fetchImageBytes: async () => ({ bytes: new Uint8Array(source), contentType: 'image/jpeg' }) }))
async function poster(): Promise<Buffer> {
  const band = (c: typeof RED) => sharp({ create: { width: 1080, height: 675, channels: 3, background: c } }).png().toBuffer()
  return sharp({ create: { width: 1080, height: 1350, channels: 3, background: RED } })
    .composite([{ input: await band(RED), top: 0, left: 0 }, { input: await band(BLUE), top: 675, left: 0 }])
    .jpeg({ quality: 95 })
    .toBuffer()
}

const MONDAY = new Date('2026-11-30T01:00:00Z') // noon on Monday 30 November, Melbourne: the day before the night
const POSTER = 'https://x/sanity-poster.jpg'
const PHOTO = 'https://x/sanity-room.jpg'
const night: CampaignNight = {
  eventId: 'e-sanity', slug: 'a-moment-of-sanity', title: 'A Moment of Sanity', startDate: '2026-12-01T08:00:00Z', endDate: '2026-12-01T10:00:00Z',
  timezone: 'Australia/Melbourne', citySlug: 'melbourne', cityName: 'Melbourne', venueName: 'Thornbury Apothecary', placeName: 'Thornbury Apothecary',
  host: 'Thornbury Apothecary', organiser: 'GroovyTown Wellbeing', categorySlug: 'health-wellness', summary: null, approvedPhotoUrl: null, photoCredit: null,
  cta: ctaFor({ isFree: true }), priceLine: 'Free', listedAt: '2026-11-01T00:00:00Z', seriesId: null,
}
const asset = (id: string, url: string, type: 'photo' | 'artwork', w = 1080, h = 1350) => ({ event_id: 'e-sanity', asset_id: id, asset_url: url, asset_type: type, lead_rank: 1, source_width: w, source_height: h })

function fakeDb(assets: unknown[]): SupabaseClient {
  const chain = (data: unknown[]) => {
    let platformRead = false
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'not', 'neq', 'or', 'order', 'limit', 'in', 'range', 'gt', 'lte']) b[m] = () => b
    b.eq = (col: string) => {
      if (col === 'is_test' || col === 'slug') platformRead = true
      return b
    }
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data: platformRead ? [] : data, error: null })
    return b
  }
  return {
    from: (table: string) => {
      if (['social_pieces', 'organisers', 'organisations', 'social_piece_postings', 'social_piece_schedules', 'social_assets', 'events'].includes(table)) return chain([])
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async (name: string) => {
      if (name !== 'social_usable_images_all') throw new Error(`unexpected rpc ${name}`)
      return { data: assets, error: null }
    },
  } as unknown as SupabaseClient
}
const plan = (assets: unknown[]) => planLifecyclePieces(fakeDb(assets), { now: MONDAY, nights: [night], origin: 'https://www.eventlinqs.com.au' })
type PhotoSlide = Extract<Slide, { t: 'photo' }>

describe("an organiser's poster in the lifecycle planner", () => {
  it('is drawn as its own slide, whole, marked as the artwork, with no line of ours on its story', async () => {
    const { pieces, notes } = await plan([asset('p1', POSTER, 'artwork')])
    expect(pieces.length, notes.join(' ')).toBeGreaterThan(0)
    for (const p of pieces) {
      const s = p.slides[0] as PhotoSlide
      expect(s).toMatchObject({ t: 'photo', composition: 'photo_whole', photo: POSTER, width: 1080, height: 1350, line: null, artwork: true })
      expect(p.slides.length).toBe(1)
      expect(law37Refusal(p.slides)).toBeNull()
    }
  })

  it('a photograph still behaves as today: it leads where both are permitted, and its story keeps its line', async () => {
    const { pieces } = await plan([asset('p1', POSTER, 'artwork'), asset('p2', PHOTO, 'photo', 1440, 1080), asset('p3', 'https://x/second.jpg', 'photo', 1080, 1350)])
    for (const p of pieces) {
      const s = p.slides[0] as PhotoSlide
      expect(s.photo, p.format).not.toBe(POSTER)
      expect(s.artwork, p.format).toBeUndefined()
      if (p.format === 'story') expect(s.line).toMatch(/Thornbury Apothecary/)
    }
  })

  it('ranks a photograph before a poster, admits both, and nothing else', () => {
    const a = (assetId: string, type: string): PhotoAsset => ({ assetId, url: `https://x/${assetId}.jpg`, type, leadRank: 1, width: 1080, height: 1350 })
    expect(rankPhotos([a('poster', 'artwork'), a('room', 'photo'), a('logo', 'logo')], 'feed', new Set()).map((x) => x.assetId)).toEqual(['room', 'poster'])
    expect(rankPhotos([a('poster', 'artwork')], 'story', new Set()).map((x) => x.assetId)).toEqual(['poster'])
  })

  it('the poster is drawn at its own shape, never cropped: its top band and its bottom band both reach the image', async () => {
    source = await poster()
    const { drawLaw37Photo } = await import('@/lib/broadcast/law37-photo')
    const slide: PhotoSlide = { t: 'photo', composition: 'photo_whole', eventId: 'e-sanity', photo: POSTER, credit: null, width: 1080, height: 1350, line: null, artwork: true }
    const out = await drawLaw37Photo('feed', slide, { url: POSTER })
    const { data, info } = await sharp(Buffer.from(out)).raw().toBuffer({ resolveWithObject: true })
    expect({ width: info.width, height: info.height }).toEqual({ width: 1080, height: 1350 })
    const at = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels
      return { r: data[i], g: data[i + 1], b: data[i + 2] }
    }
    const near = (p: { r: number; g: number; b: number }, c: typeof RED) => Math.abs(p.r - c.r) + Math.abs(p.g - c.g) + Math.abs(p.b - c.b) < 40
    expect(near(at(540, 4), RED)).toBe(true)
    expect(near(at(540, 1345), BLUE)).toBe(true)
  })
})

describe("its playbook rule (Lawal's 16:04: every return is a fix, a test that fails first, and a rule)", () => {
  it('is written down with its reason and its source', () => {
    for (const id of ['poster-drawn-whole']) {
      const rule = PLAYBOOK.find((r) => r.id === id)
      expect(rule, id).toBeDefined()
      expect(rule?.source, id).toContain("the PM's intake read of 23 November 2026, 22:15")
    }
  })
})
