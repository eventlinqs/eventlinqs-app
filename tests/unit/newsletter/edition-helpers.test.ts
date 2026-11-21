import { describe, expect, it } from 'vitest'
import { blurbOf, introOf, whenLabelOf, CITY_HERO_PHOTOS, type ReadNight } from '@/lib/newsletter/edition'

/* NL-1's edition reads, their pure parts: a night's date line, the featured blurb from its own words, the intro true to
   the picks, and a licensed hero photograph for each of the four cities. Production's own rows of 21 November 2026. */
const AT7 = new Date('2026-11-20T20:00:00Z') // 7 am Saturday 21 November, Melbourne

describe("a night's date line in the edition", () => {
  it('a festival under way is dated by its end; one evening by its start; a run not yet started by its days', () => {
    expect(whenLabelOf({ start_date: '2026-11-20T00:00:00Z', end_date: '2026-11-22T09:00:00Z', timezone: 'Australia/Melbourne' }, AT7)).toBe('Until Sun 22 Nov, 8pm')
    expect(whenLabelOf({ start_date: '2026-11-21T08:30:00Z', end_date: '2026-11-21T11:30:00Z', timezone: 'Australia/Melbourne' }, AT7)).toBe('Sat 21 Nov, 7:30pm')
    expect(whenLabelOf({ start_date: '2026-11-27T23:00:00Z', end_date: '2026-11-29T09:00:00Z', timezone: 'Australia/Melbourne' }, AT7)).toBe('Sat 28 to Sun 29 Nov')
  })
})

describe("the featured blurb is the night's own first sentence, or none", () => {
  const n = (summary: string | null) => ({ summary, title: 'African Music and Cultural Festival 2026', venue: 'Federation Square' }) as Pick<ReadNight, 'summary' | 'title' | 'venue'>
  it('takes the first sentence, leaves out the banned word outside the name, and a placeholder never reaches it', () => {
    expect(blurbOf(n('Three days of African music, food and art at Fed Square. Free entry all weekend.'))).toBe('Three days of African music, food and art at Fed Square.')
    expect(blurbOf(n('A night of cultural celebration for everyone in the family to enjoy.'))).toBeNull()
    expect(blurbOf(n(null))).toBeNull()
  })
})

describe('the intro says what the edition carries', () => {
  const night = (categorySlug: string, isFree = false) => ({ categorySlug, categoryName: categorySlug, isFree }) as unknown as ReadNight
  it('names the kinds present and free things only when a free night is picked', () => {
    expect(introOf('Melbourne', 'weekend', [night('festivals'), night('music'), night('comedy', true)])).toBe(
      'Here is the best of this weekend in Melbourne: festivals, live music, comedy and free things to do. Our top picks to help you plan it.',
    )
    expect(introOf('Bendigo', 'week', [night('theatre')])).toBe('Here is the best of this week in Bendigo: theatre. Our top picks to help you plan it.')
  })
})

describe('every Victorian city has its licensed hero photograph', () => {
  it('the four cities, each from the licensed library over https', () => {
    for (const city of ['melbourne', 'geelong', 'ballarat', 'bendigo']) expect(CITY_HERO_PHOTOS[city]).toMatch(/^https:\/\/images\.unsplash\.com\/photo-/)
  })
})
