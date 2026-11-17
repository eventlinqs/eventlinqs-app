import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { ctaFor, ctaPriceLine } from '@/lib/events/cta'
import { featureSlideOf, lockedListSlides, venueSlideOf, type CampaignNight, type Slide } from '@/lib/social/campaign'
import { renderCampaignSlide, type SlideImage } from '@/lib/broadcast/campaign-slides'

/*
 * THE WORDMARK NEVER SITS OVER A PHOTOGRAPH (Lawal's D3, 16 November 2026, 23:08: "Keep the approved EventLinqs wordmark
 * on the separate design band, not over the event photograph"; the PM's 23:42: a stand-in is a photograph, so on every
 * slide the wordmark sits on the navy band, never over any photograph, stand-in or a night's own). Until then the cover,
 * day and venue slides drew EVENTLINQS. on a dark plate over the top of the stand-in band.
 *
 * Read from the drawn frame, never from the layout code: every photograph is replaced by pure green, the wordmark's rows
 * are the rows near the top that hold white letters, and not one pixel in those rows may be the photograph. The
 * photograph must still be drawn, so the check can never pass by dropping it.
 */

const ORIGIN = 'https://www.eventlinqs.com.au'
const OWN = 'https://example.supabase.co/storage/v1/object/public/event-images/organiser-supplied/wordmark/own.jpg'
let green: Buffer

beforeAll(async () => {
  green = await sharp({ create: { width: 1800, height: 1200, channels: 3, background: { r: 0, g: 255, b: 0 } } }).jpeg({ quality: 95 }).toBuffer()
  const real = globalThis.fetch
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === OWN || /\/social\/stand-ins\/\d+\.jpg$/.test(url)) {
      return new Response(new Uint8Array(green), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(green.byteLength) } })
    }
    return real(input, init)
  }) as typeof fetch)
})
afterAll(() => vi.unstubAllGlobals())

let seq = 0
function night(over: Partial<CampaignNight> & { at: string }): CampaignNight {
  seq += 1
  const cta = ctaFor({ tiers: [{ price: 4500 }] })
  return {
    eventId: `00000000-0000-4000-a000-${String(seq).padStart(12, '0')}`,
    slug: `wordmark-${seq}`,
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

const gigs = [
  night({ at: '2026-11-17T09:00:00Z', title: 'The Teskey Brothers', venueName: 'Forum Melbourne', host: 'Forum Melbourne' }),
  night({ at: '2026-11-18T08:30:00Z', title: 'Middle Kids', venueName: 'Corner Hotel', host: 'Corner Hotel' }),
  night({ at: '2026-11-19T09:00:00Z', title: 'Gang of Youths', venueName: 'Margaret Court Arena', host: 'Margaret Court Arena' }),
]
const comedy = [
  night({ at: '2026-11-16T08:30:00Z', title: 'Comedy Republic Bar Show', venueName: 'Comedy Republic', host: 'Comedy Republic', categorySlug: 'comedy', summary: 'Stand up comedy.' }),
  night({ at: '2026-11-18T08:30:00Z', title: 'Laugh Lab', venueName: 'Comedy Republic', host: 'Comedy Republic', categorySlug: 'comedy', summary: 'Stand up comedy.' }),
]
const own = night({ at: '2026-11-20T00:00:00Z', title: 'A Festival of Their Own', venueName: 'Federation Square', host: 'Federation Square', categorySlug: 'festival', approvedPhotoUrl: OWN, photoCredit: 'Its organiser' })

const list = lockedListSlides(gigs, ['3 music', 'nights in Melbourne', 'this week'], ORIGIN)
const CASES: { name: string; slide: Slide; n: number; total: number; next: Slide | null }[] = [
  { name: 'cover over a stand-in', slide: list[0], n: 1, total: list.length, next: list[1] ?? null },
  { name: 'day over a stand-in', slide: list.find((s) => s.t === 'days')!, n: 2, total: list.length, next: list[2] ?? null },
  { name: 'venue over a stand-in', slide: venueSlideOf('Comedy Republic', comedy, ORIGIN), n: 1, total: 1, next: null },
  { name: "a night's own photograph", slide: featureSlideOf(own), n: 1, total: 1, next: null },
]

/** The rows near the top holding the wordmark's white letters, and how many photograph pixels those rows hold. */
async function wordmarkRows(png: Uint8Array): Promise<{ rows: number; photoInRows: number; photoShare: number }> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width
  const H = info.height
  const white = (i: number) => data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225
  // The photograph, pure green, reads as green even under the band's fade; the navy ground, the gold and white do not.
  const photo = (i: number) => data[i + 1] - Math.max(data[i], data[i + 2]) > 60
  let rows = 0
  let photoInRows = 0
  let photoAll = 0
  for (let y = 0; y < H; y++) {
    let whites = 0
    let greens = 0
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3
      if (white(i)) whites++
      if (photo(i)) greens++
    }
    photoAll += greens
    if (y < H * 0.3 && whites >= 4) {
      rows++
      photoInRows += greens
    }
  }
  return { rows, photoInRows, photoShare: photoAll / (W * H) }
}

describe("the wordmark sits on the navy band, never over any photograph (Lawal's D3)", () => {
  for (const c of CASES) {
    for (const f of ['feed', 'story'] as const) {
      it(`${c.name}, ${f}`, async () => {
        const url = 'photo' in c.slide ? (c.slide as { photo: string | null }).photo : null
        expect(url, 'the slide draws a photograph').toBeTruthy()
        const image: SlideImage = { url: url!, focal: null, width: 1800, height: 1200 }
        const png = await renderCampaignSlide(f, c.slide, c.n, c.total, null, image, c.next)
        const read = await wordmarkRows(png)
        expect(read.rows, 'the wordmark is drawn').toBeGreaterThan(0)
        expect(read.photoShare, 'the photograph is still drawn').toBeGreaterThan(0.05)
        expect(read.photoInRows, 'photograph pixels in the wordmark rows').toBe(0)
      }, 60_000)
    }
  }
})
