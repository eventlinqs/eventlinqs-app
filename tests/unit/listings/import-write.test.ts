import { describe, expect, it } from 'vitest'
import type { ListingRow } from '@/lib/listings/listing-rows'
import { planImport, type ImportState } from '@/lib/listings/import-plan'
import { buildImportWrite, sqlLiteral, WriteRefusal } from '@/lib/listings/import-write'

/**
 * WI2 Part 1: the import's write as one statement. The names and places below
 * are invented for the test.
 */

const ORG = '00000000-0000-4000-8000-000000000001'
const TAG = '$w2_test$'

const row = (over: Partial<ListingRow> = {}): ListingRow => ({
  citySlug: 'geelong',
  date: '2026-10-21',
  rule: 'weekly',
  startsAt: '19:00',
  endsAt: '22:00',
  name: "Pat's Folk Night",
  host: "Pat's Bar",
  address: '3 Example Parade',
  suburb: 'Geelong West',
  categorySlug: 'music',
  ageRestrictionMin: 18,
  summary: 'Local players take turns on the small stage.',
  websiteUrl: null,
  instagramHandle: null,
  instagramPostUrl: null,
  venueEmail: null,
  donationOptional: false,
  bookingLinks: [],
  sourceUrl: 'https://example.com/pats',
  sourceDate: '2026-10-20',
  ...over,
})

const state = (over: Partial<ImportState> = {}): ImportState => ({
  categoryIds: new Map([['music', 'cat-music']]),
  cities: new Map([['geelong', { slug: 'geelong', name: 'Geelong', state: 'VIC', timezone: 'Australia/Melbourne' }]]),
  venues: [],
  series: [],
  ...over,
})

const build = (rows: ListingRow[], s = state(), file = 'geelong.csv sha256:abc') =>
  buildImportWrite(planImport(rows.map((r, i) => ({ line: i + 2, row: r })), s), ORG, file, TAG)

describe('sqlLiteral', () => {
  it('quotes text by doubling the quote, and nothing else', () => {
    expect(sqlLiteral("Pat's")).toBe("'Pat''s'")
    expect(sqlLiteral('a\\b')).toBe("'a\\b'")
    expect(sqlLiteral("'; drop table public.venues; --")).toBe("'''; drop table public.venues; --'")
  })

  it('null, numbers and booleans as themselves', () => {
    expect(sqlLiteral(null)).toBe('null')
    expect(sqlLiteral(undefined)).toBe('null')
    expect(sqlLiteral(18)).toBe('18')
    expect(sqlLiteral(true)).toBe('true')
  })

  it('refuses what it cannot write faithfully', () => {
    expect(() => sqlLiteral(Number.POSITIVE_INFINITY)).toThrow(WriteRefusal)
    expect(() => sqlLiteral('a\u0000b')).toThrow(WriteRefusal)
  })
})

describe('the write for a new host and its night', () => {
  const sql = build([row()])

  it('is one DO block under the given tag', () => {
    expect(sql.startsWith(`do ${TAG}\n`)).toBe(true)
    expect(sql.endsWith(`\n${TAG};`)).toBe(true)
    expect(sql.split(TAG)).toHaveLength(3)
  })

  it('makes the venue under the listings organisation, then the night at that venue, then its check', () => {
    const venue = sql.indexOf('insert into public.venues')
    const series = sql.indexOf('insert into public.event_series')
    const check = sql.indexOf('insert into public.listing_checks')
    expect(venue).toBeGreaterThan(-1)
    expect(series).toBeGreaterThan(venue)
    expect(check).toBeGreaterThan(series)
    expect(sql).toContain(
      `values ('${ORG}'::uuid, 'Geelong West', 'geelong', null, null, null, 'Pat''s Bar', '3 Example Parade', 'pat-s-bar', 'Geelong', 'VIC', 'Australia', 'eventlinqs', true)`,
    )
    expect(sql).toContain('returning id into v_venue_1;')
    expect(sql).toMatch(/insert into public\.event_series \(venue_id, organisation_id, [^)]*\) values \(v_venue_1, '[0-9a-f-]+'::uuid, /)
    expect(sql).toContain('returning id into v_series_1;')
    expect(sql).toContain(
      "values (v_series_1, 'https://example.com/pats', '2026-10-20', 'geelong.csv sha256:abc', 'confirmed');",
    )
  })

  it('writes the night as the row gave it', () => {
    expect(sql).toContain("'Pat''s Folk Night'")
    expect(sql).toContain("'weekly', '2026-10-21', 3") // the anchor and its weekday, a Wednesday
    expect(sql).toContain("'19:00', '22:00', 'Australia/Melbourne', 'cat-music', 18")
  })
})

describe('updates re-check the database before they count', () => {
  const venue = {
    id: '11111111-1111-4111-8111-111111111111',
    name: "Pat's Bar",
    address: '3 Example Parade',
    slug: 'pat-s-bar',
    suburb: 'Geelong West',
    citySlug: 'geelong',
    websiteUrl: null,
    instagramHandle: null,
    publishedEmail: null,
    listingSource: 'eventlinqs' as const,
    claimedAt: null,
    removedAt: null,
  }
  const series = {
    id: '22222222-2222-4222-8222-222222222222',
    venueId: venue.id,
    name: "Pat's Folk Night",
    rule: 'weekly' as const,
    anchorDate: '2026-10-21',
    startsAt: '19:00:00',
    endsAt: '22:00:00',
    timezone: 'Australia/Melbourne',
    categoryId: 'cat-music',
    ageRestrictionMin: 18,
    summary: 'Local players take turns on the small stage.',
    instagramPostUrl: null,
    donationOptional: false,
    bookingLinks: [],
    listingSource: 'eventlinqs' as const,
    status: 'active' as const,
    lastCheckedOn: '2026-10-20',
  }

  it('a changed night and a new host fact, each raising unless exactly one row moved', () => {
    const sql = build(
      [row({ sourceDate: '2026-10-27', endsAt: '23:00', websiteUrl: 'https://pats.example.com' })],
      state({ venues: [venue], series: [series] }),
    )
    expect(sql).toContain(
      `update public.venues set website_url = 'https://pats.example.com', updated_at = now() where id = '${venue.id}'::uuid and listing_source = 'eventlinqs' and claimed_at is null and removed_at is null;`,
    )
    expect(sql).toContain(
      `update public.event_series set ends_at = '23:00', updated_at = now() where id = '${series.id}'::uuid and listing_source = 'eventlinqs' and status <> 'removed';`,
    )
    expect(sql.match(/if v_n <> 1 then raise exception/g)).toHaveLength(2)
    expect(sql).toContain(`values ('${series.id}'::uuid, 'https://example.com/pats', '2026-10-27', 'geelong.csv sha256:abc', 'changed');`)
    expect(sql).not.toContain('insert into public.venues')
    expect(sql).not.toContain('insert into public.event_series')
  })
})

describe('refusals', () => {
  it('a value holding the block tag is refused, never written', () => {
    expect(() => build([row({ summary: `Players ${TAG} stage.` })])).toThrow(/quote tag/)
  })

  it('a tag that is not a dollar-quote tag', () => {
    expect(() => buildImportWrite(planImport([], state()), ORG, 'f', 'w2')).toThrow(/not a dollar-quote tag/)
  })
})
