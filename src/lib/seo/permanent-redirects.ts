/**
 * EVERY PERMANENT REDIRECT, IN ONE PLACE, SO THE SITEMAP CAN SEE THEM.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS
 * ============================================================================
 *
 * The redirect table lived inside `next.config.ts` and nothing else could read
 * it. `src/app/sitemap.ts` therefore published `/categories/<slug>` for every
 * hero category, unaware that six of those seven slugs are permanently
 * redirected away to `/community/*` by the very same repository.
 *
 * Measured against production on 25 August 2026, one request per slug, redirects
 * not followed:
 *
 *     308  /categories/afrobeats                 -> /community/african
 *     308  /categories/amapiano                  -> /community/african
 *     308  /categories/gospel                    -> /community/gospel
 *     308  /categories/owambe                    -> /community/african
 *     308  /categories/caribbean                 -> /community/caribbean
 *     308  /categories/heritage-and-independence -> /community/african
 *     200  /categories/networking
 *
 * Google publishes the rule this breaks, on the page that defines what belongs
 * in a sitemap:
 *
 *   "Don't include URLs that redirect or that aren't canonical."
 *   https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 *   (fetched 25 August 2026)
 *
 * So the table moves here, `next.config.ts` imports it and keeps behaving
 * exactly as before, and the sitemap and its guard import it too. Two copies of
 * one fact cannot disagree when there is only one copy.
 *
 * IT IS DATA, NOT A NEXT TYPE. Importing `next`'s `Redirect` type into a module
 * that `next.config.ts` loads at config time is a needless coupling; the shape
 * below is the documented `redirects()` entry shape and next.config spreads it
 * verbatim.
 */

export interface PermanentRedirect {
  source: string
  destination: string
  permanent: true
}

/**
 * The legacy `/categories/[slug]` taxonomy, forwarded to the community pages.
 *
 * Batch 5 moved the community taxonomy to `/community/[slug]`. The
 * `/categories/[slug]` route still serves the hero-category editorial, so these
 * six slugs are forwarded rather than deleted; `/categories/networking` has no
 * community equivalent and stays.
 */
export const LEGACY_CATEGORY_REDIRECTS: PermanentRedirect[] = [
  { source: '/categories/afrobeats', destination: '/community/african', permanent: true },
  { source: '/categories/amapiano', destination: '/community/african', permanent: true },
  { source: '/categories/owambe', destination: '/community/african', permanent: true },
  { source: '/categories/heritage-and-independence', destination: '/community/african', permanent: true },
  { source: '/categories/caribbean', destination: '/community/caribbean', permanent: true },
  { source: '/categories/gospel', destination: '/community/gospel', permanent: true },
]

/**
 * The banned word leaving the URL space (CLAUDE.md: "culture" is banned in every
 * form, route names included). Permanent so no existing link, share or search
 * index entry breaks.
 */
export const LEGACY_COMMUNITY_REDIRECTS: PermanentRedirect[] = [
  { source: '/cultures', destination: '/communities', permanent: true },
  { source: '/culture/:slug', destination: '/community/:slug', permanent: true },
  { source: '/culture/:slug/:city', destination: '/community/:slug/:city', permanent: true },
]

/** Every permanent redirect this application serves. */
export const PERMANENT_REDIRECTS: PermanentRedirect[] = [
  ...LEGACY_CATEGORY_REDIRECTS,
  ...LEGACY_COMMUNITY_REDIRECTS,
]

/**
 * Does a path match a redirect source?
 *
 * Next.js path-to-regexp segments (`:slug`) are matched as a single non-slash
 * segment, which is what Next itself does for a bare parameter. That is enough
 * to answer the only question asked of it: "would publishing this URL publish a
 * redirect?"
 */
export function redirectFor(pathname: string): PermanentRedirect | null {
  for (const rule of PERMANENT_REDIRECTS) {
    const pattern = new RegExp(
      `^${rule.source
        .split('/')
        .map(seg => (seg.startsWith(':') ? '[^/]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('/')}$`,
    )
    if (pattern.test(pathname)) return rule
  }
  return null
}

/** True when publishing this path would publish a redirect. */
export function isRedirected(pathname: string): boolean {
  return redirectFor(pathname) !== null
}
