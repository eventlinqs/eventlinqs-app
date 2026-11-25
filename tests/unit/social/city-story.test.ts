import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { intakeFaults, slidesOf, type IntakeInput, type IntakeRead } from '@/lib/creative/intake'
import type { CampaignCity, CampaignNight } from '@/lib/social/campaign'
import { makeDailyStories, storyBriefIdOf, type CarouselDeps } from '@/lib/social/carousel-make'
import { cityStoryDesign, storyDateLine, storyDayToDraw, storyPostAt, storyTimeline } from '@/lib/social/city-story'
import { goHop } from '@/lib/social/go-hop'
import { law37Refusal } from '@/lib/social/law37'
import { timingOf } from '@/lib/social/timing'

/*
 * THE DAILY CITY STORY, TONIGHT'S PICKS (the PM's 01:02 item 4 of 25 November 2026). Red on main, where a story is drawn
 * only for one night with a permitted photograph not already used, so since 22 November the planner drew one story
 * (277 nights hold no permitted photo): one 9:16 frame a city a day in the locked look, in type, our own design alone,
 * through the creative intake, for the PM's verify, in the 18:00 story band.
 */
const STORAGE = 'https://gndnldyfudbytbboxesk.supabase.co'
const ORIGIN = 'https://www.eventlinqs.com.au'
const DAY = '2026-11-26' // Thursday 26 November 2026
const BAND = storyPostAt(DAY) // 18:00 in Melbourne
const H = 3_600_000
const HOP = goHop(ORIGIN, 'facebook')

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL_PREVIEW', '')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', STORAGE)
})
afterEach(() => vi.unstubAllEnvs())

let n = 0
const night = (o: { hoursAfterBand: number; title?: string; city?: string; photo?: string | null; category?: string }): CampaignNight => {
  n += 1
  const start = new Date(BAND.getTime() + o.hoursAfterBand * H)
  return {
    eventId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    slug: `story-night-${n}`,
    title: o.title ?? `Story Night ${n}`,
    startDate: start.toISOString(),
    endDate: new Date(start.getTime() + 2 * H).toISOString(),
    timezone: 'Australia/Melbourne',
    citySlug: o.city ?? 'melbourne',
    cityName: 'Melbourne',
    venueName: `Hall ${n}`,
    placeName: `Hall ${n}`,
    venueId: null,
    host: null,
    organiser: null,
    categorySlug: (o.category ?? 'Comedy').toLowerCase(),
    categoryName: o.category ?? 'Comedy',
    summary: null,
    approvedPhotoUrl: o.photo ?? null,
    photoCredit: null,
    cta: { state: 'paid_external', action: 'Get tickets', scan: 'Scan for tickets', ticketingByEventLinqs: false, freeEntry: false, registrationRequired: false, where: `seller${n}.example.com`, chip: null },
    priceLine: 'From $30',
  } as CampaignNight
}
const design = (nights: CampaignNight[]) => cityStoryDesign({ city: { slug: 'melbourne', name: 'Melbourne' }, nights, day: DAY, origin: ORIGIN, hop: HOP, tags: ['#MelbourneEvents', '#Melbourne', '#EventLinqs'] })

describe('when, and the words on the frame', () => {
  it("goes in the story band, 18:00 in Melbourne, made that morning while the band is at least an hour away", () => {
    expect(BAND.toISOString()).toBe('2026-11-26T07:00:00.000Z')
    expect(storyDayToDraw(new Date('2026-11-25T19:40:00Z'))).toBe(DAY) // Thursday 06:40
    expect(storyDayToDraw(new Date('2026-11-26T06:30:00Z'))).toBeNull() // Thursday 17:30
    expect(storyDateLine(DAY)).toBe('THU 26 NOV')
  })
})

describe("tonight's picks", () => {
  it('two, starting two hours after the band or later, one per title, organisers with a relationship first, in time order', () => {
    const early = night({ hoursAfterBand: 1 })
    const late = night({ hoursAfterBand: 3, title: 'The Late Show', category: 'Music' })
    const lateAgain = night({ hoursAfterBand: 4, title: 'The Late Show' })
    const permitted = night({ hoursAfterBand: 5, photo: 'https://x.test/p.jpg', category: 'Theatre' })
    const tomorrow = night({ hoursAfterBand: 20 })
    const elsewhere = night({ hoursAfterBand: 3, city: 'geelong' })
    const d = design([early, late, lateAgain, permitted, tomorrow, elsewhere])
    expect(d).not.toBeNull()
    expect(d!.picks.map((p) => p.eventId)).toEqual([late.eventId, permitted.eventId])
    const cover = d!.slides[0]
    expect(d!.slides).toHaveLength(1)
    expect(cover).toMatchObject({ t: 'week_cover', lines: ['TONIGHT IN', 'MELBOURNE', 'THU 26 NOV'], accentLine: 1, photo: null, credit: null })
    expect((cover as { lead: unknown[] }).lead).toHaveLength(2)
  })
  it('fewer than two picks tonight: no story that day', () => {
    expect(design([night({ hoursAfterBand: 3 })])).toBeNull()
    expect(design([night({ hoursAfterBand: 1 }), night({ hoursAfterBand: 1.5 })])).toBeNull()
  })
  it("its words: each pick and its place; Facebook's one link its /go hop, Instagram's 'link in our bio' once", () => {
    const d = design([night({ hoursAfterBand: 3, title: 'Jazz Late' }), night({ hoursAfterBand: 4, title: 'Comedy Late' })])!
    expect(d.captions.instagram).toContain('Jazz Late, Hall')
    expect(d.captions.instagram.match(/link in our bio/g)).toHaveLength(1)
    expect(d.captions.instagram).not.toMatch(/https?:\/\//)
    expect(d.captions.facebook.match(/https?:\/\/\S+/g)).toEqual([HOP])
  })
  it('its timeline: preferred at the band, useful until two hours before the first pick, expired as it starts', () => {
    expect(storyTimeline(DAY, [{ startDate: new Date(BAND.getTime() + 3 * H).toISOString() }])).toEqual({
      preferredAt: '2026-11-26T07:00:00.000Z',
      latestAt: '2026-11-26T08:00:00.000Z',
      expiresAt: '2026-11-26T10:00:00.000Z',
    })
  })
})

describe('the record it hands to the creative intake', () => {
  const nights = [night({ hoursAfterBand: 3, title: 'Jazz Late' }), night({ hoursAfterBand: 4, title: 'Comedy Late', category: 'Music' })]
  const d = design(nights)!
  const url = `${STORAGE}/storage/v1/object/public/event-images/creative/0b5c3c8e-1d6f-4b4e-9a51-8a2f1c7d9e10/melbourne-story-${DAY}-01.jpg`
  const record: IntakeInput = {
    briefId: storyBriefIdOf('melbourne', DAY),
    eventIds: d.picks.map((p) => p.eventId),
    format: 'story',
    images: [{ url, restsOn: { kind: 'own_design' } }],
    captions: d.captions,
    destinations: ['instagram', 'facebook'],
    facts: d.picks.map((p) => ({ eventId: p.eventId, title: p.title, startDate: p.startDate, endDate: p.endDate ?? null, venue: p.placeName ?? null, organiser: null })),
    link: d.link,
    objective: 'engagement',
    ...storyTimeline(DAY, d.picks),
  }
  const read: IntakeRead = {
    nights: new Map(nights.map((x) => [x.eventId, x])),
    aliases: new Map(),
    known: new Map(),
    timing: timingOf({ moment: null, nights: d.picks.map((p) => ({ title: p.title, startDate: p.startDate, endDate: p.endDate ?? null, timezone: p.timezone, status: 'published', isFree: false })), preferredAt: new Date(record.expiresAt) }, new Date('2026-11-25T19:40:00Z')),
    assets: new Map(),
    grants: new Map(),
    page: { ok: true, status: 200, body: nights.map((x) => `<a href="/events/${x.slug}">`).join('') },
    misfits: new Map([['facebook', null], ['instagram', null]]),
  }
  it('passes every gate the creative intake runs at intake', () => {
    expect(intakeFaults(record, read, { stage: 'intake', now: new Date('2026-11-25T19:40:00Z'), origin: ORIGIN, pieceId: null })).toEqual([])
  })
  it("reaches publishing as one finished file, law 37's format", () => {
    const planned = slidesOf(record, read.assets, read.nights)
    if (!('slides' in planned)) throw new Error(planned.refused)
    expect(planned.slides).toEqual([expect.objectContaining({ t: 'file', format: 'story' })])
    expect(law37Refusal(planned.slides)).toBeNull()
  })
})

describe('the make step', () => {
  const city: CampaignCity = { slug: 'melbourne', name: 'Melbourne' }
  const thursday = new Date('2026-11-25T19:40:00Z')
  const fakeDb = (had: { state: string; piece_id: string | null }[]) =>
    ({ from: () => { const q = { select: () => q, eq: () => Promise.resolve({ data: had, error: null }) }; return q } }) as never
  it('renders one story frame, stores it once under creative/<uuid>/, and hands the record to the intake as a story', async () => {
    const formats: string[] = []
    const stored: string[] = []
    const handed: IntakeInput[] = []
    const deps: CarouselDeps = {
      readCities: async () => [city],
      readNights: async () => [night({ hoursAfterBand: 3 }), night({ hoursAfterBand: 4 })],
      pictures: async () => new Map(),
      render: async (_s, _n, _t, _p, _x, format) => {
        formats.push(format)
        return new Uint8Array([0xff, 0xd8])
      },
      store: async (path) => {
        stored.push(path)
        return `${STORAGE}/storage/v1/object/public/event-images/${path}`
      },
      intake: async (input) => {
        handed.push(input)
        return { state: 'handed_off', pieceId: 'p1', faults: [] }
      },
    }
    const out = await makeDailyStories(fakeDb([]), { now: thursday, deps })
    expect(out).toEqual([expect.objectContaining({ city: 'melbourne', state: 'made' })])
    expect(formats).toEqual(['story'])
    expect(stored[0]).toMatch(new RegExp(`^creative/[0-9a-f-]{36}/melbourne-story-${DAY}-01\\.jpg$`))
    expect(handed[0]).toMatchObject({ format: 'story', briefId: storyBriefIdOf('melbourne', DAY), images: [{ restsOn: { kind: 'own_design' } }] })
    expect(await makeDailyStories(fakeDb([{ state: 'handed_off', piece_id: 'p1' }]), { now: thursday, deps })).toEqual([expect.objectContaining({ state: 'kept' })])
  })
})
