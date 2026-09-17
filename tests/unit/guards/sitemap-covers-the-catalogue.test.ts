import { describe, it, expect } from 'vitest'
import { decide, summarise, FAMILIES, NAMED_LIMIT } from '../../../scripts/guards/sitemap-covers-the-catalogue.mjs'
import { comparePaths } from '@/lib/seo/sitemap-catalogue'

/**
 * CLOSE-OUT SEO2, the guard's verdict table.
 *
 * Every sitemap defect on record in this repository was silent, and two of them
 * were silent in a way this guard has to be careful about: a query that ERRORED
 * and a block that published NOTHING look identical from the outside. So the
 * cases below separate them deliberately, and the SKIP cases exist because a
 * guard that cannot look must say so rather than pass.
 */

const REAL = 'https://vkapkibzokmfaxqogypq.supabase.co'
const KEY = 'service-role-key'

/** One family as the probe reports it. Written out because the tests plant an
 * error string into a field that starts life null, and an inferred `null` type
 * cannot hold one. */
type FamilySide = { publishedError: string | null; published: string[]; expected: string[] }
type Probe = { looked: boolean; truncated: boolean; families: Record<string, FamilySide> }

const agreeing = (paths: Record<string, string[]>): Probe => ({
  looked: true,
  truncated: false,
  families: Object.fromEntries(
    FAMILIES.map((f: string) => [f, { publishedError: null, published: paths[f] ?? [], expected: paths[f] ?? [] }]),
  ),
})

describe('decide', () => {
  it('passes when both sides name the same URLs for all three families', () => {
    const verdict = decide({
      url: REAL,
      serviceKey: KEY,
      probe: agreeing({ events: ['/events/a'], organisers: ['/organisers/b'], venues: ['/venues/c'] }),
    })
    expect(verdict.verdict).toBe('PASS')
    expect(verdict.counts?.events.published).toBe(1)
  })

  it('SKIPs on a placeholder project URL, because CI typecheck has no database to ask', () => {
    const verdict = decide({ url: 'https://example.supabase.co', serviceKey: KEY, probe: null })
    expect(verdict.verdict).toBe('SKIP')
    expect(verdict.reasons[0]).toContain('placeholder')
  })

  it('SKIPs with no service key, naming the key rather than passing by silence', () => {
    const verdict = decide({ url: REAL, serviceKey: '', probe: null })
    expect(verdict.verdict).toBe('SKIP')
    expect(verdict.reasons[0]).toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('FAILS rather than SKIPs when it had a database and could not read it', () => {
    const verdict = decide({ url: REAL, serviceKey: KEY, probe: { looked: false, reason: 'the probe exited 1' } })
    expect(verdict.verdict).toBe('FAIL')
    expect(verdict.reasons[0]).toContain('the probe exited 1')
  })

  it('FAILS on a published event the sitemap never advertises, which is the quiet failure', () => {
    const probe = agreeing({})
    probe.families.events = { publishedError: null, published: [], expected: ['/events/lane-c-night'] }
    const verdict = decide({ url: REAL, serviceKey: KEY, probe })
    expect(verdict.verdict).toBe('FAIL')
    expect(verdict.reasons.join(' ')).toContain('ABSENT from the sitemap')
    expect(verdict.reasons.join(' ')).toContain('/events/lane-c-night')
  })

  it('FAILS on a sitemap URL with no row behind it, which is the 404 Googlebot is sent to', () => {
    const probe = agreeing({})
    probe.families.organisers = { publishedError: null, published: ['/organisers/pending-one'], expected: [] }
    const verdict = decide({ url: REAL, serviceKey: KEY, probe })
    expect(verdict.verdict).toBe('FAIL')
    expect(verdict.reasons.join(' ')).toContain('would answer 404')
    expect(verdict.reasons.join(' ')).toContain('/organisers/pending-one')
  })

  it('FAILS on a reader that errored, and says the family would have published NOTHING', () => {
    // The 42703 exactly: `venues.slug` does not exist, a bare catch threw the
    // error away, and the block published nothing for its whole life.
    const probe = agreeing({})
    probe.families.venues = { publishedError: 'column events.venue_slug does not exist', published: [], expected: ['/venues/the-corner'] }
    const verdict = decide({ url: REAL, serviceKey: KEY, probe })
    expect(verdict.verdict).toBe('FAIL')
    expect(verdict.reasons.join(' ')).toContain('publish NO venues URL at all')
    // and it must NOT also report every expected URL as missing, which would
    // bury the one line that says what actually happened.
    expect(verdict.reasons.join(' ')).not.toContain('ABSENT from the sitemap')
  })

  it('FAILS on a truncated read rather than reporting the truncation as a finding', () => {
    const probe = { ...agreeing({}), truncated: true }
    const verdict = decide({ url: REAL, serviceKey: KEY, probe })
    expect(verdict.verdict).toBe('FAIL')
    expect(verdict.reasons[0]).toContain('row cap')
  })
})

describe('summarise', () => {
  it('names every path while the list is short enough to read', () => {
    expect(summarise(['/a', '/b'])).toBe('/a, /b')
  })

  it('bounds a long list, because a guard that prints 400 URLs is a guard nobody reads', () => {
    const many = Array.from({ length: NAMED_LIMIT + 5 }, (_, i) => `/events/e${i}`)
    const line = summarise(many)
    expect(line).toContain('and 5 more')
    expect(line.split(', ')).toHaveLength(NAMED_LIMIT)
  })
})

describe('comparePaths', () => {
  it('separates the two directions, because they are two different defects', () => {
    expect(comparePaths(['/a', '/b'], ['/b', '/c'])).toEqual({ missing: ['/a'], orphaned: ['/c'] })
  })

  it('is order-independent and duplicate-tolerant on both sides', () => {
    expect(comparePaths(['/b', '/a', '/a'], ['/a', '/b'])).toEqual({ missing: [], orphaned: [] })
  })
})
