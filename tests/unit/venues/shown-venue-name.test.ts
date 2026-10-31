import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { shownVenueName, venueRepeatsTitle } from '@/lib/venues/shown-venue-name'

/*
 * THE VENUE LINE NEVER REPEATS THE TITLE (the CONTROLLER's 21:00 of 31 October 2026: 'Melbourne Diwali' over a venue line
 * 'Melbourne Diwali' on the live home). The rows are production's own (C:\dev\EVIDENCE\CARD-DATE-MARK-31OCT\
 * venue-repeats-title-production.json): the import wrote the event's name as the venue of outdoor markets and festivals.
 */
describe('shownVenueName', () => {
  it("a venue named after the event shows the first part of its stored address", () => {
    expect(shownVenueName({ title: 'Melbourne Diwali', venue_name: 'Melbourne Diwali', venue_address: '740 Bourke Street' })).toBe('740 Bourke Street')
    expect(shownVenueName({ title: "Melbourne Makers' Market", venue_name: "Melbourne Makers' Market", venue_address: 'City Square, Swanston Street' })).toBe('City Square')
    expect(shownVenueName({ title: 'The Street Social: Halloween', venue_name: 'The Street Social', venue_address: 'Harbour Esplanade' })).toBe('Harbour Esplanade')
  })

  it('a real place keeps its name, even when the title begins with it', () => {
    expect(shownVenueName({ title: 'Hop Temple Trivia', venue_name: 'Hop Temple', venue_address: '24-28 Armstrong Street North' })).toBe('Hop Temple')
    expect(shownVenueName({ title: 'Live Music Garden Session', venue_name: 'Where You Meet', venue_address: null })).toBe('Where You Meet')
  })

  it('with no address to fall back on, it says nothing rather than the title again', () => {
    expect(shownVenueName({ title: 'Melbourne Diwali', venue_name: 'Melbourne Diwali', venue_address: null })).toBeNull()
  })

  it('compares words, not case or punctuation', () => {
    expect(venueRepeatsTitle('Southbank Makers Market', 'SOUTHBANK MAKERS MARKET.')).toBe(true)
    expect(venueRepeatsTitle('Macbeth', 'Geelong Arts Centre')).toBe(false)
  })
})

describe('every page that names the venue beside the title asks shownVenueName', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
  it.each([
    ['src/components/features/events/this-week-card.tsx', /venue: shownVenueName\(event\)/],
    ['src/components/features/home/FeaturedHero.tsx', /\[shownVenueName\(event\), event\.venue_city/],
    ['src/app/events/[slug]/page.tsx', /\{shownVenueName\(event\) \?\? event\.venue_name\}/],
    ['src/components/events/walk-in/walk-in-event-page.tsx', /eyebrowPlace = \[shownVenueName\(event\)/],
  ])('%s', (p, re) => {
    expect(read(p)).toMatch(re)
  })
  it('the home read selects the address the card falls back on', () => {
    expect(read('src/lib/events/home-queries.ts')).toMatch(/venue_name, venue_address, venue_city/)
  })
})
