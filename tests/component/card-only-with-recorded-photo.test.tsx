import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/city/geelong',
}))

import { EventCard, type EventCardData } from '@/components/features/events/event-card'

/*
 * A CARD ONLY WHERE A RIGHTS RECORDED PHOTOGRAPH EXISTS; EVERY OTHER EVENT IS A DIRECTORY ROW (the CONTROLLER's 16:41
 * of 1 November 2026, (1), Lawal's order of 16:40). The large date block and every EventLinqs logo tile come off every
 * card on every page. A photograph qualifies only when its rights are on record: a venue photograph the image chain
 * applied with its credit, or the organiser's own cover whose rights record reads authorised (cover_rights_recorded).
 * Every other night, with an unrecorded image, our composed cover, or no image, is a row: time, title, venue, suburb,
 * price or Free, and the ticket source. Nothing is drawn where a photograph would be.
 */
const night: EventCardData = {
  id: 'evt_beagles',
  slug: 'the-beagles-birds-basement-2026-11-06',
  title: 'The Beagles',
  cover_image_url: '/images/test/beagles.jpg',
  thumbnail_url: null,
  start_date: '2026-11-06T08:30:00Z',
  timezone: 'Australia/Melbourne',
  venue_name: "Bird's Basement",
  venue_city: 'Melbourne',
  venue_country: 'Australia',
  created_at: '2026-11-01T00:00:00Z',
  category: { name: 'Music', slug: 'music' },
  ticket_tiers: [],
  is_free: false,
  entry_mode: 'tickets',
  external_ticket_url: 'https://tickets.birdsbasement.com/4/?x=EV6a7bd12852f5b2',
}
const composed = 'https://x.supabase.co/storage/v1/object/public/event-images/generated-covers/evt_beagles.png'
const text = (c: HTMLElement) => (c.textContent ?? '').replace(/\s+/g, ' ')

describe('a card only where a rights recorded photograph exists', () => {
  it('the organiser’s cover with its rights on record is a photo card: the photograph, then time, title, venue, price', () => {
    const { container } = render(<EventCard event={{ ...night, cover_rights_recorded: true }} />)
    expect(container.querySelector('img')).not.toBeNull()
    expect(container.querySelector('.event-row')).toBeNull()
    expect(text(container)).toContain('7:30 pm')
    expect(text(container)).toContain("Bird's Basement, Melbourne")
  })

  it('a venue photograph applied with its credit is a photo card', () => {
    const { container } = render(<EventCard event={{ ...night, image_credit: 'Photo: the venue' }} />)
    expect(container.querySelector('img')).not.toBeNull()
  })

  it('an image whose rights are not on record is a directory row: no image, and every fact a visitor needs', () => {
    const { container } = render(<EventCard event={night} />)
    expect(container.querySelector('img')).toBeNull()
    const row = container.querySelector('a.event-row')
    expect(row).not.toBeNull()
    expect(row?.getAttribute('href')).toBe('/events/the-beagles-birds-basement-2026-11-06')
    const t = text(container)
    expect(t).toContain('Fri 6 Nov')
    expect(t).toContain('7:30 pm')
    expect(t).toContain('The Beagles')
    expect(t).toContain("Bird's Basement")
    expect(t).toContain('Melbourne')
    // Where it is sold, by the seller's own name, never its domain (Lawal, 2 November 2026, 09:00, refinement 1).
    expect(t).toContain('Tickets at Bird’s Basement')
    expect(t).not.toContain('birdsbasement.com')
  })

  it('our composed cover and a night with no image are rows too, and a free night says Free', () => {
    for (const cover_image_url of [composed, null]) {
      const { container, unmount } = render(<EventCard event={{ ...night, cover_image_url, cover_rights_recorded: true }} />)
      expect(container.querySelector('img')).toBeNull()
      expect(container.querySelector('a.event-row')).not.toBeNull()
      unmount()
    }
    const { container } = render(<EventCard event={{ ...night, cover_image_url: null, external_ticket_url: null, is_free: true }} />)
    // Read on its own: the row's text runs the suburb into the price ('MelbourneFree entry'), where \b misses 'Free'.
    expect(container.querySelector('.event-row-price')?.textContent ?? '').toMatch(/^Free/)
  })

  it('no card or row ever draws the large date block, the tinted panel or the EventLinqs mark', () => {
    for (const e of [night, { ...night, cover_rights_recorded: true }, { ...night, cover_image_url: composed }, { ...night, cover_image_url: null }]) {
      const { container, unmount } = render(<EventCard event={e} />)
      expect(container.querySelector('.ledger-date, .ledger-dd, .ledger-panel, [data-date-mark]')).toBeNull()
      expect(text(container)).not.toMatch(/EventLinqs\./i)
      unmount()
    }
  })
})

describe('the class cannot return', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('the card media draws nothing where no photograph may be shown: never the branded tile with a date or the mark', () => {
    expect(read('src/components/media/EventCardMedia.tsx')).not.toMatch(/<BrandedPlaceholder/)
  })

  it('no event page or related card draws the branded tile or a "No image" panel in place of a photograph', () => {
    expect(read('src/components/events/walk-in/walk-in-event-page.tsx')).not.toMatch(/<BrandedPlaceholder/)
    expect(read('src/components/features/events/event-sold-out.tsx')).not.toMatch(/No image/)
  })

  it('the date block and the tinted panel are gone from the styles, so no surface can draw them', () => {
    const css = read('src/app/globals.css')
    expect(css).not.toMatch(/@utility ledger-(date|dd|dw|dm|panel)\b/)
  })
})
