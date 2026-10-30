import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { EventCard, type EventCardData } from '@/components/features/events/event-card'
import { seriesAlsoOn } from '@/lib/events/series-also-on'

/*
 * A RECURRING SERIES IS ONE EVENT (the photo system's P4): one card on a page, "its later dates named on that card". On
 * the date line, so a card in a rail keeps the height of every other; every date in the line's title.
 */

const TZ = 'Australia/Melbourne'
const LATER = ['2026-11-07T22:00:00Z', '2026-11-14T22:00:00Z', '2026-11-21T22:00:00Z']

describe('the later nights of a series, on its card', () => {
  it('names the next one and counts the rest', () => {
    expect(seriesAlsoOn(LATER, TZ)).toEqual({ words: 'also Sun 8 Nov and 2 more', every: 'Also on Sun 8 Nov, Sun 15 Nov, Sun 22 Nov' })
    expect(seriesAlsoOn(LATER.slice(0, 1), TZ)?.words).toBe('also Sun 8 Nov')
  })

  it('says nothing for a night that is not part of a series on the page', () => {
    expect(seriesAlsoOn(undefined, TZ)).toBeNull()
    expect(seriesAlsoOn([], TZ)).toBeNull()
  })

  it('the card carries it on its date line, with every date in the title', () => {
    const event = {
      id: 'e1', slug: 'market', title: 'The Melbourne Book Market', cover_image_url: null, thumbnail_url: null,
      start_date: '2026-10-31T22:00:00Z', timezone: TZ, venue_name: 'Queen Victoria Market', venue_city: 'Melbourne',
      venue_country: 'AU', created_at: '2026-10-01T00:00:00Z', category: null, ticket_tiers: [], also_on: LATER,
    } as EventCardData
    const html = renderToStaticMarkup(createElement(EventCard, { event }))
    expect(html).toContain('also Sun 8 Nov and 2 more')
    expect(html).toContain('title="Also on Sun 8 Nov, Sun 15 Nov, Sun 22 Nov"')
  })
})
