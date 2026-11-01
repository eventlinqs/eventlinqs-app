import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { venueMatchFor } from '@/lib/listings/accept-choice'

/**
 * A PERSON'S ACCEPT PUBLISHES THE NIGHT (20261101171501): the review page pre-selects the held venue a new candidate
 * names, and the accept action publishes through listing_publish_accepted_night with the venue and category the person
 * confirmed. Never a venue invented from the candidate's words: no match means the person chooses.
 */

const venues = [
  { id: 'v1', name: "Sailors' Rest", address: '3 Moorabool Street', citySlug: 'geelong' },
  { id: 'v2', name: 'Costa Hall', address: '1 Gheringhap St', citySlug: 'geelong' },
  { id: 'v3', name: 'Costa Hall', address: '1 Somewhere Rd', citySlug: 'ballarat' },
]

describe('the held venue a new candidate names', () => {
  it('matches by name in the source city, ignoring case, quotes and spacing', () => {
    expect(venueMatchFor({ venueName: 'Sailors Rest', venueAddress: null, citySlug: 'geelong' }, venues)).toBe('v1')
    expect(venueMatchFor({ venueName: '  costa   hall ', venueAddress: null, citySlug: 'geelong' }, venues)).toBe('v2')
  })
  it('matches by street address in the source city when the name differs', () => {
    expect(venueMatchFor({ venueName: 'Deakin Waterfront Auditorium', venueAddress: '1 Gheringhap St, Geelong VIC', citySlug: 'geelong' }, venues)).toBe('v2')
  })
  it('never matches a venue of another city, and says nothing when nothing matches', () => {
    expect(venueMatchFor({ venueName: 'Costa Hall', venueAddress: null, citySlug: 'bendigo' }, venues)).toBeNull()
    expect(venueMatchFor({ venueName: 'The New Room', venueAddress: '9 Other St', citySlug: 'geelong' }, venues)).toBeNull()
  })
  it('two held venues of one name in the city is not a match: the person chooses', () => {
    const twice = [...venues, { id: 'v4', name: 'Costa Hall', address: '2 Elsewhere St', citySlug: 'geelong' }]
    expect(venueMatchFor({ venueName: 'Costa Hall', venueAddress: null, citySlug: 'geelong' }, twice)).toBeNull()
  })
})

describe('the accept action publishes a new night', () => {
  it('calls listing_publish_accepted_night with the venue and category the person confirmed, and the reviewer', () => {
    const src = readFileSync(join(process.cwd(), 'src/app/admin/(authed)/collected/actions.ts'), 'utf8').replace(/\r\n/g, '\n')
    expect(src).toMatch(/rpc\('listing_publish_accepted_night', \{ p_candidate: [^,]+, p_venue: [^,]+, p_category: [^,]+, p_reviewer: session\.userId \}\)/)
  })
})
