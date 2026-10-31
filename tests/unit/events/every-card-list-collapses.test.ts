// ONE LISTING, ONE CARD, ON EVERY PUBLIC LIST (the CONTROLLER's 1 November 2026 03:21 P1-a; WINDOW 6's 04:00 finding:
// 288 extra cards on 35 live pages, venue pages' 'Upcoming events at <venue>' 167, category grids 89, the city browse
// grids 32). Car 29 fixed the home page; the class is every file that draws EventCard. Each must collapse a listing's
// later nights into its one card (its also-on line), by collapseListings, oneCardPerEvent or notAlreadyListed.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, test } from 'vitest'
import { collapseListings } from '@/lib/events/one-card-per-event'

const root = process.cwd()
const COLLAPSES = /\b(collapseListings|oneCardPerEvent|notAlreadyListed)\(/

/** Files that draw ONE card, never a list, so nothing in them can repeat; each with its reason. */
const ONE_CARD_ONLY: Record<string, string> = {
  'src/components/templates/OrganisersLandingPage.tsx': 'one example card beside the words that describe it, never a list',
}

function filesDrawingCards(): string[] {
  const out = execFileSync('git', ['grep', '-l', '<EventCard\\b', '--', 'src'], { cwd: root, encoding: 'utf8' })
  return out.split(/\r?\n/).filter(Boolean).filter((f) => !(f in ONE_CARD_ONLY))
}

test('an exemption is only for a file that draws one card, and the file still exists', () => {
  for (const file of Object.keys(ONE_CARD_ONLY)) {
    const source = readFileSync(resolve(root, file), 'utf8')
    expect((source.match(/<EventCard\b/g) ?? []).length).toBe(1)
    expect(source).not.toMatch(/\.map\([^)]*\)\s*=>\s*\(?\s*<EventCard/)
  }
})

describe('every list of event cards collapses a listing to one card', () => {
  test.each(filesDrawingCards())('%s collapses its listings', (file) => {
    expect(readFileSync(resolve(root, file), 'utf8')).toMatch(COLLAPSES)
  })
})

describe('collapseListings', () => {
  const night = (id: string, start: string, extra: Record<string, string | null> = {}) => ({
    id, start_date: start, title: 'Hop Temple Trivia', venue_name: 'Hop Temple', listing_series_id: 'series-1', ...extra,
  })

  test('keeps one card per listing, naming its later nights, and never drops a different listing', () => {
    const cards = collapseListings([
      night('a', '2026-11-04T09:00:00Z'),
      night('b', '2026-11-11T09:00:00Z'),
      night('c', '2026-11-05T09:00:00Z', { title: 'Lounge Bar Live Music', venue_name: "Sailors' Rest", listing_series_id: 'series-2' }),
      night('d', '2026-11-18T09:00:00Z'),
    ])
    expect(cards.map((c) => c.id)).toEqual(['a', 'c'])
    expect(cards[0].also_on).toEqual(['2026-11-11T09:00:00Z', '2026-11-18T09:00:00Z'])
    expect(cards[1].also_on).toBeUndefined()
  })

  test('a cap counts cards, not nights, so a list still fills', () => {
    const many = Array.from({ length: 30 }, (_, i) => night(`n${i}`, `2026-11-${String((i % 28) + 1).padStart(2, '0')}T09:00:00Z`, { listing_series_id: `s${i % 10}`, title: `Night ${i % 10}` }))
    expect(collapseListings(many, 8)).toHaveLength(8)
    expect(collapseListings(many)).toHaveLength(10)
  })
})
