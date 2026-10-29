import { beforeAll, describe, expect, test } from 'vitest'
import { ctaFor } from '@/lib/events/cta'
import { layoutDailyPoster, posterWords, type PosterNight } from '@/lib/broadcast/daily-poster'
import { FitError, layoutFaults, type Measurers, type TreatmentFormat } from '@/lib/broadcast/treatment-layout'
import { treatmentMeasurers } from '@/lib/broadcast/treatments'

/*
 * CREATIVE FAMILY F, THE DAILY POSTER (Lawal, 00:20 on 30 October 2026; C:\dev\START-16OCT\EVENTLINQS-DAILY-POSTER-
 * DIRECTIVE-30OCT.md). Every badge and chip is true from the listing, a false 'FREE' is refused, and every poster at
 * every format keeps every word in its box, its margins, the story's clear bands and its contrast, at the sizes the
 * directive's table sets, measured with the real faces.
 */

let m: Measurers
beforeAll(async () => {
  m = await treatmentMeasurers()
})

const FORMATS: TreatmentFormat[] = ['portrait', 'square', 'story']
const PHOTO = { url: 'https://example.supabase.co/storage/v1/object/public/organiser-media/approved.jpg', credit: 'The House Geelong', archival: false }

const night = (over: Partial<PosterNight> = {}): PosterNight => ({
  title: 'Creative Community Night',
  startDate: '2026-11-05T06:00:00Z',
  endDate: '2026-11-05T09:00:00Z',
  timezone: 'Australia/Melbourne',
  cityName: 'Geelong',
  venueName: 'The House',
  venueAddress: 'Centrepoint Arcade, Geelong VIC 3220',
  cta: ctaFor({ entryMode: 'walk_in' }),
  priceLine: null,
  isAgeRestricted: false,
  ageMin: null,
  photo: PHOTO,
  // A real code's length (share-codes.ts: ten characters), as TEST minted 'VlekjUhway' on 30 October.
  shortLink: 'eventlinqs.com.au/e/VlekjUhway',
  ...over,
})

// The four originals' facts (the reference image), as TEST listings carry them.
const ORIGINALS: Record<string, PosterNight> = {
  'Creative Community Night': night(),
  'Jackpot Trivia': night({ title: 'Jackpot Trivia', startDate: '2026-11-05T08:00:00Z', endDate: null, venueName: 'Elephant & Castle', venueAddress: '158 McKillop St, Geelong VIC 3220' }),
  "Friyay at Beav's": night({ title: "Friyay at Beav's", startDate: '2026-11-06T10:30:00Z', endDate: null, venueName: "Beav's Bar", venueAddress: '77 Little Malop St, Geelong VIC 3220', isAgeRestricted: true, ageMin: 18 }),
  'Wooshka live': night({ title: 'Wooshka live', startDate: '2026-11-07T10:00:00Z', endDate: null, venueName: 'Elephant & Castle', venueAddress: '158 McKillop St, Geelong VIC 3220' }),
}

describe('every badge and chip is true from the listing', () => {
  test('a walk-in night: FREE IN GEELONG, and the admission chip is section E\'s own words', () => {
    const w = posterWords(night(), 'portrait')
    expect(w.freeBadge).toBe('FREE IN GEELONG')
    expect(w.chips).toEqual([{ text: 'Free entry', kind: 'admission' }])
  })

  test('a FALSE FREE is refused: no price stored is never read as free (E5)', () => {
    const w = posterWords(night({ cta: ctaFor({ isFree: null }) }), 'portrait')
    expect(w.freeBadge).toBeNull()
    expect(w.chips.some((c) => /free/i.test(c.text))).toBe(false)
    const notChecked = posterWords(night({ cta: ctaFor({ isFree: false }) }), 'portrait')
    expect(notChecked.freeBadge).toBeNull()
  })

  test('an outside sale: its stated price, or the provider, and never FREE', () => {
    const cta = ctaFor({ externalTicketUrl: 'https://www.ticketek.com.au/x', providerName: 'Ticketek' })
    expect(posterWords(night({ cta, priceLine: 'From $25' }), 'portrait').chips[0]).toEqual({ text: 'From $25', kind: 'admission' })
    const noPrice = posterWords(night({ cta, priceLine: null }), 'portrait')
    expect(noPrice.chips[0].text).toBe('Tickets at Ticketek')
    expect(noPrice.freeBadge).toBeNull()
  })

  test('18+ only when the night is marked age restricted at 18; never Book a table or No membership needed', () => {
    expect(posterWords(ORIGINALS["Friyay at Beav's"], 'portrait').chips.map((c) => c.text)).toEqual(['Free entry', '18+'])
    expect(posterWords(night({ isAgeRestricted: true, ageMin: 21 }), 'portrait').chips.map((c) => c.text)).toEqual(['Free entry'])
    for (const n of Object.values(ORIGINALS)) {
      for (const f of FORMATS) expect(posterWords(n, f).chips.map((c) => c.text).join(' ')).not.toMatch(/Book a table|No membership/)
    }
  })

  test('the footer is the night\'s own link or Link in bio, never the bare domain', () => {
    expect(posterWords(night(), 'portrait').footer).toBe('Link in bio')
    expect(posterWords(night(), 'story').footer).toBe('eventlinqs.com.au/e/VlekjUhway')
    expect(() => posterWords(night({ shortLink: null }), 'story')).toThrow(FitError)
  })

  test('the date, the time and the venue with its street, in the night\'s own zone', () => {
    const w = posterWords(ORIGINALS['Jackpot Trivia'], 'portrait')
    expect([w.day, w.num, w.month]).toEqual(['THU', '5', 'NOV'])
    expect(w.time).toBe('From 7pm')
    expect(w.venue).toBe('Elephant & Castle, 158 McKillop St, Geelong')
    expect(posterWords(night(), 'portrait').time).toBe('5pm to 8pm')
    expect(posterWords(ORIGINALS["Friyay at Beav's"], 'portrait').time).toBe('From 9.30pm')
  })

  test('the venue line keeps a place that is not a numbered street, and never repeats the venue or the town', () => {
    expect(posterWords(night(), 'portrait').venue).toBe('The House, Centrepoint Arcade, Geelong')
    expect(posterWords(night({ venueName: 'Aireys Pub', venueAddress: 'Aireys Pub' }), 'portrait').venue).toBe('Aireys Pub, Geelong')
    expect(posterWords(night({ venueName: 'Costa Hall', venueAddress: 'Geelong VIC 3220' }), 'portrait').venue).toBe('Costa Hall, Geelong')
  })

  test('no approved photograph: the same night is type-led, with no credit', () => {
    const w = posterWords(night({ photo: null }), 'portrait')
    expect(w.variant).toBe('type')
    expect(w.credit).toBeNull()
  })

  test('an archival photograph says past event', () => {
    expect(posterWords(night({ photo: { ...PHOTO, archival: true } }), 'portrait').credit).toBe('Photo: The House Geelong, past event')
  })
})

describe('every poster fits, at every format, both variants', () => {
  for (const [name, n] of Object.entries(ORIGINALS)) {
    for (const format of FORMATS) {
      for (const variant of ['photo', 'type'] as const) {
        test(`${name}, ${format}, ${variant}-led`, () => {
          const facts = variant === 'photo' ? n : { ...n, photo: null }
          const w = posterWords(facts, format)
          const l = layoutDailyPoster(format, w, m, facts.photo)
          expect(layoutFaults(l, m)).toEqual([])
          const run = (role: string) => l.runs.find((r) => r.role === role)
          expect(run('date-num')?.size).toBeGreaterThanOrEqual(120)
          expect(run('time')?.size).toBeGreaterThanOrEqual(34)
          expect(run('venue')?.size).toBeGreaterThanOrEqual(28)
          expect(run('footer')?.size).toBeGreaterThanOrEqual(26)
          for (const r of l.runs.filter((x) => x.role.startsWith('chip-'))) expect(r.size).toBeGreaterThanOrEqual(28)
          for (const b of l.blocks.filter((x) => x.role === 'pill' && x.h === 56)) expect(b.h).toBeGreaterThanOrEqual(56)
          if (variant === 'photo') {
            expect(run('title')?.size).toBeGreaterThanOrEqual(64)
            expect(run('title')?.lines.length).toBeLessThanOrEqual(2)
            expect(run('credit')?.size).toBeGreaterThanOrEqual(22)
            expect(run('title-big')).toBeUndefined()
          } else {
            expect(run('title')).toBeUndefined()
            expect(run('title-big')).toBeDefined()
            expect(run('credit')).toBeUndefined()
          }
          if (format === 'story') for (const r of l.runs) expect(r.y).toBeGreaterThanOrEqual(269)
        })
      }
    }
  }

  test('two long chips and a real /e/ link: the link takes its own line under the chips, at 26 px or more', () => {
    // Plan this week on TEST, 30 October: 'eventlinqs.com.au/e/vJIVz4sOyr does not fit 1 line(s) of 393 at 26px'.
    const n = night({ cta: ctaFor({ externalTicketUrl: 'https://www.gpac.org.au/x', providerName: 'Geelong Performing Arts Centre' }), isAgeRestricted: true, ageMin: 18, shortLink: 'eventlinqs.com.au/e/vJIVz4sOyr' })
    for (const format of ['square', 'story'] as const) {
      for (const photo of [PHOTO, null]) {
        const w = posterWords({ ...n, photo }, format)
        expect(w.chips.map((c) => c.text)).toEqual(['Tickets at Geelong Performing Arts Centre', '18+'])
        const l = layoutDailyPoster(format, w, m, photo)
        expect(layoutFaults(l, m)).toEqual([])
        const footer = l.runs.find((r) => r.role === 'footer')
        const chip = l.runs.find((r) => r.role === 'chip-0')
        expect(footer?.size).toBeGreaterThanOrEqual(26)
        expect(footer && chip && footer.y > chip.y).toBe(true)
      }
    }
  })

  test('a long title steps down, then wraps to two lines; one that cannot fit is refused, never cut', () => {
    const long = posterWords(night({ title: 'The Geelong Waterfront Summer Sessions' }), 'portrait')
    const l = layoutDailyPoster('portrait', long, m, PHOTO)
    const title = l.runs.find((r) => r.role === 'title')
    expect(title?.lines.length).toBe(2)
    expect(title?.lines.join(' ')).toBe('The Geelong Waterfront Summer Sessions')
    const impossible = posterWords(night({ title: 'An Extraordinarily Long Evening Of Supercalifragilistic Celebration And Wonder' }), 'portrait')
    expect(() => layoutDailyPoster('portrait', impossible, m, PHOTO)).toThrow(FitError)
  })
})
