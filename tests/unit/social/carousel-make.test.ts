import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { intakeFaults, slidesOf, type IntakeInput, type IntakeRead, type RegisterAsset } from '@/lib/creative/intake'
import type { CampaignCity, CampaignNight, Slide } from '@/lib/social/campaign'
import { briefIdOf, carouselIntake, carouselWeekToDraw, makeWeeklyCarousels, restsOnOfSlides, slideFileName, type CarouselDeps, type SlidePicture } from '@/lib/social/carousel-make'
import { carouselDesign, carouselNightOf, carouselPostAt } from '@/lib/social/city-carousel'
import { law37Refusal } from '@/lib/social/law37'
import { timingOf } from '@/lib/social/timing'

/*
 * THE WEEKLY CITY CAROUSEL, MADE (WINDOW 5C, 25 November 2026; the PM's 01:02 item 3 and 01:12). Each rule here is red
 * on main, where the carousel was a piece law 37 would drop (planNow keeps only law37Refusal's passes) and never drawn:
 *   1. it is made from the Thursday before its Monday, one record a city a week, never made twice;
 *   2. what each finished slide rests on: the cover on the city's own photograph, a night on its own permitted photograph
 *      (never an organiser's poster laid into a slide), everything else on our own design;
 *   3. the record it hands over passes every gate the creative intake runs, so the PM receives it unapproved to verify;
 *   4. its slides reach publishing as finished files, law 37's format.
 */
const STORAGE = 'https://gndnldyfudbytbboxesk.supabase.co'
const ORIGIN = 'https://www.eventlinqs.com.au'
const POST = carouselPostAt('2026-11-30') // Monday 30 November 2026, 06:00 in Melbourne
const CITY_URL = `${ORIGIN}/social/cities/melbourne-city-circle-tram.jpg`
const fileUrl = (path: string) => `${STORAGE}/storage/v1/object/public/event-images/${path}`

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL_PREVIEW', '')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', STORAGE)
})
afterEach(() => vi.unstubAllEnvs())

let n = 0
const night = (o: { hoursAfter: number; category: string; free?: boolean; photo?: string | null }): CampaignNight => {
  n += 1
  const start = new Date(POST.getTime() + o.hoursAfter * 3_600_000)
  return {
    eventId: `0000000${n}-aaaa-4bbb-8ccc-00000000000${n % 10}`,
    slug: `night-${n}`,
    title: `Night Number ${n}`,
    startDate: start.toISOString(),
    endDate: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
    timezone: 'Australia/Melbourne',
    citySlug: 'melbourne',
    cityName: 'Melbourne',
    venueName: `Venue Hall ${n}`,
    placeName: `Venue Hall ${n}`,
    venueId: null,
    host: null,
    organiser: null,
    categorySlug: o.category.toLowerCase(),
    categoryName: o.category,
    summary: null,
    approvedPhotoUrl: o.photo ?? null,
    photoCredit: null,
    cta: o.free
      ? { state: 'free_open', action: 'Free entry', scan: 'Scan for details', ticketingByEventLinqs: false, freeEntry: true, registrationRequired: false, where: null, chip: null }
      : { state: 'paid_external', action: 'Get tickets', scan: 'Scan for tickets', ticketingByEventLinqs: false, freeEntry: false, registrationRequired: false, where: `seller${n}.example.com`, chip: null },
    priceLine: o.free ? 'Free' : 'From $25',
  } as CampaignNight
}

const CATS = ['Music', 'Comedy', 'Family', 'Theatre']
const week = (): CampaignNight[] => Array.from({ length: 9 }, (_, i) => night({ hoursAfter: 13 + i * 17, category: CATS[i % 4], free: i === 5 }))
const design = (nights: CampaignNight[]) =>
  carouselDesign({ city: { slug: 'melbourne', name: 'Melbourne' }, nights: nights.map((x) => carouselNightOf(x)), postAt: POST, origin: ORIGIN, cityPhoto: { url: CITY_URL, credit: 'Photo: Dietmar Rabich, CC BY-SA 4.0' }, tags: ['#MelbourneEvents', '#Melbourne', '#EventLinqs'] })!

describe('when it is made, and once', () => {
  it('from the Thursday before its Monday, and not before', () => {
    expect(carouselWeekToDraw(new Date('2026-11-25T00:00:00Z'))).toBeNull() // Wednesday 25 November, 11:00
    expect(carouselWeekToDraw(new Date('2026-11-25T19:40:00Z'))).toEqual({ weekStart: '2026-11-30', postAt: POST }) // Thursday 06:40
    expect(carouselWeekToDraw(new Date('2026-11-29T18:00:00Z'))).toEqual({ weekStart: '2026-11-30', postAt: POST }) // Monday 05:00
    expect(carouselWeekToDraw(new Date('2026-11-29T20:00:00Z'))).toBeNull() // Monday 07:00: next Monday is seven days on
  })
  it('one brief a city a week, the same on every run, a uuid; each file named by city, week and place', () => {
    expect(briefIdOf('melbourne', '2026-11-30')).toBe(briefIdOf('melbourne', '2026-11-30'))
    expect(briefIdOf('melbourne', '2026-11-30')).not.toBe(briefIdOf('melbourne', '2026-12-07'))
    expect(briefIdOf('melbourne', '2026-11-30')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(slideFileName('melbourne', '2026-11-30', 3)).toBe('melbourne-week-2026-11-30-03.jpg')
  })
})

describe('what each finished slide rests on', () => {
  const d = () => design([night({ hoursAfter: 20, category: 'Music', photo: `${STORAGE}/own.jpg` }), night({ hoursAfter: 40, category: 'Comedy', photo: `${STORAGE}/poster.jpg` }), night({ hoursAfter: 60, category: 'Family' })])
  const pictures = (slides: readonly Slide[]): Map<number, SlidePicture> => {
    const m = new Map<number, SlidePicture>([[0, { url: CITY_URL, assetId: 'city-1', kind: 'photo' }]])
    slides.forEach((s, i) => {
      if (s.t === 'feature' && s.photo === `${STORAGE}/own.jpg`) m.set(i, { url: s.photo, assetId: 'own-1', kind: 'photo' })
      if (s.t === 'feature' && s.photo === `${STORAGE}/poster.jpg`) m.set(i, { url: s.photo, assetId: 'poster-1', kind: 'artwork' })
    })
    return m
  }
  it("the cover on the city's photograph; a night on its own photograph; a poster never laid into a slide; the rest our own design", () => {
    const x = d()
    const out = restsOnOfSlides(x.slides, pictures(x.slides), new Set(['city-1', 'own-1', 'poster-1']))
    expect('slides' in out).toBe(true)
    if (!('slides' in out)) return
    expect(out.restsOn[0]).toEqual({ kind: 'city_photo', assetId: 'city-1' })
    const kinds = out.restsOn.map((r) => r.kind)
    expect(kinds.filter((k) => k === 'asset')).toHaveLength(1)
    expect(kinds.at(-1)).toBe('own_design')
    const poster = out.slides.findIndex((s, i) => i > 0 && s.t === 'feature' && x.slides[i].t === 'feature' && (x.slides[i] as { photo: string | null }).photo === `${STORAGE}/poster.jpg`)
    expect(out.slides[poster]).toMatchObject({ photo: null, credit: null })
    expect(out.restsOn[poster]).toEqual({ kind: 'own_design' })
  })
  it("a photograph the register does not hold is drawn in type on our own design, never claimed", () => {
    const x = d()
    const out = restsOnOfSlides(x.slides, pictures(x.slides), new Set(['city-1']))
    if (!('slides' in out)) throw new Error('refused')
    expect(out.restsOn.slice(1).every((r) => r.kind === 'own_design')).toBe(true)
  })
  it("no carousel when the city's own photograph is not in the register as EventLinqs' own", () => {
    const x = d()
    expect(restsOnOfSlides(x.slides, new Map(), new Set())).toMatchObject({ refused: expect.stringContaining("the city's own photograph is not in the media register") })
    expect(restsOnOfSlides(x.slides, pictures(x.slides), new Set(['own-1']))).toMatchObject({ refused: expect.any(String) })
  })
})

describe('the record it hands to the creative intake', () => {
  const nights = week()
  const d = design(nights)
  const images = d.slides.map((_, i) => ({ url: fileUrl(`creative/0b5c3c8e-1d6f-4b4e-9a51-8a2f1c7d9e10/${slideFileName('melbourne', '2026-11-30', i + 1)}`), restsOn: i === 0 ? ({ kind: 'city_photo', assetId: 'city-1' } as const) : ({ kind: 'own_design' } as const) }))
  const record: IntakeInput = carouselIntake({ briefId: briefIdOf('melbourne', '2026-11-30'), design: d, images, postAt: POST })
  const city: RegisterAsset = { id: 'city-1', assetUrl: CITY_URL, assetType: 'photo', eventId: null, width: 1920, height: 1080, usableFor: new Set<string>(), usableAlone: true }
  const byId = new Map(nights.map((x) => [x.eventId, x]))
  // The timing engine's own window, read for the record's expiry, as store.ts readIntakeFacts reads it at intake.
  const timing = timingOf({ moment: null, nights: d.nights.map((x) => ({ title: x.title, startDate: x.startDate, endDate: x.endDate ?? null, timezone: x.timezone, status: 'published', isFree: x.free })), preferredAt: new Date(record.expiresAt) }, new Date('2026-11-25T19:40:00Z'))
  const read: IntakeRead = {
    nights: byId,
    aliases: new Map(),
    known: new Map(),
    timing,
    assets: new Map([[city.id, city]]),
    grants: new Map(),
    page: { ok: true, status: 200, body: nights.map((x) => `<a href="/events/${x.slug}">`).join('') },
    misfits: new Map([['facebook', null], ['instagram', null]]),
  }

  it('names its eight nights once each, with the facts the guide holds, its finished files in order and the city guide as its destination', () => {
    expect(record.eventIds).toHaveLength(8)
    expect(record.facts.map((f) => f.eventId)).toEqual(record.eventIds)
    expect(record.images).toHaveLength(10)
    expect(record.link).toBe(`${ORIGIN}/city/melbourne`)
    expect(record.objective).toBe('engagement')
    expect(record.preferredAt).toBe(POST.toISOString())
  })
  it('passes every gate the creative intake runs at intake: shape, facts, rights, timing, destination and words', () => {
    expect(intakeFaults(record, read, { stage: 'intake', now: new Date('2026-11-25T19:40:00Z'), origin: ORIGIN, pieceId: null })).toEqual([])
  })
  it("reaches publishing as finished files, every slide law 37's format", () => {
    const planned = slidesOf(record, read.assets, read.nights)
    if (!('slides' in planned)) throw new Error(planned.refused)
    expect(planned.slides.every((s) => s.t === 'file')).toBe(true)
    expect(law37Refusal(planned.slides)).toBeNull()
  })
})

describe('the make step', () => {
  const city: CampaignCity = { slug: 'melbourne', name: 'Melbourne' }
  const thursday = new Date('2026-11-25T19:40:00Z')
  const fakeDb = (had: { state: string; piece_id: string | null }[], registered: string[]) =>
    ({
      from: (table: string) => {
        const q = {
          select: () => q,
          eq: () => Promise.resolve({ data: table === 'creative_intake' ? had : [], error: null }),
          in: () => Promise.resolve({ data: table === 'social_assets' ? registered.map((id) => ({ id })) : [], error: null }),
        }
        return q
      },
    }) as never
  const deps = (over: Partial<CarouselDeps> = {}) => {
    const rendered: number[] = []
    const stored: string[] = []
    const handed: IntakeInput[] = []
    const d: CarouselDeps = {
      readCities: async () => [city, { slug: 'geelong', name: 'Geelong' }],
      readNights: async () => week(),
      pictures: async () => new Map([[0, { url: CITY_URL, assetId: 'city-1', kind: 'photo' as const }]]),
      render: async (_s, i) => {
        rendered.push(i)
        return new Uint8Array([0xff, 0xd8, i])
      },
      store: async (path) => {
        stored.push(path)
        return fileUrl(path)
      },
      intake: async (input) => {
        handed.push(input)
        return { state: 'handed_off', pieceId: '11111111-2222-4333-8444-555555555555', faults: [] }
      },
      ...over,
    }
    return { d, rendered, stored, handed }
  }

  it('renders every slide, stores each once under creative/<uuid>/, and hands the record to the intake, for Melbourne alone', async () => {
    const t = deps()
    const out = await makeWeeklyCarousels(fakeDb([], ['city-1']), { now: thursday, deps: t.d })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ city: 'melbourne', weekStart: '2026-11-30', state: 'made' })
    expect(out[0].line).toContain("UNAPPROVED, for the PM's verify")
    expect(t.rendered).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(t.stored).toHaveLength(10)
    for (const [i, p] of t.stored.entries()) expect(p).toMatch(new RegExp(`^creative/[0-9a-f-]{36}/melbourne-week-2026-11-30-${String(i + 1).padStart(2, '0')}\\.jpg$`))
    expect(t.handed[0].images[0].restsOn).toEqual({ kind: 'city_photo', assetId: 'city-1' })
    expect(t.handed[0].images.slice(1).every((im) => im.restsOn.kind === 'own_design')).toBe(true)
    expect(t.handed[0].briefId).toBe(briefIdOf('melbourne', '2026-11-30'))
  })
  it('makes nothing twice: a record received, passed or handed off keeps the week, and nothing is drawn', async () => {
    const t = deps()
    const out = await makeWeeklyCarousels(fakeDb([{ state: 'handed_off', piece_id: 'p1' }], ['city-1']), { now: thursday, deps: t.d })
    expect(out[0]).toMatchObject({ state: 'kept' })
    expect(t.rendered).toEqual([])
    expect(t.handed).toEqual([])
  })
  it('makes it again when the earlier record was held, and says a hold with its reasons', async () => {
    const t = deps({ intake: async () => ({ state: 'held', pieceId: null, faults: ['[facts] Night Number 3: not read as a public night still to come.'] }) })
    const out = await makeWeeklyCarousels(fakeDb([{ state: 'held', piece_id: null }], ['city-1']), { now: thursday, deps: t.d })
    expect(out[0]).toMatchObject({ state: 'refused' })
    expect(out[0].line).toContain('HELD by the creative intake (held): [facts] Night Number 3')
    expect(t.rendered).toHaveLength(10)
  })
  it("draws nothing when the city's own photograph is not in the register, and says why", async () => {
    const t = deps()
    const out = await makeWeeklyCarousels(fakeDb([], []), { now: thursday, deps: t.d })
    expect(out[0]).toMatchObject({ state: 'refused' })
    expect(out[0].line).toContain("the city's own photograph is not in the media register")
    expect(t.rendered).toEqual([])
  })
  it('does nothing before the Thursday', async () => {
    const t = deps()
    expect(await makeWeeklyCarousels(fakeDb([], ['city-1']), { now: new Date('2026-11-25T00:00:00Z'), deps: t.d })).toEqual([])
  })
})
