/**
 * A suburb's photograph, for its tile on /city/[slug] and its hero on /city/[slug]/[suburb].
 *
 * STORED PHOTOGRAPHS ONLY, NEVER A REQUEST-TIME CALL (Lawal, 22:23 on 29 October 2026; the project manager's 03:09 on
 * 30 October). Each of the 24 suburbs is kept once as public/images/library/suburb-<slug>.jpg, the photograph its tile
 * showed before, with its photographer, page and licence in attribution.json (fetched by
 * scripts/ops/download-library-photos.mjs). Four were replaced after a look by eye on 30 October: Canberra Civic
 * showed New York, Broadbeach repeated Surfers Paradise's photograph, Inner Perth looked like Melbourne, and Western
 * Sydney's three Parramatta tries were poorer than the Sydney street market it already showed, which it keeps.
 *
 * This used to ask Pexels on every render and return null from inside the cached fetch, so one refusal was kept for
 * a week: the fault that blanked Lawal's tiles on 29 October. A suburb no table names answers null, and the caller
 * draws its own placeholder.
 */

/** The suburbs kept in public/images/library, as suburb-<slug>.jpg. */
const KEPT_SUBURBS = new Set([
  'sydney-inner-west', 'sydney-north-shore', 'sydney-eastern-suburbs', 'sydney-western-sydney',
  'sydney-northern-beaches', 'sydney-sutherland-shire',
  'melbourne-inner-melbourne', 'melbourne-eastern-suburbs', 'melbourne-western-suburbs',
  'melbourne-northern-suburbs', 'melbourne-southern-suburbs', 'melbourne-bayside',
  'brisbane-inner-city', 'brisbane-north-side', 'brisbane-south-side', 'brisbane-west-end',
  'perth-inner-perth', 'perth-northern-suburbs', 'perth-southern-suburbs', 'perth-coastal',
  'gold-coast-surfers-paradise', 'gold-coast-broadbeach', 'canberra-civic', 'hobart-inner-city',
])

export async function getSuburbHeroPhoto(slug: string): Promise<string | null> {
  return KEPT_SUBURBS.has(slug) ? `/images/library/suburb-${slug}.jpg` : null
}
