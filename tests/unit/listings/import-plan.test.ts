import { describe, expect, it } from 'vitest'
import type { ListingRow } from '@/lib/listings/listing-rows'
import {
  planImport,
  type ExistingSeries,
  type ExistingVenue,
  type ImportState,
} from '@/lib/listings/import-plan'

/**
 * WI2 Part 1: what one checked file writes (docs/walk-in/WI2-PLAN.md section 6).
 * The names and places below are invented for the test.
 */

const row = (over: Partial<ListingRow> = {}): ListingRow => ({
  citySlug: 'melbourne',
  date: '2026-10-22',
  rule: 'weekly',
  startsAt: '18:30',
  endsAt: '20:30',
  name: 'Corner Hall Trivia',
  host: 'The Corner Hall',
  address: '12 Example Street',
  suburb: 'Fitzroy',
  categorySlug: 'community',
  ageRestrictionMin: null,
  summary: 'Teams answer trivia rounds in the front room.',
  websiteUrl: 'https://cornerhall.example.com',
  instagramHandle: 'cornerhall',
  instagramPostUrl: null,
  venueEmail: null,
  donationOptional: false,
  bookingLinks: [],
  sourceUrl: 'https://whatson.example.com/corner-hall-trivia',
  sourceDate: '2026-10-21',
  ...over,
})

const venue = (over: Partial<ExistingVenue> = {}): ExistingVenue => ({
  id: 'v-1',
  name: 'The Corner Hall',
  address: '12 Example Street',
  slug: 'the-corner-hall',
  suburb: 'Fitzroy',
  citySlug: 'melbourne',
  websiteUrl: 'https://cornerhall.example.com',
  instagramHandle: 'cornerhall',
  publishedEmail: null,
  listingSource: 'eventlinqs',
  claimedAt: null,
  removedAt: null,
  ...over,
})

const series = (over: Partial<ExistingSeries> = {}): ExistingSeries => ({
  id: 's-1',
  venueId: 'v-1',
  name: 'Corner Hall Trivia',
  rule: 'weekly',
  anchorDate: '2026-10-22',
  startsAt: '18:30:00',
  endsAt: '20:30:00',
  timezone: 'Australia/Melbourne',
  categoryId: 'cat-community',
  ageRestrictionMin: null,
  summary: 'Teams answer trivia rounds in the front room.',
  instagramPostUrl: null,
  donationOptional: false,
  bookingLinks: [],
  listingSource: 'eventlinqs',
  status: 'active',
  lastCheckedOn: '2026-10-21',
  ...over,
})

const state = (over: Partial<ImportState> = {}): ImportState => ({
  categoryIds: new Map([
    ['community', 'cat-community'],
    ['music', 'cat-music'],
  ]),
  cities: new Map([
    ['melbourne', { slug: 'melbourne', name: 'Melbourne', state: 'VIC', timezone: 'Australia/Melbourne' }],
    ['geelong', { slug: 'geelong', name: 'Geelong', state: 'VIC', timezone: 'Australia/Melbourne' }],
  ]),
  venues: [],
  series: [],
  ...over,
})

const plan = (rows: ListingRow[], s: ImportState = state()) =>
  planImport(rows.map((r, i) => ({ line: i + 2, row: r })), s)

describe('a new host and its night', () => {
  it('makes the venue, the series and a confirmed check, all from the row', () => {
    const p = plan([row()])
    expect(p.venues).toEqual([
      {
        kind: 'create',
        ref: 'venue:1',
        values: {
          name: 'The Corner Hall',
          address: '12 Example Street',
          slug: 'the-corner-hall',
          suburb: 'Fitzroy',
          city: 'Melbourne',
          city_slug: 'melbourne',
          state: 'VIC',
          country: 'Australia',
          website_url: 'https://cornerhall.example.com',
          instagram_handle: 'cornerhall',
          published_email: null,
          listing_source: 'eventlinqs',
          is_active: true,
        },
      },
    ])
    const [r] = p.rows
    expect(r.verdict).toBe('write')
    if (r.verdict !== 'write') return
    expect(r.series).toMatchObject({
      kind: 'create',
      values: {
        venue: 'venue:1',
        name: 'Corner Hall Trivia',
        rule: 'weekly',
        anchor_date: '2026-10-22',
        day: 4, // a Thursday
        starts_at: '18:30',
        ends_at: '20:30',
        timezone: 'Australia/Melbourne',
        category_id: 'cat-community',
        listing_source: 'eventlinqs',
        status: 'active',
      },
    })
    expect(r.check).toEqual({
      outcome: 'confirmed',
      source_url: 'https://whatson.example.com/corner-hall-trivia',
      source_date: '2026-10-21',
    })
  })

  it('one host on two rows is one venue with two nights', () => {
    const p = plan([row(), row({ name: 'Corner Hall Open Mic', date: '2026-10-20', startsAt: '19:00', endsAt: '22:00' })])
    expect(p.venues).toHaveLength(1)
    expect(p.counts).toEqual({ write: 2, unchanged: 0, refused: 0 })
  })

  it('finds the host whatever its case, spacing or punctuation', () => {
    const p = plan([row(), row({ name: 'Second night', host: 'the corner  hall', address: '12 Example Street.' })])
    expect(p.venues).toHaveLength(1)
  })

  it('a taken handle takes the suburb, then a number', () => {
    const p = plan(
      [row(), row({ host: 'The Corner Hall', address: '1 Other Road', suburb: 'Fitzroy', name: 'Another' })],
      state({ venues: [venue({ id: 'v-org', address: '99 Elsewhere Lane', listingSource: 'organiser' })] }),
    )
    const slugs = p.venues.map((v) => (v.kind === 'create' ? v.values.slug : null))
    expect(slugs).toEqual(['the-corner-hall-fitzroy', 'the-corner-hall-fitzroy-2'])
  })
})

describe('importing the same file again writes nothing', () => {
  it('a known night with the same source date is unchanged', () => {
    const p = plan([row()], state({ venues: [venue()], series: [series()] }))
    expect(p.rows.map((r) => r.verdict)).toEqual(['unchanged'])
    expect(p.venues).toEqual([])
  })
})

describe('a newer source date records a fresh check', () => {
  it('confirmed when the night is as stored', () => {
    const p = plan([row({ sourceDate: '2026-10-28' })], state({ venues: [venue()], series: [series()] }))
    const [r] = p.rows
    expect(r.verdict === 'write' && r.series).toEqual({ kind: 'confirm', id: 's-1' })
    expect(r.verdict === 'write' && r.check.outcome).toBe('confirmed')
  })

  it('changed, naming the change, when it is not', () => {
    const p = plan([row({ sourceDate: '2026-10-28', endsAt: '21:00' })], state({ venues: [venue()], series: [series()] }))
    const [r] = p.rows
    expect(r.verdict === 'write' && r.series).toEqual({ kind: 'update', id: 's-1', changes: { ends_at: '21:00' } })
    expect(r.verdict === 'write' && r.check.outcome).toBe('changed')
    expect(r.verdict === 'write' && r.changed).toEqual(['ends_at'])
  })

  it('a night never checked takes its first check', () => {
    const p = plan([row()], state({ venues: [venue()], series: [series({ lastCheckedOn: null })] }))
    expect(p.rows[0].verdict).toBe('write')
  })
})

describe('refused, by name', () => {
  it('an older page does not overrule a newer one', () => {
    const p = plan([row({ sourceDate: '2026-10-15', startsAt: '19:00' })], state({ venues: [venue()], series: [series()] }))
    expect(p.rows[0]).toMatchObject({ verdict: 'refused', reasons: [expect.stringMatching(/not newer than the last check \(2026-10-21\).*starts_at/)] })
  })

  it('a removed venue is never listed again', () => {
    const p = plan([row()], state({ venues: [venue({ removedAt: '2026-10-25T01:00:00Z' })] }))
    expect(p.rows[0]).toMatchObject({ verdict: 'refused', reasons: [expect.stringMatching(/removed on 2026-10-25/)] })
    expect(p.venues).toEqual([])
  })

  it('a removed night is never listed again', () => {
    const p = plan([row({ sourceDate: '2026-10-28' })], state({ venues: [venue()], series: [series({ status: 'removed' })] }))
    expect(p.rows[0].verdict).toBe('refused')
  })

  it("an organiser's own venue, or a claimed one, is theirs", () => {
    expect(plan([row()], state({ venues: [venue({ listingSource: 'organiser' })] })).rows[0].verdict).toBe('refused')
    expect(plan([row()], state({ venues: [venue({ claimedAt: '2026-11-01T00:00:00Z' })] })).rows[0].verdict).toBe('refused')
  })

  it('the same night twice in one file', () => {
    const p = plan([row(), row()])
    expect(p.rows[1]).toMatchObject({ verdict: 'refused', reasons: ['repeats line 2: the same night of the same host'] })
  })

  it('the same stored night twice in one file, unchanged the first time', () => {
    const p = plan([row(), row()], state({ venues: [venue()], series: [series()] }))
    expect(p.rows.map((r) => r.verdict)).toEqual(['unchanged', 'refused'])
  })

  it('two rows naming different facts for one host', () => {
    const p = plan([row(), row({ name: 'Second', websiteUrl: 'https://other.example.com' })])
    expect(p.rows[1]).toMatchObject({ verdict: 'refused', reasons: [expect.stringMatching(/website_url .* differs from line 2/)] })
    expect(p.venues).toHaveLength(1)
  })

  it('a category or city the database does not hold', () => {
    expect(plan([row({ categorySlug: 'opera' })]).rows[0].verdict).toBe('refused')
    expect(plan([row({ citySlug: 'ballarat' })]).rows[0].verdict).toBe('refused')
  })
})

describe("a host's facts", () => {
  it('a blank never erases a stored value', () => {
    const p = plan([row({ sourceDate: '2026-10-28', websiteUrl: null, instagramHandle: null })], state({ venues: [venue()], series: [series()] }))
    expect(p.venues).toEqual([])
  })

  it('a newer row that names a new value updates the venue', () => {
    const p = plan([row({ sourceDate: '2026-10-28', venueEmail: 'hello@cornerhall.example.com' })], state({ venues: [venue()], series: [series()] }))
    expect(p.venues).toEqual([{ kind: 'update', id: 'v-1', changes: { published_email: 'hello@cornerhall.example.com' } }])
    expect(p.rows[0].verdict === 'write' && p.rows[0].changed).toEqual(['published_email'])
  })

  it('a row that writes nothing changes none of its host facts', () => {
    const p = plan([row({ venueEmail: 'hello@cornerhall.example.com' })], state({ venues: [venue()], series: [series()] }))
    expect(p.rows[0].verdict).toBe('unchanged')
    expect(p.venues).toEqual([])
  })

  it('a refused row makes no venue', () => {
    const p = plan([row({ categorySlug: 'opera' })])
    expect(p.venues).toEqual([])
  })
})
