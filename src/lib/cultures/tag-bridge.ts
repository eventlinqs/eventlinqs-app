/**
 * Culture -> event-tag bridge.
 *
 * Why this exists: the public culture surface (the /events?culture= filter,
 * the /culture/[slug] and /culture/[slug]/[city] landings, and the
 * /cultures index counts) historically resolved a culture to a set of
 * legacy event_categories.slug values via category-bridge.ts. That bridge
 * maps cultures to slugs like 'afrobeats' / 'bollywood' / 'gospel', but
 * the live events carry generic categories ('music', 'nightlife',
 * 'community', 'religion', 'arts-culture', 'food-drink', 'festival').
 * None of the bridged slugs exist in event_categories, so every culture
 * query resolved to zero rows: every culture page, every culture filter,
 * and the entire /cultures index read as empty ("Coming soon"), which
 * silently broke the platform's central culture-first promise.
 *
 * The events table does carry an accurate, culture-identifying signal:
 * the `tags` jsonb array (e.g. ["afrobeats","brunch","sunday"],
 * ["caribbean","soca","carnival"], ["gospel","worship","christian"]).
 * This bridge maps each culture slug to the set of tag tokens that
 * identify it, and exposes a PostgREST OR-filter so the data layer can
 * narrow events by tag containment with no schema change and no data
 * backfill. Only culture-distinctive tokens are listed here; generic
 * tokens that appear across many cultures (family, free, festival,
 * music, food, premium, community, cultural, dance, nightlife) are
 * deliberately excluded so the filter never over-matches into noise.
 *
 * The legacy category-bridge.ts is intentionally left in place: an
 * organiser-imported event that carries no recognised tag but does have
 * a culture-named category still flows through that path where it is
 * still consulted. Tag containment is the primary, reliable signal.
 */

import type { CultureSlug } from './data'

/**
 * Culture slug -> identifying tag tokens. Tokens are matched against the
 * event `tags` jsonb array with containment (case-sensitive, lower-case
 * tokens to match the seed/organiser convention).
 */
export const CULTURE_TO_TAGS: Record<CultureSlug, string[]> = {
  african: [
    'afrobeats', 'amapiano', 'owambe', 'west-african', 'east-african',
    'african', 'afropop', 'africultures', 'yoruba', 'nigerian',
    'highlife', 'bongo-flava',
  ],
  'south-asian': [
    'bollywood', 'bhangra', 'dhol', 'south-asian', 'diwali', 'sangeet',
    'mehndi', 'mela', 'garba', 'desi',
  ],
  caribbean: [
    'caribbean', 'soca', 'dancehall', 'reggae', 'steel-pan', 'calypso',
    'mas', 'trinidad', 'jamaican',
  ],
  latin: [
    'latin', 'salsa', 'reggaeton', 'bachata', 'cuban', 'merengue',
    'cumbia', 'latino',
  ],
  'east-asian': [
    'lunar-new-year', 'lunar', 'k-pop', 'kpop', 'chinese', 'vietnamese',
    'korean', 'japanese', 'anime', 'j-rock',
  ],
  filipino: ['filipino', 'opm', 'sariwa', 'pinoy', 'tagalog', 'pilipino'],
  mediterranean: [
    'mediterranean', 'italian', 'greek', 'spanish', 'portuguese',
  ],
  'middle-eastern': [
    'middle-eastern', 'lebanese', 'persian', 'arabic', 'turkish',
    'dabke', 'eid',
  ],
  european: [
    'european', 'polish', 'french', 'ukrainian', 'german', 'irish',
  ],
  pacific: [
    'pacific', 'pasifika', 'samoan', 'tongan', 'fijian', 'maori',
    'islander',
  ],
  gospel: ['gospel', 'worship', 'christian', 'praise'],
  comedy: ['comedy', 'stand-up', 'standup', 'improv', 'sketch'],
  wellness: ['wellness', 'yoga', 'meditation', 'spirituality', 'mindfulness'],
  pride: ['pride', 'lgbtq', 'lgbtqia', 'queer', 'mardi-gras'],
}

export function getCultureTags(culture: CultureSlug): string[] {
  return CULTURE_TO_TAGS[culture] ?? []
}

/**
 * Build the PostgREST `.or(...)` filter string that matches an event
 * whose `tags` jsonb array contains ANY of the culture's tag tokens.
 *
 * When `subCulture` is supplied and is itself a recognised token for the
 * culture, the filter narrows to that single token (so deep links such
 * as /events?culture=african&sub_culture=amapiano resolve precisely).
 * An unrecognised sub_culture is ignored and the full culture set
 * applies (better to show the culture broadly than nothing).
 *
 * Returns null when the culture has no tokens (cannot happen for a valid
 * CultureSlug, but the caller treats null as "no culture constraint").
 *
 * Each term is `tags.cs.["token"]` (jsonb contains). Tokens never
 * contain a comma, so the comma-joined list parses as discrete OR terms.
 */
export function buildCultureTagOrFilter(
  culture: CultureSlug,
  subCulture?: string | null,
): string | null {
  const tokens = getCultureTags(culture)
  if (tokens.length === 0) return null

  const narrowed =
    subCulture && tokens.includes(subCulture) ? [subCulture] : tokens

  return narrowed.map(t => `tags.cs.["${t}"]`).join(',')
}
