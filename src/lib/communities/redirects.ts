/**
 * Community Taxonomy v2 - retired-slug redirect map (Step 10, Decision F).
 *
 * Every v1 community slug that v2 retires must 301/308 to its replacement
 * so existing inbound links, shared links and SEO are preserved with
 * zero 404s.
 *
 * Note on roll-ups: founder Decision C makes roll-ups (Asian, European,
 * MENA, ...) discovery FILTERS, not standalone landing pages. Redirecting
 * a retired slug to a non-existent /community/<rollup> page would itself
 * 404, so retired regional slugs are redirected to their strongest
 * SPECIFIC v2 heritage instead (the no-404-safe, primary-stays-specific
 * choice). The removed non-heritage concepts (wellness -> event type,
 * pride -> identity, comedy -> event type) redirect to /events; gospel
 * moves to the Faith dimension.
 *
 * Values are absolute target paths. For the /community/[slug]/[city]
 * route, a /community/... target preserves the city segment.
 */
export const COMMUNITY_REDIRECTS: Record<string, string> = {
  'south-asian': '/community/indian',
  'east-asian': '/community/chinese',
  mediterranean: '/community/greek',
  'middle-eastern': '/community/lebanese-levantine',
  european: '/community/other-european',
  latin: '/community/latin-american',
  wellness: '/events',
  pride: '/events',
  comedy: '/events',
  gospel: '/faith/christian',
}

/**
 * Resolve a redirect target for a community slug, or null if the slug is
 * not retired. When `citySlug` is supplied and the target is a
 * /community/ heritage path, the city segment is preserved
 * (/community/south-asian/sydney -> /community/indian/sydney). Targets that
 * are not heritage paths (/events) drop the city segment.
 */
export function getCommunityRedirect(
  slug: string,
  citySlug?: string,
): string | null {
  const target = COMMUNITY_REDIRECTS[slug]
  if (!target) return null
  if (citySlug && target.startsWith('/community/')) {
    return `${target}/${citySlug}`
  }
  return target
}
