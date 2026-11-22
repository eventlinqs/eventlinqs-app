import { describe, expect, it } from 'vitest'
import { correctPlaceLines, knownVenueIndex, normaliseVenueName, placeOfLine, placeVerdict } from '@/lib/social/venue-identity'
import { pieceQuality, type QualityNight } from '@/lib/social/piece-quality'
import type { Slide } from '@/lib/social/campaign'

/*
 * A VENUE BY ITS IDENTITY, NEVER BY ITS SPELLING (Lawal's permanent publishing reliability correction, 19:04 of
 * 22 November 2026, section 1; the PM's 19:05, items 1 and 5). Red on main: the 18:40 run held AMCF's final day story on
 * "its place line does not name its venue, Fed Square." because the caption said 'Federation Square', and
 * src/lib/social/venue-identity.ts does not exist there. Production, read at 19:03: the listing's venue_name is
 * 'Fed Square', its venue row (0d7a0801) is named 'Federation Square'.
 */

const FED = 'v-fed'
const KNOWN = knownVenueIndex([
  { venueId: FED, name: 'Federation Square' },
  { venueId: FED, name: 'Fed Square' },
  { venueId: 'v-birrarung', name: 'Birrarung Marr' },
  // A name two venues share is never matched (knownVenueIndex leaves it out).
  { venueId: 'v-hall-a', name: 'Town Hall' },
  { venueId: 'v-hall-b', name: 'Town Hall' },
])

describe('the place a caption names, judged by the venue it identifies', () => {
  const own = ['Fed Square', 'Federation Square']

  it('equivalent wording of the same venue passes: its listing name, its row name, an alias, formatting normalised', () => {
    for (const place of ['Fed Square', 'Federation Square', 'FEDERATION SQUARE', 'The Federation Square', 'Federation  Square', 'Federation Square Atrium']) {
      expect(placeVerdict(place, own, KNOWN, FED)).toEqual({ kind: 'same' })
    }
  })

  it("the venue's id alone identifies it, with no alias recorded for the night", () => {
    expect(placeVerdict('Federation Square', ['Fed Square'], KNOWN, FED)).toEqual({ kind: 'same' })
  })

  it('a different venue we hold is never equal: a material discrepancy', () => {
    expect(placeVerdict('Birrarung Marr', own, KNOWN, FED)).toEqual({ kind: 'other', venueId: 'v-birrarung', name: 'Birrarung Marr' })
  })

  it('no fuzzy matching: a near spelling or a shortened name is not the venue, and a name two venues share matches neither', () => {
    expect(placeVerdict('Federation Sq', own, KNOWN, FED)).toEqual({ kind: 'unknown' })
    expect(placeVerdict('Fed Squares', own, KNOWN, FED)).toEqual({ kind: 'unknown' })
    expect(placeVerdict('Town Hall', own, KNOWN, 'v-hall-a')).toEqual({ kind: 'unknown' })
  })

  it('normalising: case, accents, punctuation, "&" and a leading "the"', () => {
    expect(normaliseVenueName("The Corner Hotel & Bar")).toBe('corner hotel and bar')
    expect(normaliseVenueName('Café Gülhane')).toBe('cafe gulhane')
    expect(placeOfLine('\u{1F4CD} Fed Square, Corner of Swanston and Flinders Streets, Melbourne')).toBe('Fed Square')
  })
})

describe('the caption from verified data: a safe difference corrected before posting, a material one held', () => {
  const night = { canonical: 'Federation Square', own: ['Fed Square', 'Federation Square'], venueId: FED }

  it('a place naming no venue we hold is given the venue row name, the rest of the line kept, and the correction said', () => {
    const caption = 'Last day today.\n\u{1F4CD} The Square, Corner of Swanston and Flinders Streets, Melbourne\n\u{1F4C5} Today'
    const out = correctPlaceLines(caption, night, KNOWN)
    expect(out.caption).toBe('Last day today.\n\u{1F4CD} Federation Square, Corner of Swanston and Flinders Streets, Melbourne\n\u{1F4C5} Today')
    expect(out.corrections).toEqual([{ from: '\u{1F4CD} The Square, Corner of Swanston and Flinders Streets, Melbourne', to: '\u{1F4CD} Federation Square, Corner of Swanston and Flinders Streets, Melbourne' }])
  })

  it('the same venue and another venue are never rewritten', () => {
    for (const line of ['\u{1F4CD} Fed Square, Melbourne', '\u{1F4CD} Birrarung Marr, Melbourne']) {
      expect(correctPlaceLines(line, night, KNOWN)).toEqual({ caption: line, corrections: [] })
    }
  })

  const slides: Slide[] = [{ t: 'photo', composition: 'photo_whole', eventId: 'amcf', photo: 'https://x/amcf.jpg', credit: null, width: 1100, height: 733, line: null } as unknown as Slide]
  const amcf: QualityNight = {
    eventId: 'amcf',
    title: 'African Music and Cultural Festival 2026',
    summary: 'Three days of African music, food, fashion and dance at Federation Square.',
    venueName: 'Fed Square',
    venueId: FED,
    venueAliases: ['Federation Square'],
    host: null,
    categorySlug: 'festivals',
    sourceTitle: null,
    startDate: '2026-11-21T23:00:00Z',
    endDate: '2026-11-22T11:00:00Z',
    timezone: 'Australia/Melbourne',
    isFree: true,
  } as unknown as QualityNight
  const caption = (place: string) =>
    [
      'Last day today for African music, food and dance at Federation Square, and still on.',
      "Three days of African music, food, fashion and dance at Federation Square. It's free, and there's nothing to book.",
      `African Music and Cultural Festival 2026\n\u{1F4CD} ${place}, Melbourne\n\u{1F4C5} Today, Sun 22 Nov, 10am to 10pm\n\u{1F4B2} Free entry\n\u{1F39F} Details on EventLinqs: link in our bio`,
    ].join('\n\n')
  const judge = (c: string) =>
    pieceQuality({ slides, caption: c, captions: [c], momentKind: 'final_day', madeAt: '2026-11-21T19:00:00Z', nights: new Map([['amcf', amcf]]), now: new Date('2026-11-21T19:30:00Z'), knownVenues: KNOWN }).filter((r) =>
      r.startsWith('[standard]'),
    )

  it("AMCF's story as it was held at 18:40 ('Federation Square') passes the gate on its venue's identity", () => {
    expect(judge(caption('Federation Square'))).toEqual([])
    expect(judge(caption('Fed Square'))).toEqual([])
  })

  it('a different venue holds that piece only, with the material discrepancy named', () => {
    expect(judge(caption('Birrarung Marr')).join(' ')).toMatch(/its place line names Birrarung Marr, a different venue from its own, Fed Square\./)
  })

  it('an unknown place is not a hold at the gate: it is corrected from the rows before posting', () => {
    expect(judge(caption('The Square'))).toEqual([])
  })
})
