/**
 * THE CITY GUIDE'S WEEK CARD RENDERS A REAL IMAGE (WI2 Part 2, WI2-ITEM.md
 * section 6: "Each page has its own share card for Instagram").
 *
 * The real renderer, the real fonts, outside any server, as
 * social-card-renders.test.ts does for the event cards: the OUTPUT is asserted,
 * a decodable JPEG at the published pixel size, for a full week, an empty one,
 * and a title too long for its row.
 */
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { CITY_WEEK_CARD_ROWS, renderCityWeekCard, type CityWeekCardInput } from '@/lib/broadcast/social-cards'
import { SOCIAL_CARD_FORMATS, SOCIAL_CARD_MAX_BYTES } from '@/lib/broadcast/social-card-spec'
import { fitOneLine } from '@/lib/broadcast/social-card-layout'

function week(items: CityWeekCardInput['items']): CityWeekCardInput {
  return {
    cityName: 'Geelong',
    week: 'Saturday 24 to Friday 30 October',
    total: items.length,
    items,
    path: '/free/geelong/this-week',
    qr: null,
  }
}

const SEVEN = [
  { day: 'Today', title: 'Silent Book Club', label: 'Free entry, no ticket needed' },
  { day: 'Sun 25', title: 'Sunday Session Live Music', label: 'Free entry, no ticket needed' },
  { day: 'Mon 26', title: 'Comedy Open Mic', label: 'Free entry, no ticket needed' },
  { day: 'Tue 27', title: "Trivia at Murphy's Geelong", label: 'Free entry, no ticket needed' },
  { day: 'Wed 28', title: 'Storytime', label: 'Free, ticket needed' },
  { day: 'Thu 29', title: 'Toddler Time', label: 'Free entry, no ticket needed' },
  { day: 'Fri 30', title: 'Puzzle and Chat', label: 'Free entry, no ticket needed' },
]

describe('the city week card', () => {
  for (const format of ['story', 'square'] as const) {
    const spec = SOCIAL_CARD_FORMATS[format]

    it(`${format}: a full week renders a JPEG at ${spec.width} x ${spec.height}, inside the size ceiling`, async () => {
      const bytes = await renderCityWeekCard(format, week(SEVEN))
      const meta = await sharp(Buffer.from(bytes)).metadata()
      expect(meta.format).toBe('jpeg')
      expect(meta.width).toBe(spec.width)
      expect(meta.height).toBe(spec.height)
      expect(bytes.byteLength).toBeLessThan(SOCIAL_CARD_MAX_BYTES)
    }, 60_000)

    it(`${format}: an empty week still renders the card, never an error`, async () => {
      const bytes = await renderCityWeekCard(format, week([]))
      const meta = await sharp(Buffer.from(bytes)).metadata()
      expect(meta.width).toBe(spec.width)
    }, 60_000)
  }

  it('the story carries more rows than the square, and neither carries the whole of a long week', () => {
    expect(CITY_WEEK_CARD_ROWS.story).toBeGreaterThan(CITY_WEEK_CARD_ROWS.square)
    expect(CITY_WEEK_CARD_ROWS.story).toBeLessThan(SEVEN.length)
  })

  it('a title too long for its row renders, shortened rather than wrapped', async () => {
    const long = [{ day: 'Tue 27', title: 'A very long free community night with a name that runs right across the card and beyond its edge', label: 'Free entry, no ticket needed' }]
    const bytes = await renderCityWeekCard('square', week(long))
    expect((await sharp(Buffer.from(bytes)).metadata()).height).toBe(SOCIAL_CARD_FORMATS.square.height)
  }, 60_000)
})

describe('one line, fitted', () => {
  // Every character 10 units wide at size 20: a predictable measure.
  const measure = (text: string, size: number) => text.length * size * 0.5

  it('a line that fits is returned whole', () => {
    expect(fitOneLine('Trivia night', 400, 20, measure)).toBe('Trivia night')
  })

  it('a line that does not fit keeps whole words and ends in an ellipsis', () => {
    const out = fitOneLine('Trivia night at the Wool Exchange', 160, 20, measure)
    expect(out.endsWith('…')).toBe(true)
    expect(measure(out, 20)).toBeLessThanOrEqual(160)
    expect(out).toBe('Trivia night at…')
  })

  it('a single word too long for the line is cut inside the word', () => {
    const out = fitOneLine('Supercalifragilistic', 100, 20, measure)
    expect(measure(out, 20)).toBeLessThanOrEqual(100)
    expect(out.endsWith('…')).toBe(true)
  })
})
