import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ListingRow } from '@/lib/listings/listing-rows'
import { planImport, type ExistingSeries, type ImportState } from '@/lib/listings/import-plan'
import { occurrenceSlug } from '@/lib/listings/occurrence-plan'

/*
 * A MATINEE AND AN EVENING ARE TWO NIGHTS (directive 6, 1 November 2026: deduplicate without deleting legitimate separate
 * performances). The Geelong Arts Centre batch had 15 second sessions refused as 'the same night of the same host'
 * because a series was keyed on venue, name, rule and date with no start time (event_series_once_per_host). The key
 * now carries the local start time: in the import's plan, in the database's unique rule, and in the partner accept
 * path's conflict target; and a second session's dated event gets its own address when the first holds the plain one.
 */

const row = (over: Partial<ListingRow> = {}): ListingRow => ({
  citySlug: 'geelong',
  date: '2026-11-07',
  rule: 'once',
  startsAt: '13:30',
  endsAt: null,
  name: 'The Little Mermaid',
  host: 'The Story House',
  address: '50 Little Malop Street',
  suburb: 'Geelong',
  categorySlug: 'family',
  ageRestrictionMin: null,
  summary: 'A stage show of the story for families.',
  websiteUrl: null,
  instagramHandle: null,
  instagramPostUrl: null,
  venueEmail: null,
  donationOptional: false,
  bookingLinks: [],
  sourceUrl: 'https://www.geelongartscentre.org.au/whats-on/the-little-mermaid',
  sourceDate: '2026-11-01',
  ...over,
})

const state = (series: ExistingSeries[] = []): ImportState => ({
  categoryIds: new Map([['family', 'cat-family']]),
  cities: new Map([['geelong', { slug: 'geelong', name: 'Geelong', state: 'VIC', timezone: 'Australia/Melbourne' }]]),
  venues: series.length
    ? [{ id: 'v-1', name: 'The Story House', address: '50 Little Malop Street', slug: 'the-story-house', suburb: 'Geelong', citySlug: 'geelong', websiteUrl: null, instagramHandle: null, publishedEmail: null, listingSource: 'eventlinqs', claimedAt: null, removedAt: null }]
    : [],
  series,
})

const plan = (rows: ListingRow[], s: ImportState = state()) => planImport(rows.map((r, i) => ({ line: i + 2, row: r })), s)

const stored = (over: Partial<ExistingSeries> = {}): ExistingSeries => ({
  id: 's-1', venueId: 'v-1', name: 'The Little Mermaid', rule: 'once', anchorDate: '2026-11-07', startsAt: '13:30:00', endsAt: null,
  timezone: 'Australia/Melbourne', categoryId: 'cat-family', ageRestrictionMin: null, summary: 'A stage show of the story for families.',
  instagramPostUrl: null, donationOptional: false, bookingLinks: [], listingSource: 'eventlinqs', status: 'active', lastCheckedOn: '2026-11-01', ...over,
})

describe('two sessions of one show on one day', () => {
  it('both write: a matinee and an evening are two nights', () => {
    const p = plan([row(), row({ startsAt: '19:00' })])
    expect(p.rows.map((r) => r.verdict)).toEqual(['write', 'write'])
  })

  it('the same session twice is still one night: the second is refused', () => {
    const p = plan([row(), row()])
    expect(p.rows.map((r) => r.verdict)).toEqual(['write', 'refused'])
  })

  it('a stored matinee does not swallow a new evening: the evening writes as its own night', () => {
    const p = plan([row({ startsAt: '19:00' })], state([stored()]))
    expect(p.rows.map((r) => r.verdict)).toEqual(['write'])
  })

  it('a second session gets its own address when it is given its start; the first keeps the plain one', () => {
    expect(occurrenceSlug('The Little Mermaid', 'the-story-house', '2026-11-07')).toBe('the-little-mermaid-the-story-house-2026-11-07')
    expect(occurrenceSlug('The Little Mermaid', 'the-story-house', '2026-11-07', '19:00')).toBe('the-little-mermaid-the-story-house-2026-11-07-1900')
  })
})

describe('the database keys a night on its start too', () => {
  const dir = join(process.cwd(), 'supabase', 'migrations')
  const file = readdirSync(dir).filter((f) => f.endsWith('_series_session_key.sql')).sort().at(-1)
  const sql = file ? readFileSync(join(dir, file), 'utf8').replace(/\r\n/g, '\n') : ''

  it('a migration replaces event_series_once_per_host with a key that carries starts_at', () => {
    expect(file, 'a *_series_session_key.sql migration').toBeTruthy()
    expect(sql).toMatch(/drop constraint if exists event_series_once_per_host/i)
    expect(sql).toMatch(/unique \(venue_id, name, rule, anchor_date, starts_at\)/i)
  })

  it('the partner accept path conflicts on the same key, so a second session it accepts is written, not dropped', () => {
    expect(sql).toMatch(/on conflict \(venue_id, name, rule, anchor_date, starts_at\)/i)
    expect(sql).not.toMatch(/on conflict \(venue_id, name, rule, anchor_date\)\s/i)
  })
})
