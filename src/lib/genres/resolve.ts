import {
  getParentGenre,
  isGenreSlug,
  isSubgenreSlug,
  type GenreSlug,
  type SubgenreSlug,
} from './data'

export type ResolvedGenreSelection = {
  genre_slug: GenreSlug | null
  subgenre_slug: SubgenreSlug | null
}

function clean(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Normalises a genre/sub-genre pair into a non-contradictory selection.
 *
 * Rules (the single authority used by both the picker and the server actions):
 * - A valid sub-genre always forces its parent genre, overriding whatever genre
 *   the caller supplied. The two can never be stored in contradiction.
 * - An unknown sub-genre is dropped.
 * - A lone genre is kept only when it is a real parent genre; otherwise null.
 * - The result never contains a sub-genre without its correct parent genre.
 */
export function resolveGenreSelection(
  genre: string | null | undefined,
  subgenre: string | null | undefined,
): ResolvedGenreSelection {
  const sub = clean(subgenre)
  if (sub && isSubgenreSlug(sub)) {
    const parent = getParentGenre(sub)
    // getParentGenre always resolves for a known sub-genre slug.
    return {
      genre_slug: (parent?.slug ?? null) as GenreSlug | null,
      subgenre_slug: sub as SubgenreSlug,
    }
  }

  const gen = clean(genre)
  if (gen && isGenreSlug(gen)) {
    return { genre_slug: gen as GenreSlug, subgenre_slug: null }
  }

  return { genre_slug: null, subgenre_slug: null }
}
