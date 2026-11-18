import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { ctaFor } from '@/lib/events/cta'
import { nightKind, type CampaignNight } from '@/lib/social/campaign'
import { dailyPosterPieces, posterLook } from '@/lib/social/daily-posters'
import { standInOf } from '@/lib/social/stand-ins'
import { pieceQuality } from '@/lib/social/piece-quality'
import { visualFaults } from '@/lib/broadcast/campaign-slides'

/*
 * FAMILY D, THE DAILY POSTER (law 26, Lawal's 18 November 2026, 11:53: "The engine's older planner looks (the plain
 * 'daily poster', ...) never post"; DESIGN-STANDARD-LOCKED-18NOV.md: the master set's 11 LANY and 20 AMCF). Looked at
 * on 18 November 2026 at about 22:20 (C:/dev/EVIDENCE/EL-18NOV/caption-v2/poster-look): the engine's daily poster was
 * still the older planner poster (a pill wordmark, a 'FREE IN GEELONG' pill, a calendar block, a raw street address).
 * Each poster is now planned in family D: the night's own permitted photograph whole, or a stand-in of its kind across
 * the top with the name in gold and one cream timed card (drawn and looked at, family-d-2); a night with neither has no
 * poster of its own and stays in the week's lists.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'

// A photograph to draw, never fetched: a dark textured frame stands for a stand-in and for a night's own (as the wordmark
// test's green does), so the guard reads the layout and the words over a real photograph's tones.
beforeAll(async () => {
  const noise = Buffer.alloc(1800 * 1200 * 3)
  for (let i = 0; i < noise.length; i += 3) {
    const v = 30 + ((i * 7919) % 70)
    noise[i] = v
    noise[i + 1] = v
    noise[i + 2] = v + 10
  }
  const photo = await sharp(noise, { raw: { width: 1800, height: 1200, channels: 3 } }).jpeg({ quality: 90 }).toBuffer()
  const real = globalThis.fetch
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (/\/social\/stand-ins\/\d+\.jpg$/.test(url) || url.endsWith('/organiser-supplied/own.jpg')) {
      return new Response(new Uint8Array(photo), { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(photo.byteLength) } })
    }
    return real(input, init)
  }) as typeof fetch)
})
afterAll(() => vi.unstubAllGlobals())

const night =(over: Partial<CampaignNight> & { eventId: string; title: string; startDate: string }): CampaignNight =>
  ({
    slug: over.eventId,
    endDate: null,
    timezone: 'Australia/Melbourne',
    citySlug: 'melbourne',
    cityName: 'Melbourne',
    venueName: null,
    host: null,
    categorySlug: 'music',
    summary: null,
    approvedPhotoUrl: null,
    photoCredit: null,
    cta: ctaFor({ tiers: [{ price: 5000 }] }),
    priceLine: null,
    ...over,
  }) as unknown as CampaignNight
const melbourne = { slug: 'melbourne', name: 'Melbourne' }
const lany = night({ eventId: 'lany', title: 'LANY', startDate: '2026-11-25T09:00:00Z', venueName: 'John Cain Arena', host: 'John Cain Arena', priceLine: 'Tickets at AXS' })
const kindless = night({ eventId: 'kindless', title: 'Members Evening', startDate: '2026-11-26T08:00:00Z', venueName: 'A Hall', host: 'A Hall', categorySlug: null })
const own = night({ eventId: 'own', title: 'A Festival of Their Own', startDate: '2026-11-27T00:00:00Z', venueName: 'Federation Square', host: 'Federation Square', categorySlug: 'festival', approvedPhotoUrl: 'https://example.supabase.co/storage/v1/object/public/event-images/organiser-supplied/own.jpg', photoCredit: 'Its organiser' })
const pieces = dailyPosterPieces({ nights: [lany, kindless, own], cities: [melbourne], weekStart: '2026-11-23', origin: ORIGIN })
const posterOf = (id: string) => pieces.find((p) => p.eventIds[0] === id)
const slideOf = (id: string) => posterOf(id)!.slides[0] as Extract<(typeof pieces)[number]['slides'][number], { t: 'poster' }>

describe("family D's words, as the master's 11 LANY reads them", () => {
  it('the day and the venue, the name, a line of its kind and its day, and one timed card', () => {
    expect(posterLook(lany, melbourne)).toEqual({
      eyebrow: 'Wednesday 25 November · John Cain Arena',
      name: 'LANY',
      accent: 'Live in Melbourne this Wednesday.',
      row: { eventId: 'lany', startDate: '2026-11-25T09:00:00Z', when: '8:00 pm', sub: 'Wed 25 Nov', title: 'John Cain Arena', place: 'Tickets at AXS', free: false },
      chip: null,
    })
    expect(slideOf('lany').look).toEqual(posterLook(lany, melbourne))
  })
  it('a run of days says its days; a free night says so on its card and its pill', () => {
    const sat = night({ eventId: 'm1', title: 'Riverside Market', startDate: '2026-11-28T22:00:00Z', categorySlug: 'markets', cta: ctaFor({ tiers: [], isFree: true } as never) })
    const sun = { ...sat, eventId: 'm2', startDate: '2026-11-29T22:00:00Z' }
    const look = posterLook(sat, melbourne, [sat, sun])
    expect(look.accent).toMatch(/ Sunday to Monday\.$/)
    expect(look.row.place).toBe('Free entry')
    expect(look.row.free).toBe(true)
    expect(look.chip).toBe('FREE ENTRY')
  })
})

describe('every daily poster is planned in family D, never the older planner poster', () => {
  it('a night with no photograph of its own takes a stand-in of its own kind, credited as illustrative', () => {
    const s = slideOf('lany')
    const stand = standInOf(s.photo)
    expect(stand?.kind).toBe(nightKind(lany))
    expect(s.credit).toMatch(/^Illustrative photo: /)
    expect(s.look).toBeDefined()
  })
  it("a night's own permitted photograph is its own, never a stand-in", () => {
    const s = slideOf('own')
    expect(s.photo).toBe(own.approvedPhotoUrl)
    expect(standInOf(s.photo)).toBeNull()
  })
  it('a night with neither has no poster of its own (it stays in the week’s lists)', () => {
    expect(nightKind(kindless)).toBeNull()
    expect(posterOf('kindless')).toBeUndefined()
  })
  it('the publish gate passes a planned poster: its stand-in shows its own kind', () => {
    const p = posterOf('lany')!
    const out = pieceQuality({ slides: p.slides, caption: p.versions.instagram.caption, madeAt: new Date().toISOString(), nights: new Map([[lany.eventId, lany]]), now: new Date('2026-11-23T00:00:00Z') })
    expect(out).toEqual([])
  })
  it('its drawing, in the locked look, passes the visual guard at every format with its photograph', async () => {
    for (const id of ['lany', 'own']) {
      const s = slideOf(id)
      expect(await visualFaults(posterOf(id)!.slides, 'feed', new Map([[0, { url: s.photo!, focal: null, width: 1800, height: 1200 }]]))).toEqual([])
    }
  }, 120_000)
  it('a name card whose photograph the register no longer holds is held by the guard, never posted half drawn', async () => {
    const faults = await visualFaults(posterOf('lany')!.slides, 'feed', new Map([[0, null]]))
    expect(faults.some((f) => /bare ground/.test(f))).toBe(true)
  }, 120_000)
})
