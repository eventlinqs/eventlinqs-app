import { describe, expect, test } from 'vitest'
import {
  GENRES,
  SUBGENRES,
  GENRE_SLUG_SET,
  SUBGENRE_SLUG_SET,
  getGenre,
  getSubgenre,
  getParentGenre,
  getSubgenresForGenre,
  isGenreSlug,
  isSubgenreSlug,
  isMusicSlug,
} from '@/lib/genres/data'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
// No em-dashes (—), no en-dashes (–), no exclamation marks.
const FORBIDDEN_CHARS = /[—–!]/

describe('genre taxonomy', () => {
  test('matches the spec counts: 13 parent genres, 52 sub-genres', () => {
    expect(GENRES).toHaveLength(13)
    expect(SUBGENRES).toHaveLength(52)
  })

  test('genre slugs are unique', () => {
    expect(GENRE_SLUG_SET.size).toBe(GENRES.length)
  })

  test('sub-genre slugs are unique', () => {
    expect(SUBGENRE_SLUG_SET.size).toBe(SUBGENRES.length)
  })

  test('parent and sub-genre slugs never collide (one /music/{slug} namespace)', () => {
    const overlap = GENRES.map((g) => g.slug).filter((s) => SUBGENRE_SLUG_SET.has(s))
    expect(overlap).toEqual([])
  })

  test('every sub-genre points at a real parent genre', () => {
    for (const sub of SUBGENRES) {
      expect(GENRE_SLUG_SET.has(sub.genre)).toBe(true)
    }
  })

  test('every parent genre has at least one sub-genre', () => {
    for (const genre of GENRES) {
      expect(getSubgenresForGenre(genre.slug).length).toBeGreaterThan(0)
    }
  })

  test('all slugs are lowercase and hyphenated', () => {
    for (const g of GENRES) expect(g.slug).toMatch(SLUG_RE)
    for (const s of SUBGENRES) expect(s.slug).toMatch(SLUG_RE)
  })

  test('display names carry no em-dashes, en-dashes or exclamation marks', () => {
    for (const g of GENRES) expect(g.name).not.toMatch(FORBIDDEN_CHARS)
    for (const s of SUBGENRES) expect(s.name).not.toMatch(FORBIDDEN_CHARS)
  })

  test('the spec genres that beat US-centric lists are present', () => {
    for (const slug of ['afrobeats', 'amapiano', 'afro-house']) {
      expect(SUBGENRE_SLUG_SET.has(slug)).toBe(true)
    }
  })

  test('lookups resolve and type guards agree', () => {
    expect(getGenre('electronic-and-dance')?.name).toBe('Electronic and dance')
    expect(getGenre('not-real')).toBeNull()
    expect(getSubgenre('techno')?.name).toBe('Techno')
    expect(getSubgenre('not-real')).toBeNull()

    expect(isGenreSlug('electronic-and-dance')).toBe(true)
    expect(isGenreSlug('techno')).toBe(false)
    expect(isSubgenreSlug('techno')).toBe(true)
    expect(isSubgenreSlug('electronic-and-dance')).toBe(false)
    expect(isMusicSlug('techno')).toBe(true)
    expect(isMusicSlug('electronic-and-dance')).toBe(true)
    expect(isMusicSlug('not-real')).toBe(false)
  })

  test('getParentGenre walks a sub-genre back to its parent', () => {
    expect(getParentGenre('techno')?.slug).toBe('electronic-and-dance')
    expect(getParentGenre('amapiano')?.slug).toBe('african')
    expect(getParentGenre('electronic-and-dance')).toBeNull()
  })
})
