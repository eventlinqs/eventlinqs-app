import { describe, expect, it } from 'vitest'
import {
  IN_FILTER_MAX_VALUES,
  IN_FILTER_VALUE_BUDGET_BYTES,
  chunkInFilterValues,
} from '@/lib/supabase/in-chunks'

/**
 * AN `.in()` LIST IS BOUNDED BY BYTES, AND THE SEND PATH BOUNDED IT BY COUNT.
 *
 * The property under test is not "the chunks are the right size". It is that NO
 * CHUNK CAN PRODUCE A URL THE SERVER REFUSES, whatever the values are, because
 * that refusal is what made the campaigner record a hundred consented people as
 * having no consent record.
 *
 * Measured on this project's TEST instance on 19 September 2026: a joined value
 * list of 15,038 bytes succeeded and 16,083 failed, which is the 16 KB Supabase
 * documents for headers and URL together
 * (https://supabase.com/docs/guides/troubleshooting/fixing-520-errors-in-the-database-rest-api-Ur5-B2).
 * So the assertion below is against the MEASURED failure point and not against
 * the budget, which would only ever be a test of a constant against itself.
 */
const MEASURED_FAILURE_BYTES = 16_083

/** What actually travels: the values, comma separated, as PostgREST spells them. */
function joinedBytes(chunk: string[]): number {
  return new TextEncoder().encode(chunk.join(',')).length
}

/** An address of exactly `n` characters, which RFC 5321 permits up to 254. */
function addressOfLength(n: number, seed: number): string {
  const tail = `${seed}@example.com`
  return `${'a'.repeat(Math.max(1, n - tail.length))}${tail}`
}

describe('chunkInFilterValues', () => {
  it('keeps a hundred ordinary addresses in ONE request, so the common path is unchanged', () => {
    const emails = Array.from({ length: 100 }, (_, i) => addressOfLength(30, i))
    const chunks = chunkInFilterValues(emails)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(100)
  })

  it('splits a hundred maximum-length addresses, which the old count bound did not', () => {
    const emails = Array.from({ length: 100 }, (_, i) => addressOfLength(254, i))
    const chunks = chunkInFilterValues(emails)
    expect(chunks.length).toBeGreaterThan(1)

    // The bound that was there before: a hundred at a time, in one request.
    expect(joinedBytes(emails)).toBeGreaterThan(MEASURED_FAILURE_BYTES)
  })

  /*
   * THE INVARIANT, ASSERTED ACROSS HOSTILE SHAPES RATHER THAN ONE HAPPY LIST.
   * A chunker that is right for uniform values and wrong for a mixture is wrong,
   * and a real audience is a mixture.
   */
  it.each([
    ['uniform short', Array.from({ length: 500 }, (_, i) => addressOfLength(22, i))],
    ['uniform long', Array.from({ length: 500 }, (_, i) => addressOfLength(254, i))],
    ['mixed', Array.from({ length: 500 }, (_, i) => addressOfLength(i % 2 === 0 ? 18 : 254, i))],
    ['one enormous value first', [addressOfLength(254, 0), ...Array.from({ length: 99 }, (_, i) => addressOfLength(20, i))]],
    ['uuids, the other thing this is used for', Array.from({ length: 700 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)],
  ])('never produces a chunk the server would refuse: %s', (_label, values) => {
    for (const chunk of chunkInFilterValues(values)) {
      expect(chunk.length).toBeGreaterThan(0)
      expect(chunk.length).toBeLessThanOrEqual(IN_FILTER_MAX_VALUES)
      expect(joinedBytes(chunk)).toBeLessThanOrEqual(IN_FILTER_VALUE_BUDGET_BYTES)
      expect(joinedBytes(chunk)).toBeLessThan(MEASURED_FAILURE_BYTES)
    }
  })

  it('loses nothing and reorders nothing, because a dropped chunk is a person not asked about', () => {
    const values = Array.from({ length: 437 }, (_, i) => addressOfLength((i % 7) * 30 + 15, i))
    expect(chunkInFilterValues(values).flat()).toEqual(values)
  })

  it('answers an empty list with no requests at all', () => {
    expect(chunkInFilterValues([])).toEqual([])
  })

  /*
   * A SINGLE VALUE LARGER THAN THE WHOLE BUDGET STILL GOES, ALONE. Refusing to
   * ask is worse than asking and being told no: a refusal here would silently
   * drop one person for ever, and the budget is a quarter of the real limit, so
   * a lone oversized value is very likely to succeed anyway.
   */
  it('sends an oversized single value on its own rather than dropping it', () => {
    const monster = 'x'.repeat(IN_FILTER_VALUE_BUDGET_BYTES + 500)
    const chunks = chunkInFilterValues([monster, 'a@b.co'])
    expect(chunks[0]).toEqual([monster])
    expect(chunks.flat()).toEqual([monster, 'a@b.co'])
  })

  /*
   * BYTES, NOT CHARACTERS. `String.length` counts UTF-16 units, so it
   * under-counts exactly the addresses most likely to be long: RFC 6531 permits
   * a non-ASCII domain, and a URL carries percent-encoded UTF-8.
   */
  it('counts a non-ASCII address by its UTF-8 bytes and not by its length', () => {
    // 'é' is one UTF-16 unit and two UTF-8 bytes, so this is under the budget
    // by `.length` and over it by what actually travels.
    const value = `${'é'.repeat(2_100)}@example.com`
    expect(value.length).toBeLessThan(IN_FILTER_VALUE_BUDGET_BYTES)
    expect(new TextEncoder().encode(value).length).toBeGreaterThan(IN_FILTER_VALUE_BUDGET_BYTES)
    // Judged by bytes, it is oversized, so it travels alone rather than being
    // packed alongside ninety-nine others into a request that would be refused.
    expect(chunkInFilterValues([value, 'a@b.co'])[0]).toEqual([value])
  })

  it('refuses a budget that cannot hold anything, rather than looping for ever', () => {
    expect(() => chunkInFilterValues(['a'], { budgetBytes: 0 })).toThrow(/cannot hold anything/)
    expect(() => chunkInFilterValues(['a'], { maxValues: 0 })).toThrow(/cannot hold anything/)
  })
})
