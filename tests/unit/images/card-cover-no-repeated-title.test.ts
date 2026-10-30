import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { EventCardMedia } from '@/components/media/EventCardMedia'
import { eventDateMark } from '@/lib/dates/event-time'

/*
 * THE CARD'S HONEST FALLBACK (the project manager's 16:42 of 30 October 2026, with Lawal): until a night has the
 * organiser's approved photo or an approved photo of its venue, its card shows the typographic cover WITHOUT the repeated
 * title: the category, a date mark and the EventLinqs mark only. On production that day 184 of the 185 nights on home,
 * /events, the categories, the cities and the browse pages drew the stored composed cover instead, a raster that prints
 * the title, the date, the venue, the price and the link, every one of them printed again beneath the card.
 */

// images.eventlinqs.com is on resolveImageSrc's fixed allow-list, so both URLs reach the drawing decision in a unit
// run with no Supabase host set; the own photograph drawing is the known positive that proves it.
const COMPOSED = 'https://images.eventlinqs.com/event-images/generated-covers/5d248d16-06f9-41cb-bcc6-918405c86a15/1793271917043.jpg'
const OWN = 'https://images.eventlinqs.com/event-images/3b753251-8986-4ac4-8a0e-db2e5cbf9998/cover.jpg'

describe('a card whose only image is our composed cover', () => {
  const html = renderToStaticMarkup(
    createElement(EventCardMedia, {
      src: COMPOSED,
      alt: 'Geelong City Market',
      variant: 'grid-one-two-three',
      category: 'Food & Drink',
      startDate: '2026-10-30T22:00:00.000Z',
      timeZone: 'Australia/Melbourne',
    }),
  )

  it('never draws the composed raster, whose artwork is the title', () => {
    expect(html).not.toContain('generated-covers')
    expect(html).not.toContain('<img')
  })

  it('never repeats the title', () => {
    expect(html).not.toContain('Geelong City Market')
  })

  it('shows the category, the date mark in the night\'s own zone and the EventLinqs mark', () => {
    expect(html).toContain('Food &amp; Drink')
    expect(html).toContain('data-date-mark="31 Oct"')
    expect(html).toContain('EventLinqs')
  })
})

describe("a card with the night's own photograph", () => {
  it('still draws the photograph', () => {
    const html = renderToStaticMarkup(
      createElement(EventCardMedia, { src: OWN, alt: 'AMCF 2026', variant: 'grid-one-two-three', category: 'Festival' }),
    )
    expect(html).toContain('<img')
    expect(html).not.toContain('data-date-mark')
  })
})

describe('the walk-in page hero', () => {
  it('asks heroIsTypographic before drawing the hero raster, as the event page does', () => {
    const src = readFileSync('src/components/events/walk-in/walk-in-event-page.tsx', 'utf8')
    expect(src).toMatch(/heroIsTypographic\(hero\)\s*\?\s*\(\s*<BrandedPlaceholder/)
  })
})

describe('eventDateMark', () => {
  it("reads the day and month in the night's own zone, across midnight UTC", () => {
    expect(eventDateMark('2026-10-30T22:00:00.000Z', 'Australia/Melbourne')).toEqual({ day: '31', month: 'Oct' })
    expect(eventDateMark('2026-10-30T22:00:00.000Z', 'Australia/Perth')).toEqual({ day: '31', month: 'Oct' })
    expect(eventDateMark('2026-10-30T14:00:00.000Z', 'Australia/Perth')).toEqual({ day: '30', month: 'Oct' })
  })

  it('says nothing for a date it cannot read', () => {
    expect(eventDateMark('not a date', 'Australia/Melbourne')).toBeNull()
    expect(eventDateMark(null, 'Australia/Melbourne')).toBeNull()
  })
})
