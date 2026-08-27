/**
 * THE NINE CATEGORIES THE HOMEPAGE LEADS WITH, AND NOTHING ELSE ABOUT THEM.
 *
 * FOUNDER RULING, 26 August 2026:
 *
 *   "/events reads the database; the homepage reads a hardcoded array in
 *   category-nav-rail.tsx. That guarantees drift forever. One source of truth.
 *   If the homepage should show a curated subset rather than all 22, that
 *   subset must be derived from the database, not typed out."
 *
 * So this file holds the ONE thing that is genuinely an editorial decision and
 * cannot come from the database: WHICH nine, and in WHAT ORDER. Everything else
 * about a category, above all its display name, is read from
 * `event_categories` at render time.
 *
 * WHAT THE OLD SHAPE COST. The array used to carry `{ slug, name }` pairs, and
 * five of the nine names had drifted away from the database without anybody
 * noticing, because nothing anywhere compared them:
 *
 *   homepage said          event_categories said
 *   Arts and theatre       Arts & Community
 *   Food and drink         Food & Drink
 *   Sport                  Sports
 *   Business               Business & Networking
 *   Festivals              Festival
 *
 * A category renamed in the database changed on /events and stayed frozen on
 * the homepage, for ever, silently. That is the class this file closes.
 *
 * `scripts/guards/curated-categories-exist.mjs` reads this list and fails the
 * build if any slug is absent from `event_categories`, so the reverse failure
 * (a curated slug that no longer exists) cannot ship either.
 */

export const CURATED_HOMEPAGE_CATEGORY_SLUGS: readonly string[] = [
  'music',
  'comedy',
  'food-drink',
  'festival',
  'arts-community',
  'nightlife',
  'sports',
  'family',
  'business-networking',
]
