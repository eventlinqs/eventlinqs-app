import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { ctaFor, ctaPriceLine, type CtaInput } from '@/lib/events/cta'
import { featureSlideOf, inLockedLook, lockedListSlides, lockRefusal, planCampaign, venueSlideOf, OLDER_LOOK_IN_PLAN, type CampaignNight, type Slide } from '@/lib/social/campaign'
import { renderCampaignSlide, visualFaults, type SlideImage } from '@/lib/broadcast/campaign-slides'

/*
 * THE SOCIAL LOCK'S GUARD (Lawal, 15 November 2026, 20:52, item 1 (b), relayed by the PM: "a guard with a drill: golden
 * reference images from the benchmark, and a render test that fails any piece whose layout leaves the locked look (no
 * photograph where one is permitted, a cut title, a frame under the text guard's rules)").
 *
 * 1. The benchmark: WINDOW 6's locked posts (C:/dev/START-16OCT/SOCIAL-READY-15NOV, scored 9.5 and up), three of them
 *    kept here at 360 px wide (tests/fixtures/social-golden/benchmark). The look is read from them, never typed: the
 *    share of the frame in the gold of the timed cards, in the navy ground, and a photograph across the top. The same
 *    measure must pass on the benchmark itself and on our own render.
 * 2. The golden renders: the product's renderer draws a fixed week (a cover over a stand-in, a day of gold timed cards,
 *    a night's own photograph whole, a venue's week, the ask) at the portrait and story sizes, and each must match its
 *    golden (tests/fixtures/social-golden/*.png) within MAX_MEAN on a 54 px wide reading. A golden is taken again only
 *    with SOCIAL_GOLDEN_UPDATE=1, after the PM has scored the new look against the benchmark side by side (item 1 (c)).
 * 3. The drills, inside the test so they run every time: the same day slide drawn without its photograph, and a frame
 *    whose name cannot fit, must each be seen.
 */

const ROOT = process.cwd()
const GOLDEN = join(ROOT, 'tests/fixtures/social-golden')
const BENCH = join(GOLDEN, 'benchmark')
const STANDINS = join(ROOT, 'public/social/stand-ins')
const UPDATE = process.env.SOCIAL_GOLDEN_UPDATE === '1'
const ORIGIN = 'https://www.eventlinqs.com.au'
const OWN = 'https://example.supabase.co/storage/v1/object/public/event-images/organiser-supplied/golden/own.jpg'
/** A stand-in's file serves as one night's own photograph in this fixture (a file kept in the repository). */
const OWN_FILE = join(STANDINS, '21790480.jpg')
/** The most a render may move from its golden, as the mean of every channel of a 54 px wide reading (0 to 255). */
const MAX_MEAN = 6
const GOLD: [number, number, number] = [232, 183, 56] // day-cards.ts GOLD #E8B738
const NAVY: [number, number, number] = [10, 22, 40] // day-cards.ts NAVY #0A1628

const fileOf = (url: string): string | null => {
  if (url === OWN) return OWN_FILE
  const m = /\/social\/stand-ins\/(\d+)\.jpg$/.exec(url)
  return m ? join(STANDINS, `${m[1]}.jpg`) : null
}

beforeAll(() => {
  const real = globalThis.fetch
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const file = fileOf(url)
    if (file) {
      const bytes = readFileSync(file)
      return new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(bytes.byteLength) } })
    }
    return real(input, init)
  }) as typeof fetch)
})
afterAll(() => vi.unstubAllGlobals())

let seq = 0
function night(over: Partial<CampaignNight> & { at: string; state?: CtaInput }): CampaignNight {
  seq += 1
  const cta = ctaFor(over.state ?? { tiers: [{ price: 4500 }] })
  return {
    eventId: `00000000-0000-4000-9000-${String(seq).padStart(12, '0')}`,
    slug: `golden-${seq}`,
    title: `Night ${seq}`,
    startDate: over.at,
    timezone: 'Australia/Melbourne',
    citySlug: 'melbourne',
    cityName: 'Melbourne',
    venueName: 'Northcote Social Club',
    host: 'Northcote Social Club',
    categorySlug: 'music',
    summary: 'A band launches its album.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $45' }),
    ...over,
  }
}

/* The fixed week, 16 to 22 November 2026: five gigs, two comedy nights at one room, one night with its own photograph. */
const gigs = [
  night({ at: '2026-11-17T09:00:00Z', title: 'The Teskey Brothers', venueName: 'Forum Melbourne', host: 'Forum Melbourne' }),
  night({ at: '2026-11-18T08:30:00Z', title: 'Middle Kids', venueName: 'Corner Hotel', host: 'Corner Hotel' }),
  night({ at: '2026-11-19T09:00:00Z', title: 'Gang of Youths', venueName: 'Margaret Court Arena', host: 'Margaret Court Arena' }),
  night({ at: '2026-11-20T09:30:00Z', title: 'Cash Savage and the Last Drinks', venueName: 'Northcote Social Club', host: 'Northcote Social Club' }),
  night({ at: '2026-11-21T08:00:00Z', title: 'Jazz on the Lawn', venueName: 'Federation Square', host: 'Federation Square', state: { tiers: [{ price: 0 }] } }),
]
const comedy = [
  night({ at: '2026-11-16T08:30:00Z', title: 'Comedy Republic Bar Show', venueName: 'Comedy Republic', host: 'Comedy Republic', categorySlug: 'comedy', summary: 'Stand up comedy.' }),
  night({ at: '2026-11-18T08:30:00Z', title: 'Laugh Lab', venueName: 'Comedy Republic', host: 'Comedy Republic', categorySlug: 'comedy', summary: 'Stand up comedy.' }),
]
const own = night({ at: '2026-11-20T00:00:00Z', title: 'African Music Festival 2026', venueName: 'Federation Square', host: 'Federation Square', categorySlug: 'festival', approvedPhotoUrl: OWN, photoCredit: 'Its organiser', state: { tiers: [{ price: 0 }] } })

const list = lockedListSlides(gigs, ['5 music', 'nights in Melbourne', 'this week'], ORIGIN)
const cover = list[0]
const day = list.find((s) => s.t === 'days') as Slide
const ask = list.at(-1) as Slide
const feature = featureSlideOf(own)
const venue = venueSlideOf('Comedy Republic', comedy, ORIGIN)

async function imageOf(slide: Slide): Promise<SlideImage | null> {
  const url = 'photo' in slide ? slide.photo : null
  const file = url ? fileOf(url) : null
  if (!url || !file) return null
  const meta = await sharp(file).metadata()
  return { url, focal: null, width: meta.width ?? null, height: meta.height ?? null }
}

/** A frame read small: RGB at 54 px wide. */
async function reading(bytes: Uint8Array | Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(bytes).resize({ width: 54 }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}
const meanDiff = (a: Buffer, b: Buffer) => {
  if (a.length !== b.length) return 255
  let t = 0
  for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i])
  return t / a.length
}
/**
 * The share of a frame in the gold of the timed cards and in the navy ground. (A photograph's presence is not measured by
 * colour: a share of the top third off the card system read 0.078 on a day slide drawn bare and 0.085 on the benchmark's
 * own dark cover, 15 November 2026, so it cannot tell them apart. The golden comparison and its drill below do.)
 */
async function lookOf(bytes: Uint8Array | Buffer): Promise<{ gold: number; navy: number }> {
  const { data } = await sharp(bytes).resize({ width: 180 }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  let gold = 0
  let navy = 0
  const near = (i: number, c: [number, number, number], d: number) => Math.abs(data[i] - c[0]) + Math.abs(data[i + 1] - c[1]) + Math.abs(data[i + 2] - c[2]) <= d
  for (let i = 0; i < data.length; i += 3) {
    if (near(i, GOLD, 90)) gold++
    if (near(i, NAVY, 45) || near(i, [17, 31, 56], 45)) navy++
  }
  const px = data.length / 3
  return { gold: gold / px, navy: navy / px }
}

const CASES: { name: string; slide: Slide; n: number; total: number; next: Slide | null }[] = [
  { name: 'cover', slide: cover, n: 1, total: list.length, next: list[1] ?? null },
  { name: 'days', slide: day, n: 2, total: list.length, next: list[2] ?? null },
  { name: 'ask', slide: ask, n: list.length, total: list.length, next: null },
  { name: 'feature', slide: feature, n: 1, total: 1, next: null },
  { name: 'venue', slide: venue, n: 1, total: 1, next: null },
]
const FORMATS = ['feed', 'story'] as const
const rendered = new Map<string, Uint8Array>()
async function render(c: (typeof CASES)[number], f: (typeof FORMATS)[number], image?: SlideImage | null): Promise<Uint8Array> {
  const key = `${c.name}-${f}`
  if (image === undefined && rendered.has(key)) return rendered.get(key)!
  const out = await renderCampaignSlide(f, c.slide, c.n, c.total, null, image === undefined ? await imageOf(c.slide) : image, c.next)
  if (image === undefined) rendered.set(key, out)
  return out
}

describe("the fixture is the locked look's own (Lawal's lock of 15 November 2026)", () => {
  it('every slide drawn is a locked slide, the photographs are where they are permitted, and no title is cut', () => {
    expect(OLDER_LOOK_IN_PLAN).toBe(false)
    expect(inLockedLook([cover, day, ask, feature, venue])).toBe(true)
    expect(cover.t === 'week_cover' && cover.photo).toBeTruthy()
    expect(day.t === 'days' && day.photo).toBeTruthy()
    expect(feature.photo).toBe(OWN)
    expect(venue.photo).toBeTruthy()
    expect(JSON.stringify([cover, day, ask, feature, venue])).not.toMatch(/\.\.\.|…/)
  })

  it('a planned week keeps only locked pieces that carry a photograph: the older look and text alone are refused', () => {
    const { pieces } = planCampaign({ nights: [...gigs, ...comedy, own], cities: [{ slug: 'melbourne', name: 'Melbourne' }], weekStart: '2026-11-16', origin: ORIGIN })
    const kept = pieces.filter((p) => lockRefusal(p.slides) === null)
    const refused = pieces.filter((p) => lockRefusal(p.slides) !== null)
    expect(kept.length).toBeGreaterThan(0)
    for (const p of kept) {
      expect(inLockedLook(p.slides), p.kind).toBe(true)
      expect(p.slides.some((s) => 'photo' in s && Boolean(s.photo)), p.kind).toBe(true)
      expect(JSON.stringify(p.slides), p.kind).not.toMatch(/\.\.\.|…/)
    }
    // The older planner look's pieces are planned (law 13 keeps them) and refused, each with its reason.
    for (const kind of ['organiser_campaign', 'brand_campaign', 'partner_kit']) {
      const p = refused.find((x) => x.kind === kind)
      if (p) expect(lockRefusal(p.slides), kind).toMatch(/older planner look/)
    }
    expect(lockRefusal([ask])).toMatch(/lead with a photograph/)
    expect(lockRefusal([ask, cover])).toMatch(/lead with a photograph/)
  })
})

describe('the benchmark: the look is read from WINDOW 6\'s locked posts, never typed', () => {
  it('the benchmark itself reads as the locked look: gold timed cards on navy', async () => {
    const days = await lookOf(readFileSync(join(BENCH, 'A-LOCK-2-days-feed.jpg')))
    expect(days.gold).toBeGreaterThan(0.01)
    expect(days.navy).toBeGreaterThan(0.35)
  })

  it('our day slide reads the same way as the benchmark\'s', async () => {
    for (const f of FORMATS) {
      const look = await lookOf(await render(CASES[1], f))
      expect(look.gold, f).toBeGreaterThan(0.01)
      expect(look.navy, f).toBeGreaterThan(0.35)
    }
  }, 120_000)
})

describe('the golden renders: the product draws the locked look and has not moved from it', () => {
  for (const c of CASES) {
    for (const f of FORMATS) {
      it(`${c.name} at ${f} matches its golden`, async () => {
        const bytes = await render(c, f)
        const golden = join(GOLDEN, `${c.name}-${f}.png`)
        if (UPDATE) {
          mkdirSync(GOLDEN, { recursive: true })
          writeFileSync(golden, await sharp(bytes).resize({ width: 216 }).png().toBuffer())
          return
        }
        expect(existsSync(golden), `no golden at ${golden}: take it with SOCIAL_GOLDEN_UPDATE=1 after the PM's score`).toBe(true)
        const [a, b] = await Promise.all([reading(bytes), reading(readFileSync(golden))])
        expect(a.height, 'its shape').toBe(b.height)
        expect(meanDiff(a.data, b.data)).toBeLessThanOrEqual(MAX_MEAN)
      }, 120_000)
    }
  }

  it('every slide passes the text guard at every format it is made in (no frame under its rules)', async () => {
    const images = new Map<number, SlideImage | null>()
    const slides = [cover, day, ask]
    for (const [i, s] of slides.entries()) images.set(i, await imageOf(s))
    expect(await visualFaults(slides, 'feed', images)).toEqual([])
    expect(await visualFaults(slides, 'story', images)).toEqual([])
    expect(await visualFaults([feature], 'feed', new Map([[0, await imageOf(feature)]]))).toEqual([])
    expect(await visualFaults([venue], 'feed', new Map([[0, await imageOf(venue)]]))).toEqual([])
  }, 180_000)
})

describe('the drills: the guard sees what leaves the locked look', () => {
  it('the same day slide without its photograph is far from its golden', async () => {
    if (UPDATE) return
    const bare = await render(CASES[1], 'feed', null)
    const [a, b] = await Promise.all([reading(bare), reading(readFileSync(join(GOLDEN, 'days-feed.png')))])
    expect(meanDiff(a.data, b.data)).toBeGreaterThan(MAX_MEAN)
  }, 120_000)

  it('a frame whose name cannot fit its card is refused by the text guard', async () => {
    const long = { ...(day as Extract<Slide, { t: 'days' }>), rows: (day as Extract<Slide, { t: 'days' }>).rows.map((r, i) => (i === 0 ? { ...r, title: 'Supercalifragilisticexpialidociousnessextravaganzaspectacular' } : r)) }
    const faults = await visualFaults([long], 'feed', new Map([[0, await imageOf(long)]]))
    expect(faults.length).toBeGreaterThan(0)
  }, 120_000)
})
