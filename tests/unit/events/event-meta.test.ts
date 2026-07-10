import { describe, it, expect } from 'vitest'
import { buildEventMetaDescription } from '@/lib/events/event-meta'

describe('buildEventMetaDescription', () => {
  it('uses venue city + summary when present', () => {
    const d = buildEventMetaDescription({
      title: 'Afrobeats Live',
      summary: 'A night of West African headliners.',
      venueCity: 'Melbourne',
    })
    expect(d).toBe('In Melbourne. A night of West African headliners.')
  })

  it('strips HTML from description when no summary', () => {
    const d = buildEventMetaDescription({
      title: 'Gala',
      description: '<p>Black-tie  <strong>charity</strong> gala</p>',
      venueCity: 'Sydney',
    })
    expect(d).toBe('In Sydney. Black-tie charity gala')
  })

  it('still non-empty when summary/description empty but venue_city present', () => {
    const d = buildEventMetaDescription({ title: 'Show', summary: null, description: '', venueCity: 'Perth' })
    expect(d).toBe('In Perth.')
    expect(d.length).toBeGreaterThan(0)
  })

  // The regression: summary, description AND venue_city all empty (the CI seed
  // event afrobeats-melbourne-summer-sessions). Old logic returned '' -> no meta
  // description -> SEO 0.92. The fallback must produce a non-empty sentence.
  it('falls back to a meaningful sentence when summary, description AND venue_city are all empty', () => {
    const d = buildEventMetaDescription({
      title: 'Afrobeats Melbourne Summer Sessions',
      summary: null,
      description: null,
      venueCity: null,
      venueName: null,
      dateLabel: 'Sat 12 Dec',
      categoryName: 'Afrobeats & Amapiano',
    })
    expect(d.length).toBeGreaterThan(0)
    expect(d).toContain('Afrobeats Melbourne Summer Sessions')
    expect(d).toContain('Afrobeats & Amapiano')
    expect(d).toContain('on Sat 12 Dec')
  })

  it('fallback works with only a title (every other field empty)', () => {
    const d = buildEventMetaDescription({ title: 'Mystery Event' })
    expect(d).toBe('Get tickets to Mystery Event. All-in pricing, no surprise fees.')
    expect(d.length).toBeGreaterThan(0)
  })

  it('never returns an empty string across degenerate inputs', () => {
    const cases = [
      { title: 'A' },
      { title: 'B', summary: '   ', description: '   ', venueCity: '   ' },
      { title: 'C', description: '<p></p>' },
      { title: 'D', venueName: 'The Venue' },
    ]
    for (const c of cases) {
      expect(buildEventMetaDescription(c).trim().length).toBeGreaterThan(0)
    }
  })

  it('caps at 155 characters', () => {
    const d = buildEventMetaDescription({
      title: 'X',
      summary: 'y'.repeat(300),
      venueCity: 'Brisbane',
    })
    expect(d.length).toBeLessThanOrEqual(155)
  })
})
