import { describe, expect, test } from 'vitest'
import {
  countCategory,
  countCity,
  countCommunity,
  countCommunityCity,
  countFaith,
  countSuburb,
  matchesCity,
  matchesCommunity,
  matchesFaith,
  matchesSuburb,
  type DiscoveryEventRow,
} from '@/lib/seo/discovery-counts'
import { getCommunityTags } from '@/lib/communities/tag-bridge'
import { getFaithTags } from '@/lib/faiths/data'

/**
 * THE MATCHERS THAT DECIDE WHETHER A TEMPLATED PAGE IS INDEXABLE (close-out C19).
 *
 * These are pure functions mirroring SQL the discovery pages already run, and
 * the sitemap and the pages both read them, so a mistake here moves 490 URLs at
 * once in one direction or the other. Each test below names the SQL it mirrors.
 */

const row = (over: Partial<DiscoveryEventRow> = {}): DiscoveryEventRow => ({
  tags: [],
  venue_city: null,
  suburb_primary: null,
  venue_latitude: null,
  venue_longitude: null,
  category_slug: null,
  ...over,
})

describe('matchesCity mirrors `venue_city ilike %name%`', () => {
  test('is a case-insensitive substring, exactly as ilike with wildcards both sides', () => {
    expect(matchesCity(row({ venue_city: 'Melbourne' }), 'melbourne')).toBe(true)
    expect(matchesCity(row({ venue_city: 'melbourne' }), 'Melbourne')).toBe(true)
    // The wildcards are why "North Melbourne" is a Melbourne event on the city
    // page. Dropping that would silently empty the largest city surface.
    expect(matchesCity(row({ venue_city: 'North Melbourne' }), 'Melbourne')).toBe(true)
    expect(matchesCity(row({ venue_city: 'Geelong' }), 'Melbourne')).toBe(false)
  })

  test('a null venue_city matches nothing, as a null never satisfies ilike', () => {
    expect(matchesCity(row({ venue_city: null }), 'Melbourne')).toBe(false)
  })
})

describe('matchesCommunity mirrors the tag bridge `tags.cs.["token"]` set', () => {
  test('any one identifying token is enough, and a foreign token is not', () => {
    const african = getCommunityTags('african')
    expect(african.length).toBeGreaterThan(0)
    expect(matchesCommunity(row({ tags: [african[0]] }), 'african')).toBe(true)
    expect(matchesCommunity(row({ tags: ['unrelated', african[1]] }), 'african')).toBe(true)
    expect(matchesCommunity(row({ tags: ['unrelated'] }), 'african')).toBe(false)
    expect(matchesCommunity(row({ tags: [] }), 'african')).toBe(false)
  })

  test('the tokens come from the bridge, not from this test', () => {
    // If a token leaves COMMUNITY_TO_TAGS the matcher must stop matching it,
    // because the page's SQL would stop matching it on the same edit.
    const greek = getCommunityTags('greek')
    for (const token of greek) expect(matchesCommunity(row({ tags: [token] }), 'greek')).toBe(true)
    expect(matchesCommunity(row({ tags: ['afrobeats'] }), 'greek')).toBe(false)
  })
})

describe('matchesFaith mirrors the faith tag set', () => {
  test('uses the faith tokens and not the community ones', () => {
    const christian = getFaithTags('christian')
    expect(christian.length).toBeGreaterThan(0)
    expect(matchesFaith(row({ tags: [christian[0]] }), 'christian')).toBe(true)
    expect(matchesFaith(row({ tags: ['afrobeats'] }), 'christian')).toBe(false)
  })
})

describe('matchesSuburb mirrors the exclusive nearest-district rule', () => {
  test('suburb_primary wins when it is written', () => {
    expect(matchesSuburb(row({ suburb_primary: 'sydney-inner-west' }), 'sydney', 'sydney-inner-west')).toBe(true)
    expect(matchesSuburb(row({ suburb_primary: 'sydney-north-shore' }), 'sydney', 'sydney-inner-west')).toBe(false)
  })

  test('with no suburb_primary and no coordinates, the event belongs to no district', () => {
    // The resolver returns null without a coordinate pair, and null is not a
    // district, so an event with neither is counted by no suburb page. That is
    // the correct answer: an inclusive fallback would hand the same events to
    // every district and make six district pages six copies of the city page.
    expect(matchesSuburb(row(), 'sydney', 'sydney-inner-west')).toBe(false)
  })
})

describe('the counts compose the matchers the way the pages compose the SQL', () => {
  const rows: DiscoveryEventRow[] = [
    row({ tags: [getCommunityTags('african')[0]], venue_city: 'Melbourne', category_slug: 'music' }),
    row({ tags: [getCommunityTags('african')[0]], venue_city: 'Sydney', category_slug: 'music' }),
    row({ tags: [getCommunityTags('greek')[0]], venue_city: 'Melbourne', category_slug: 'food-drink' }),
    row({ venue_city: 'Melbourne', category_slug: 'music' }),
  ]

  test('a community counts across every city', () => {
    expect(countCommunity(rows, 'african')).toBe(2)
    expect(countCommunity(rows, 'greek')).toBe(1)
    expect(countCommunity(rows, 'italian')).toBe(0)
  })

  test('an intersection needs BOTH the community and the city, which is why 420 of them are empty', () => {
    expect(countCommunityCity(rows, 'african', 'Melbourne')).toBe(1)
    expect(countCommunityCity(rows, 'african', 'Sydney')).toBe(1)
    expect(countCommunityCity(rows, 'greek', 'Sydney')).toBe(0)
  })

  test('a city counts every event in it, whatever its community', () => {
    expect(countCity(rows, 'Melbourne')).toBe(3)
    expect(countCity(rows, 'Sydney')).toBe(1)
    expect(countCity(rows, 'Perth')).toBe(0)
  })

  test('a category counts on either slug the page queries with', () => {
    expect(countCategory(rows, ['music', 'music'])).toBe(3)
    expect(countCategory(rows, ['food-drink', 'food & drink'])).toBe(1)
    expect(countCategory(rows, ['comedy'])).toBe(0)
  })

  test('a suburb is narrowed inside its city, never across cities', () => {
    const withSuburbs = [
      row({ venue_city: 'Sydney', suburb_primary: 'sydney-inner-west' }),
      row({ venue_city: 'Melbourne', suburb_primary: 'sydney-inner-west' }),
    ]
    expect(countSuburb(withSuburbs, 'Sydney', 'sydney', 'sydney-inner-west')).toBe(1)
  })

  test('a faith counts on its own tokens', () => {
    const faithRows = [row({ tags: [getFaithTags('christian')[0]] }), row({ tags: ['afrobeats'] })]
    expect(countFaith(faithRows, 'christian')).toBe(1)
  })
})
