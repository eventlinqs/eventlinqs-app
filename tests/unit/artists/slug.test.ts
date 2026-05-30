import { describe, expect, test } from 'vitest'
import { artistSlug } from '@/lib/artists/slug'

describe('artistSlug', () => {
  test('lower-cases a simple name', () => {
    expect(artistSlug('Drake')).toBe('drake')
  })

  test('replaces spaces with single hyphens', () => {
    expect(artistSlug('Hilltop Hoods')).toBe('hilltop-hoods')
  })

  test('collapses runs of whitespace and punctuation into one hyphen', () => {
    expect(artistSlug('A.B.  Original')).toBe('a-b-original')
  })

  test('trims leading and trailing separators', () => {
    expect(artistSlug('  Spacey Name ')).toBe('spacey-name')
  })

  test('drops punctuation including exclamation marks', () => {
    expect(artistSlug('Tkay Maidza!')).toBe('tkay-maidza')
  })

  test('strips diacritics so accented names slug cleanly', () => {
    expect(artistSlug('Beyoncé')).toBe('beyonce')
  })

  test('keeps digits', () => {
    expect(artistSlug('ONEFOUR 2')).toBe('onefour-2')
  })

  test('returns empty string for punctuation-only input', () => {
    expect(artistSlug('!!!')).toBe('')
  })
})
