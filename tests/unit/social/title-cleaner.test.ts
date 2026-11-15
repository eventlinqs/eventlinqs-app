import { describe, expect, it } from 'vitest'
import { ctaFor, ctaPriceLine } from '@/lib/events/cta'
import { CARD_TITLE_MAX, cardTitle, cleanTitle, planCampaign, postTitle, type CampaignCity, type CampaignNight } from '@/lib/social/campaign'

/*
 * A POST NEVER SHOWS A TITLE WRAPPED IN QUOTES (the PM's 10:40 of 16 November 2026, item 2): out-15's JazzLab spotlight
 * showed Friday's source title as '"Songbird: The Eva Cassidy Experience"', its source's own quotation marks. One title
 * cleaner, used by every slide and story (postTitle and shortTitle call it), strips quotes and stray punctuation wrapping a
 * whole title, straight and curly, and keeps quotes inside a title. Red first, then the guard over a drawn week.
 */
const SONGBIRD = '"Songbird - The Eva Cassidy Experience" Starring Tarryn Stokes - BL Room'

describe('the title cleaner', () => {
  it('strips quotes wrapping a whole title, straight and curly, double and single', () => {
    expect(cleanTitle('"Songbird: The Eva Cassidy Experience"')).toBe('Songbird: The Eva Cassidy Experience')
    expect(cleanTitle('“Songbird: The Eva Cassidy Experience”')).toBe('Songbird: The Eva Cassidy Experience')
    expect(cleanTitle('‘Late Set’')).toBe('Late Set')
    expect(cleanTitle("'Late Set'")).toBe('Late Set')
    expect(cleanTitle('«Blue Notes»')).toBe('Blue Notes')
    expect(cleanTitle('  "Blue Notes"  ')).toBe('Blue Notes')
  })

  it('strips a stray double quote left at one end, and stray separators wrapping the title', () => {
    expect(cleanTitle('"Songbird')).toBe('Songbird')
    expect(cleanTitle('Songbird"')).toBe('Songbird')
    expect(cleanTitle('- Jazz Night -')).toBe('Jazz Night')
    expect(cleanTitle('** Comedy Gala **')).toBe('Comedy Gala')
    expect(cleanTitle('Jazz Night |')).toBe('Jazz Night')
    expect(cleanTitle('("Blue Notes")')).toBe('Blue Notes')
  })

  it('keeps quotes inside a title, apostrophes and a title of its own punctuation', () => {
    expect(cleanTitle('"Songbird: The Eva Cassidy Experience" Starring Tarryn Stokes')).toBe('"Songbird: The Eva Cassidy Experience" Starring Tarryn Stokes')
    expect(cleanTitle('The "Big" Night')).toBe('The "Big" Night')
    expect(cleanTitle('"Grease" vs "Hair"')).toBe('"Grease" vs "Hair"')
    expect(cleanTitle("Men's Shed Open Day")).toBe("Men's Shed Open Day")
    expect(cleanTitle("'Twas the Night Before Christmas")).toBe("'Twas the Night Before Christmas")
    expect(cleanTitle('Rock ’n’ Roll Revue')).toBe('Rock ’n’ Roll Revue')
    expect(cleanTitle('Oklahoma!')).toBe('Oklahoma!')
    expect(cleanTitle('What Now?')).toBe('What Now?')
    expect(cleanTitle('Mr. B.')).toBe('Mr. B.')
  })

  it("the JazzLab's Friday, as the card draws it (the regression case)", () => {
    expect(cardTitle(postTitle(SONGBIRD, 'JazzLab'), CARD_TITLE_MAX)).toBe('Songbird: The Eva Cassidy Experience')
  })
})

/* The guard: a week drawn from titles in their sources' own quotation marks shows none of them wrapped. */
const CITIES: CampaignCity[] = [{ slug: 'melbourne', name: 'Melbourne' }]
let seq = 0
function night(at: string, title: string, host = 'JazzLab'): CampaignNight {
  seq += 1
  const cta = ctaFor({ tiers: [{ price: 4500 }] })
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `night-${seq}`,
    title,
    startDate: at,
    timezone: 'Australia/Melbourne',
    citySlug: 'melbourne',
    cityName: 'Melbourne',
    venueName: host,
    host,
    categorySlug: 'music',
    summary: 'A quartet in the main room. Doors at seven.',
    approvedPhotoUrl: 'https://example.supabase.co/storage/v1/object/public/event-images/organisers/approved.jpg',
    photoCredit: `Photo by ${host}`,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $45' }),
  }
}
const week = [
  night('2026-11-17T08:30:00Z', '“Blue Notes” - JL Room'),
  night('2026-11-18T08:30:00Z', "'Late Set'"),
  night('2026-11-19T08:30:00Z', '"Darcy Gilkerson Quintet" - JL Room'),
  night('2026-11-20T09:00:00Z', SONGBIRD),
  night('2026-11-21T09:00:00Z', '"Saturday Session"', 'Corner Hotel'),
]
const WRAPPED = /^\s*["'“”‘’«»][\s\S]*["'“”‘’«»]\s*$/

function titlesIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) for (const v of value) titlesIn(v, out)
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if ((k === 'title' || k === 'draws' || k === 'heading') && typeof v === 'string') out.push(v)
      else titlesIn(v, out)
    }
  }
  return out
}

describe('the guard over a drawn week', () => {
  const plan = planCampaign({ nights: week, cities: CITIES, weekStart: '2026-11-16', origin: 'https://www.eventlinqs.com.au' })
  it('no row, ask, cover or story title is wrapped in quotes', () => {
    const titles = plan.pieces.flatMap((p) => titlesIn(p.slides))
    expect(titles.length).toBeGreaterThan(5)
    for (const t of titles) expect(t, t).not.toMatch(WRAPPED)
    for (const t of titles) expect(t.replace(/^Led by /, ''), t).not.toMatch(/^["“‘']/)
  })
  it('no caption shows a title wholly wrapped in its source quotes; quotes inside a title stay', () => {
    const all = plan.pieces.flatMap((p) => [p.caption, p.versions.instagram.caption, p.versions.facebook.caption]).join('\n')
    expect(all).not.toMatch(/["“]Blue Notes["”]|'Late Set'|["“]Saturday Session["”]|["“]Darcy Gilkerson Quintet["”]/)
    expect(all).toMatch(/Blue Notes/)
    // The JazzLab's Friday is a show's name in quotes inside a longer title: kept as written (the PM's rule).
    expect(all).toContain('"Songbird: The Eva Cassidy Experience" Starring Tarryn Stokes')
  })
})
