import attribution from '../../../public/images/hero/homepage-hero-attribution.json'

/**
 * THE CURATED HOMEPAGE HERO: what the homepage paints when no event qualifies.
 *
 * Close-out C17 (7 September 2026). Production's homepage rendered a flat navy
 * panel with no imagery because every event it held had ended and the hero's
 * empty branch was a banner rather than a photograph. The rule from that day:
 * the hero NEVER renders without imagery. A featured event brings its own; with
 * none, the homepage wears one of the founder's licensed homepage rasters, chosen
 * deterministically so a render never flickers between rerenders on the same
 * day and the set still turns over day to day.
 *
 * ONE SOURCE. The set is read from public/images/hero/homepage-hero-attribution.json,
 * the licence record that sits beside the assets (C17.3): a raster cannot enter
 * the curated set without its attribution entry, and
 * scripts/guards/homepage-hero-never-empty.mjs fails the build if an entry has
 * no .jpg and .avif under public/images/hero or the note stops naming the
 * licence holder. Nothing here is generated (Law 6); these are photographs the
 * platform holds a licence for.
 *
 * The image path is the same local raster path HeroMedia already serves for
 * coverless events (a bundled file, delivered through next/image with priority):
 * see HERO_RASTER_DEFAULT in src/lib/images/event-media.ts.
 */

export interface CuratedHomepageHero {
  slug: string
  /** Local raster path under /public, served through next/image by HeroMedia. */
  image: string
  alt: string
}

export const HOMEPAGE_HERO_DIR = '/images/hero'

/** The curated set, in the attribution file's order. */
export const CURATED_HOMEPAGE_HEROES: readonly CuratedHomepageHero[] = attribution.heroes.map((h) => ({
  slug: h.slug,
  image: `${HOMEPAGE_HERO_DIR}/${h.slug}.jpg`,
  alt: h.alt,
}))

/** Who holds the licence for the set, as the attribution file records it. */
export const HOMEPAGE_HERO_LICENCE_NOTE: string = attribution.note

/** Day of the year, UTC, 0-based: the same for every render on one day. */
export function utcDayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1)
  return Math.floor((date.getTime() - start) / 86_400_000)
}

/**
 * The curated hero for a given day. Deterministic: the same date always yields
 * the same photograph, so server renders, ISR revalidations and the client's
 * hydration agree; the set turns over daily so returning visitors see the range.
 */
export function pickCuratedHomepageHero(date: Date = new Date()): CuratedHomepageHero {
  if (CURATED_HOMEPAGE_HEROES.length === 0) {
    throw new Error('[homepage-hero-curated] the curated set is empty: public/images/hero/homepage-hero-attribution.json lists no heroes')
  }
  const index = utcDayOfYear(date) % CURATED_HOMEPAGE_HEROES.length
  return CURATED_HOMEPAGE_HEROES[index]
}
