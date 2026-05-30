import { describe, expect, test } from 'vitest'
import { resolveGenreSelection } from '@/lib/genres/resolve'

describe('resolveGenreSelection', () => {
  test('a valid sub-genre sets its parent genre', () => {
    expect(resolveGenreSelection(null, 'techno')).toEqual({
      genre_slug: 'electronic-and-dance',
      subgenre_slug: 'techno',
    })
  })

  test('a sub-genre overrides a contradicting parent genre (parent always wins)', () => {
    // Caller claims "african" but picked the "techno" sub-genre: techno's real
    // parent is electronic-and-dance, so the genre is corrected, never stored
    // in contradiction.
    expect(resolveGenreSelection('african', 'techno')).toEqual({
      genre_slug: 'electronic-and-dance',
      subgenre_slug: 'techno',
    })
  })

  test('a sub-genre with its matching parent is preserved', () => {
    expect(resolveGenreSelection('electronic-and-dance', 'techno')).toEqual({
      genre_slug: 'electronic-and-dance',
      subgenre_slug: 'techno',
    })
  })

  test('an unknown sub-genre is dropped, a valid genre is kept', () => {
    expect(resolveGenreSelection('african', 'not-a-real-subgenre')).toEqual({
      genre_slug: 'african',
      subgenre_slug: null,
    })
  })

  test('an unknown sub-genre with no genre yields nothing', () => {
    expect(resolveGenreSelection(null, 'not-a-real-subgenre')).toEqual({
      genre_slug: null,
      subgenre_slug: null,
    })
  })

  test('a lone valid genre is kept with no sub-genre', () => {
    expect(resolveGenreSelection('african', null)).toEqual({
      genre_slug: 'african',
      subgenre_slug: null,
    })
  })

  test('an unknown genre is dropped', () => {
    expect(resolveGenreSelection('not-a-real-genre', null)).toEqual({
      genre_slug: null,
      subgenre_slug: null,
    })
  })

  test('a sub-genre slug supplied in the genre position is not a valid genre', () => {
    // "house" is a sub-genre, not a parent genre. As a lone genre it is invalid.
    expect(resolveGenreSelection('house', null)).toEqual({
      genre_slug: null,
      subgenre_slug: null,
    })
  })

  test('both empty yields nothing', () => {
    expect(resolveGenreSelection(null, null)).toEqual({
      genre_slug: null,
      subgenre_slug: null,
    })
  })

  test('empty strings are treated as absent', () => {
    expect(resolveGenreSelection('', '')).toEqual({
      genre_slug: null,
      subgenre_slug: null,
    })
  })

  test('undefined inputs are treated as absent', () => {
    expect(resolveGenreSelection(undefined, undefined)).toEqual({
      genre_slug: null,
      subgenre_slug: null,
    })
  })

  test('whitespace around slugs is trimmed before resolving', () => {
    expect(resolveGenreSelection('  african  ', null)).toEqual({
      genre_slug: 'african',
      subgenre_slug: null,
    })
  })
})
