// EVERY EVENT PAGE SHOWS ITS MAP (Lawal 08:57, 'Make it work'; the controller's 08:27 and 09:35, 31 October 2026).
// Michael's ticketed page drew its map; the AMCF page drew none, because a free walk-in event leaves the main template
// at src/app/events/[slug]/page.tsx ('if (isWalkIn(event)) return <WalkInEventPage event={event} />', window 3's read)
// and src/components/events/walk-in/walk-in-event-page.tsx drew only a 'Get directions' link. Both templates now draw
// the same map component with the same venue facts. Pinned by reading both sources.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
const MAIN = read('src/app/events/[slug]/page.tsx')
const WALK_IN = read('src/components/events/walk-in/walk-in-event-page.tsx')

const MAP_WITH_VENUE = /<VenueMapLazy\s+bare\s+venueName=\{event\.venue_name\}\s+address=\{event\.venue_address\}\s+city=\{event\.venue_city\}\s+state=\{event\.venue_state\}\s+country=\{event\.venue_country\}\s+latitude=\{event\.venue_latitude\}\s+longitude=\{event\.venue_longitude\}\s*\/>/

// Since car 22 (the controller's 10:05 and 10:12) both templates draw the map through ONE shared venue section, so the
// map is pinned in that section and each template is pinned to draw the section.
const SECTION = read('src/components/events/event-page/event-venue-section.tsx')
const DRAWS_SECTION = /<EventVenueSection\b/

describe('every event page shows its map', () => {
  test('the shared venue section draws the venue map with the venue facts', () => {
    expect(SECTION).toMatch(/import \{ VenueMapLazy \} from '@\/components\/features\/events\/venue-map-lazy'/)
    expect(SECTION).toMatch(MAP_WITH_VENUE)
  })

  test('the ticketed template draws the venue section', () => {
    expect(MAIN).toMatch(DRAWS_SECTION)
  })

  test('the walk-in template draws the same venue section, in Getting there', () => {
    const from = WALK_IN.indexOf('{/* Getting there and access')
    expect(from).toBeGreaterThan(-1)
    const gettingThere = WALK_IN.slice(from, WALK_IN.indexOf('{/* Organised by */}'))
    expect(gettingThere).toMatch(DRAWS_SECTION)
  })
})
