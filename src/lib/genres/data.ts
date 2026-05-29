// Music genre taxonomy: the canonical source of truth for genre discovery.
//
// Two levels: parent genre, then sub-genres. Adapted for the Australian market
// and deliberately deeper than the US-centric lists (it includes Afrobeats,
// Amapiano and Afro house, which Eventbrite limits to US events). See
// docs/GENRE-DISCOVERY-FOUNDATION-SPEC.md section 3.
//
// This file mirrors src/lib/cultures/data.ts: the TS module is the canonical
// source, and the database tables (genres, subgenres) are seeded from the same
// list in supabase/migrations/20260529000001_genre_taxonomy.sql plus
// supabase/seed/genres.sql. Keep all three in sync.
//
// Slug rule: parent genres and sub-genres share one URL namespace at
// /music/{slug}, so every slug here is unique across BOTH levels. Where a parent
// category name matches one of its own sub-genres (Pop, Metal, Latin, Classical),
// the parent takes a compound slug (for example pop-and-top-40) while its display
// name stays the plain category name. The sub-genre keeps the plain slug.
//
// Copy rule: Australian English, sentence case, no em-dashes or en-dashes, no
// exclamation marks.

export type GenreSlug =
  | 'electronic-and-dance'
  | 'hip-hop-and-rap'
  | 'african'
  | 'rnb-and-soul'
  | 'pop-and-top-40'
  | 'rock-and-alternative'
  | 'metal-and-metalcore'
  | 'jazz-and-blues'
  | 'reggae-and-caribbean'
  | 'latin-and-reggaeton'
  | 'country-and-folk'
  | 'classical-and-orchestral'
  | 'world-and-other'

export type SubgenreSlug =
  // Electronic and dance
  | 'house'
  | 'techno'
  | 'drum-and-bass'
  | 'dubstep'
  | 'trance'
  | 'garage'
  | 'hardstyle'
  | 'disco'
  | 'edm'
  // Hip hop and rap
  | 'hip-hop'
  | 'trap'
  | 'drill'
  | 'boom-bap'
  | 'grime'
  // African
  | 'afrobeats'
  | 'amapiano'
  | 'afro-house'
  // R and B and soul
  | 'rnb'
  | 'soul'
  | 'funk'
  | 'neo-soul'
  // Pop
  | 'pop'
  | 'top-40'
  | 'synth-pop'
  // Rock and alternative
  | 'rock'
  | 'indie'
  | 'alternative'
  | 'punk'
  | 'hardcore'
  // Metal
  | 'metal'
  | 'heavy-metal'
  | 'metalcore'
  // Jazz and blues
  | 'jazz'
  | 'blues'
  | 'swing'
  // Reggae and Caribbean
  | 'reggae'
  | 'dancehall'
  | 'ska'
  // Latin
  | 'latin'
  | 'reggaeton'
  | 'salsa'
  // Country and folk
  | 'country'
  | 'folk'
  | 'americana'
  | 'bluegrass'
  // Classical
  | 'classical'
  | 'opera'
  | 'orchestral'
  // World and other
  | 'world'
  | 'acoustic'
  | 'singer-songwriter'
  | 'experimental'

export interface Genre {
  slug: GenreSlug
  /** Australian English, sentence case display name (the spec category header). */
  name: string
  /** 1-based ordering for stable display. */
  order: number
}

export interface Subgenre {
  slug: SubgenreSlug
  /** Australian English, sentence case display name. */
  name: string
  /** The parent genre this sub-genre belongs to. */
  genre: GenreSlug
  /** 1-based ordering within the parent genre. */
  order: number
}

export const GENRES: Genre[] = [
  { slug: 'electronic-and-dance', name: 'Electronic and dance', order: 1 },
  { slug: 'hip-hop-and-rap', name: 'Hip hop and rap', order: 2 },
  { slug: 'african', name: 'African', order: 3 },
  { slug: 'rnb-and-soul', name: 'R and B and soul', order: 4 },
  { slug: 'pop-and-top-40', name: 'Pop', order: 5 },
  { slug: 'rock-and-alternative', name: 'Rock and alternative', order: 6 },
  { slug: 'metal-and-metalcore', name: 'Metal', order: 7 },
  { slug: 'jazz-and-blues', name: 'Jazz and blues', order: 8 },
  { slug: 'reggae-and-caribbean', name: 'Reggae and Caribbean', order: 9 },
  { slug: 'latin-and-reggaeton', name: 'Latin', order: 10 },
  { slug: 'country-and-folk', name: 'Country and folk', order: 11 },
  { slug: 'classical-and-orchestral', name: 'Classical', order: 12 },
  { slug: 'world-and-other', name: 'World and other', order: 13 },
]

export const SUBGENRES: Subgenre[] = [
  // Electronic and dance
  { slug: 'house', name: 'House', genre: 'electronic-and-dance', order: 1 },
  { slug: 'techno', name: 'Techno', genre: 'electronic-and-dance', order: 2 },
  { slug: 'drum-and-bass', name: 'Drum and bass', genre: 'electronic-and-dance', order: 3 },
  { slug: 'dubstep', name: 'Dubstep', genre: 'electronic-and-dance', order: 4 },
  { slug: 'trance', name: 'Trance', genre: 'electronic-and-dance', order: 5 },
  { slug: 'garage', name: 'Garage', genre: 'electronic-and-dance', order: 6 },
  { slug: 'hardstyle', name: 'Hardstyle', genre: 'electronic-and-dance', order: 7 },
  { slug: 'disco', name: 'Disco', genre: 'electronic-and-dance', order: 8 },
  { slug: 'edm', name: 'EDM', genre: 'electronic-and-dance', order: 9 },
  // Hip hop and rap
  { slug: 'hip-hop', name: 'Hip hop', genre: 'hip-hop-and-rap', order: 1 },
  { slug: 'trap', name: 'Trap', genre: 'hip-hop-and-rap', order: 2 },
  { slug: 'drill', name: 'Drill', genre: 'hip-hop-and-rap', order: 3 },
  { slug: 'boom-bap', name: 'Boom bap', genre: 'hip-hop-and-rap', order: 4 },
  { slug: 'grime', name: 'Grime', genre: 'hip-hop-and-rap', order: 5 },
  // African
  { slug: 'afrobeats', name: 'Afrobeats', genre: 'african', order: 1 },
  { slug: 'amapiano', name: 'Amapiano', genre: 'african', order: 2 },
  { slug: 'afro-house', name: 'Afro house', genre: 'african', order: 3 },
  // R and B and soul
  { slug: 'rnb', name: 'R and B', genre: 'rnb-and-soul', order: 1 },
  { slug: 'soul', name: 'Soul', genre: 'rnb-and-soul', order: 2 },
  { slug: 'funk', name: 'Funk', genre: 'rnb-and-soul', order: 3 },
  { slug: 'neo-soul', name: 'Neo soul', genre: 'rnb-and-soul', order: 4 },
  // Pop
  { slug: 'pop', name: 'Pop', genre: 'pop-and-top-40', order: 1 },
  { slug: 'top-40', name: 'Top 40', genre: 'pop-and-top-40', order: 2 },
  { slug: 'synth-pop', name: 'Synth pop', genre: 'pop-and-top-40', order: 3 },
  // Rock and alternative
  { slug: 'rock', name: 'Rock', genre: 'rock-and-alternative', order: 1 },
  { slug: 'indie', name: 'Indie', genre: 'rock-and-alternative', order: 2 },
  { slug: 'alternative', name: 'Alternative', genre: 'rock-and-alternative', order: 3 },
  { slug: 'punk', name: 'Punk', genre: 'rock-and-alternative', order: 4 },
  { slug: 'hardcore', name: 'Hardcore', genre: 'rock-and-alternative', order: 5 },
  // Metal
  { slug: 'metal', name: 'Metal', genre: 'metal-and-metalcore', order: 1 },
  { slug: 'heavy-metal', name: 'Heavy metal', genre: 'metal-and-metalcore', order: 2 },
  { slug: 'metalcore', name: 'Metalcore', genre: 'metal-and-metalcore', order: 3 },
  // Jazz and blues
  { slug: 'jazz', name: 'Jazz', genre: 'jazz-and-blues', order: 1 },
  { slug: 'blues', name: 'Blues', genre: 'jazz-and-blues', order: 2 },
  { slug: 'swing', name: 'Swing', genre: 'jazz-and-blues', order: 3 },
  // Reggae and Caribbean
  { slug: 'reggae', name: 'Reggae', genre: 'reggae-and-caribbean', order: 1 },
  { slug: 'dancehall', name: 'Dancehall', genre: 'reggae-and-caribbean', order: 2 },
  { slug: 'ska', name: 'Ska', genre: 'reggae-and-caribbean', order: 3 },
  // Latin
  { slug: 'latin', name: 'Latin', genre: 'latin-and-reggaeton', order: 1 },
  { slug: 'reggaeton', name: 'Reggaeton', genre: 'latin-and-reggaeton', order: 2 },
  { slug: 'salsa', name: 'Salsa', genre: 'latin-and-reggaeton', order: 3 },
  // Country and folk
  { slug: 'country', name: 'Country', genre: 'country-and-folk', order: 1 },
  { slug: 'folk', name: 'Folk', genre: 'country-and-folk', order: 2 },
  { slug: 'americana', name: 'Americana', genre: 'country-and-folk', order: 3 },
  { slug: 'bluegrass', name: 'Bluegrass', genre: 'country-and-folk', order: 4 },
  // Classical
  { slug: 'classical', name: 'Classical', genre: 'classical-and-orchestral', order: 1 },
  { slug: 'opera', name: 'Opera', genre: 'classical-and-orchestral', order: 2 },
  { slug: 'orchestral', name: 'Orchestral', genre: 'classical-and-orchestral', order: 3 },
  // World and other
  { slug: 'world', name: 'World', genre: 'world-and-other', order: 1 },
  { slug: 'acoustic', name: 'Acoustic', genre: 'world-and-other', order: 2 },
  { slug: 'singer-songwriter', name: 'Singer-songwriter', genre: 'world-and-other', order: 3 },
  { slug: 'experimental', name: 'Experimental', genre: 'world-and-other', order: 4 },
]

export const GENRE_SLUG_SET: ReadonlySet<string> = new Set(GENRES.map((g) => g.slug))
export const SUBGENRE_SLUG_SET: ReadonlySet<string> = new Set(SUBGENRES.map((s) => s.slug))

export function isGenreSlug(slug: string): slug is GenreSlug {
  return GENRE_SLUG_SET.has(slug)
}

export function isSubgenreSlug(slug: string): slug is SubgenreSlug {
  return SUBGENRE_SLUG_SET.has(slug)
}

/** Any slug that resolves to a /music/{slug} page, whether parent or sub. */
export function isMusicSlug(slug: string): boolean {
  return isGenreSlug(slug) || isSubgenreSlug(slug)
}

export function getGenre(slug: string): Genre | null {
  return GENRES.find((g) => g.slug === slug) ?? null
}

export function getSubgenre(slug: string): Subgenre | null {
  return SUBGENRES.find((s) => s.slug === slug) ?? null
}

export function getAllGenres(): Genre[] {
  return [...GENRES].sort((a, b) => a.order - b.order)
}

export function getAllSubgenres(): Subgenre[] {
  return [...SUBGENRES]
}

export function getSubgenresForGenre(genre: GenreSlug): Subgenre[] {
  return SUBGENRES.filter((s) => s.genre === genre).sort((a, b) => a.order - b.order)
}

/** The parent genre for a given sub-genre slug, or null if not a sub-genre. */
export function getParentGenre(subSlug: string): Genre | null {
  const sub = getSubgenre(subSlug)
  return sub ? getGenre(sub.genre) : null
}
