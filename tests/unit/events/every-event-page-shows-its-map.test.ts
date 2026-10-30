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

describe('every event page shows its map', () => {
  test('the ticketed template draws the venue map', () => {
    expect(MAIN).toMatch(MAP_WITH_VENUE)
  })

  test('the walk-in template draws the same venue map, in Getting there', () => {
    expect(WALK_IN).toMatch(/import \{ VenueMapLazy \} from '@\/components\/features\/events\/venue-map-lazy'/)
    const gettingThere = WALK_IN.slice(WALK_IN.indexOf('{/* Getting there and access */}'), WALK_IN.indexOf('{/* Organised by */}'))
    expect(gettingThere).toMatch(MAP_WITH_VENUE)
  })
})
