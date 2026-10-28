import { describe, expect, it } from 'vitest'
import { headerProblem, judgeRow, LISTING_COLUMNS, type JudgeContext, type ListingRow } from '@/lib/listings/listing-rows'
import { bookingLinksJson, planImport, type ExistingSeries, type ImportState } from '@/lib/listings/import-plan'
import { buildImportWrite } from '@/lib/listings/import-write'

/**
 * WI3, the import's half (docs/walk-in/WI3-DECISION.md: "Window 4: the
 * import's multi URL rows call bookingLinksSql and sameEvent"): a night sold
 * elsewhere, or free with registration, imports with every place it sells, and
 * a free walk-in night carries none. The names and places below are invented.
 */

const ctx: JudgeContext = {
  now: new Date('2026-10-27T08:00:00Z'),
  categorySlugs: new Set(['music', 'community']),
  guideCities: new Map([['geelong', 'Australia/Melbourne']]),
}

const sold = {
  city: 'geelong',
  date: '2026-11-06',
  day: 'Fri',
  start: '7:00pm',
  finish: '',
  frequency: 'once',
  name: 'The Harbour Band',
  host: 'The Harbour Hall',
  address: '1 Example Quay',
  suburb: 'Geelong',
  category: 'music',
  entry: 'Tickets',
  age_limit: '',
  what_happens: 'A five piece band plays two sets in the main hall.',
  website: 'https://harbourhall.example.com',
  instagram: '',
  instagram_post: '',
  venue_email: '',
  facebook: '',
  source_url: 'https://harbourhall.example.com/whats-on/harbour-band',
  source_date: '2026-10-27',
  freshness: 'CURRENT',
  notes: '',
  booking_urls: 'https://tickets.example.com/harbour-band https://other.example.com/e/harbour-band',
  price_from: '35.50',
}
const judge = (over: Partial<typeof sold> = {}) => judgeRow({ ...sold, ...over }, ctx)
const reasons = (over: Partial<typeof sold>) => {
  const v = judge(over)
  return v.verdict === 'import' ? '' : v.reasons.join(' | ')
}

describe('a row sold elsewhere', () => {
  it('imports with every place it sells, the price on the first, dated by its source', () => {
    const v = judge()
    expect(v.verdict).toBe('import')
    const row = (v as { row: ListingRow }).row
    expect(row.bookingLinks).toEqual([
      { url: 'https://tickets.example.com/harbour-band', kind: 'tickets', price_from_cents: 3550, price_checked_on: '2026-10-27' },
      { url: 'https://other.example.com/e/harbour-band', kind: 'tickets', price_from_cents: null, price_checked_on: null },
    ])
  })

  it('free with registration is a link of its own kind, with no price', () => {
    const v = judge({ entry: 'Free; registration required', booking_urls: 'https://register.example.com/x', price_from: '' })
    expect((v as { row: ListingRow }).row.bookingLinks).toEqual([
      { url: 'https://register.example.com/x', kind: 'free_register', price_from_cents: null, price_checked_on: null },
    ])
    expect(reasons({ entry: 'Free; registration required', booking_urls: 'https://register.example.com/x', price_from: '10' })).toMatch(
      /only for a night sold with tickets/,
    )
  })

  it('is refused with no place to book, a link that is not https, or a price that is not dollars', () => {
    expect(reasons({ booking_urls: '' })).toMatch(/needs booking_urls/)
    expect(reasons({ booking_urls: 'http://tickets.example.com/x' })).toMatch(/is not an https address/)
    expect(reasons({ price_from: '$35' })).toMatch(/is not dollars/)
  })

  it('a free walk-in night carries no links or price', () => {
    expect(reasons({ entry: 'Free', booking_urls: '', price_from: '' })).toBe('')
    expect((judge({ entry: 'Free', booking_urls: '', price_from: '' }) as { row: ListingRow }).row.bookingLinks).toEqual([])
    expect(reasons({ entry: 'Free' })).toMatch(/a free walk-in night has no booking_urls/)
  })

  it('a file may carry the two columns, and need not', () => {
    expect(headerProblem([...LISTING_COLUMNS])).toBeNull()
    expect(headerProblem([...LISTING_COLUMNS, 'booking_urls', 'price_from'])).toBeNull()
    expect(headerProblem([...LISTING_COLUMNS, 'ticket_url'])).toMatch(/not columns of this file: ticket_url/)
  })
})

describe('the plan and the write keep the links on the night', () => {
  const row = (judge() as { row: ListingRow }).row
  const state = (series: ExistingSeries[] = []): ImportState =>
    ({
      categoryIds: new Map([['music', 'cat-music']]),
      cities: new Map([['geelong', { slug: 'geelong', name: 'Geelong', state: 'VIC', timezone: 'Australia/Melbourne' }]]),
      venues: series.length
        ? [{ id: 'v-1', name: 'The Harbour Hall', address: '1 Example Quay', slug: 'the-harbour-hall', suburb: 'Geelong', citySlug: 'geelong', websiteUrl: 'https://harbourhall.example.com', instagramHandle: null, publishedEmail: null, listingSource: 'eventlinqs', claimedAt: null, removedAt: null }]
        : [],
      series,
    }) as unknown as ImportState

  it('a new night is written with its links as jsonb', () => {
    const plan = planImport([{ line: 2, row }], state())
    const sql = buildImportWrite(plan, '00000000-0000-4000-8000-000000000001', 'test.csv', '$w3_test$')
    expect(sql).toContain(`${"'"}${bookingLinksJson(row.bookingLinks)}'::jsonb`)
  })

  it('a stored night whose links moved is changed; the same links are unchanged', () => {
    const stored: ExistingSeries = {
      id: 's-1', venueId: 'v-1', name: row.name, rule: 'once', anchorDate: row.date, startsAt: '19:00:00', endsAt: null,
      timezone: 'Australia/Melbourne', categoryId: 'cat-music', ageRestrictionMin: null, summary: row.summary,
      instagramPostUrl: null, donationOptional: false, bookingLinks: row.bookingLinks.slice(0, 1),
      listingSource: 'eventlinqs', status: 'active', lastCheckedOn: '2026-10-20',
    }
    const moved = planImport([{ line: 2, row }], state([stored]))
    expect(moved.rows[0]).toMatchObject({ verdict: 'write', changed: ['booking_links'] })
    const same = planImport([{ line: 2, row: { ...row, sourceDate: '2026-10-20' } }], state([{ ...stored, bookingLinks: row.bookingLinks }]))
    expect(same.rows[0]).toMatchObject({ verdict: 'unchanged' })
  })
})
