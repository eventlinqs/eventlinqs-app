// Event tags may never differ only by case (close-out UX1.3).
//
// Production evidence, 9 September 2026: the first real outside organiser event
// served both "African" and "african" in its HTML, twelve occurrences each.
// `Array.from(new Set(...))` compared exactly, so the deduplication that looked
// like it was happening never was.

import { describe, expect, test } from 'vitest'
import {
  MAX_EVENT_TAGS,
  MAX_TAG_LENGTH,
  normaliseTags,
  tagsAreNormalised,
} from '@/lib/events/normalise-tags'

describe('the reported defect', () => {
  test('African and african collapse to one tag', () => {
    expect(normaliseTags(['African', 'african'])).toEqual(['African'])
  })

  test('the first spelling wins, so the organiser keeps their capitalisation', () => {
    expect(normaliseTags(['african', 'African'])).toEqual(['african'])
    expect(normaliseTags(['RnB', 'rnb', 'RNB'])).toEqual(['RnB'])
  })

  test('the old Set-based deduplication is demonstrably not enough', () => {
    const naive = Array.from(new Set(['African', 'african']))
    expect(naive).toHaveLength(2)
    expect(normaliseTags(naive)).toHaveLength(1)
  })
})

describe('what else a real organiser types', () => {
  test('a leading hash is stripped, because the pill reads back as #tag', () => {
    expect(normaliseTags(['#African', 'African'])).toEqual(['African'])
    expect(normaliseTags(['##soul'])).toEqual(['soul'])
  })

  test('whitespace is trimmed and empties are dropped', () => {
    expect(normaliseTags(['  African  ', '', '   ', 'Soul'])).toEqual(['African', 'Soul'])
  })

  test('order is otherwise preserved, because the organiser chose it', () => {
    expect(normaliseTags(['Soul', 'African', 'Live'])).toEqual(['Soul', 'African', 'Live'])
  })

  test('a tag is capped in length and the list is capped in count', () => {
    const long = 'a'.repeat(MAX_TAG_LENGTH + 25)
    expect(normaliseTags([long])[0]).toHaveLength(MAX_TAG_LENGTH)

    const many = Array.from({ length: MAX_EVENT_TAGS + 15 }, (_, i) => `tag${i}`)
    expect(normaliseTags(many)).toHaveLength(MAX_EVENT_TAGS)
  })

  test('nulls, undefined and non-strings never reach the database', () => {
    expect(normaliseTags(null)).toEqual([])
    expect(normaliseTags(undefined)).toEqual([])
    expect(normaliseTags([null, undefined, 'African'])).toEqual(['African'])
  })
})

describe('the invariant the database also enforces', () => {
  test('tagsAreNormalised agrees with normaliseTags on every case above', () => {
    for (const input of [
      ['African', 'african'],
      ['#RnB', 'rnb'],
      ['  Soul  ', 'soul', ''],
      [],
    ]) {
      expect(tagsAreNormalised(normaliseTags(input))).toBe(true)
    }
  })

  test('and rejects the shape that shipped', () => {
    expect(tagsAreNormalised(['African', 'african'])).toBe(false)
    expect(tagsAreNormalised(['African', ''])).toBe(false)
    expect(tagsAreNormalised([' African'])).toBe(false)
  })

  test('normalising twice changes nothing', () => {
    const once = normaliseTags(['#African', 'african', ' Soul '])
    expect(normaliseTags(once)).toEqual(once)
  })
})
