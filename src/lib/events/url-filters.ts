import { getCity, getSuburb, isCitySlug } from '@/lib/cities/data'
import { buildFaithTagOrFilter, isFaithSlug } from '@/lib/faiths/data'
import { COMMUNITY_MOMENTS } from '@/lib/community-moments/calendar'

/**
 * URL FILTER SEMANTICS: what every clickable /events link actually means.
 *
 * WHY THIS FILE EXISTS. Twelve query parameters appeared in real hrefs a user
 * could click and none of them was parsed. Every "View all" on a city page,
 * every event-type tile, every suburb "Open in browse view", the venue and
 * organiser rails, and three of the four header-search tabs all landed on the
 * unfiltered national list. Nothing 404s, nothing errors, the page renders
 * perfectly: the filter is simply dropped on the floor and the user is shown
 * the whole catalogue as though it were the answer to their question.
 *
 * The previous harness check hardcoded a list of six. It missed `free`,
 * `price`, `organiser`, `faith`, `moment` and the invalid `sort=trending`, and
 * it counted `sub`, which appears only in a comment. A hardcoded list is the
 * wrong shape for this check, so `reach-integrity` now DERIVES the emitted set
 * by scanning the source; this file is what it is derived against.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE IS INVENTED (Law 0.5, Law 3).
 *
 * Every mapping below resolves to a taxonomy that already exists in the
 * database or in the locked content data, and each was checked against the 362
 * published events on TEST before it was written. Where a mapping is a
 * judgement (a DJ set is electronic dance music) the reasoning is stated beside
 * it, and the proof harness asserts the resulting query returns real rows so a
 * mapping that resolves to nothing cannot ship quietly.
 */

// ---------------------------------------------------------------------------
// date -> preset
// ---------------------------------------------------------------------------
/**
 * `date` is an alias for `preset`, emitted by the homepage This Week rail, the
 * header search overlay, and the city and community-by-city landings. Every
 * value below appears in a real href.
 *
 * `week` is the homepage's own word for the next seven days ("What's happening
 * near you", viewAllHref `/events?date=week`), so it maps to the 7d window
 * rather than to the calendar month.
 */
export const DATE_TO_PRESET: Record<string, string> = {
  all: 'all',
  today: 'today',
  tonight: 'today',
  tomorrow: 'tomorrow',
  weekend: 'weekend',
  week: '7d',
  '7d': '7d',
  month: 'month',
  free: 'free',
}

// ---------------------------------------------------------------------------
// sort aliases
// ---------------------------------------------------------------------------
/**
 * `sort=trending` is emitted by the category highlight slides ("Trending now").
 * It is not one of the four sorts the parser accepts, so it silently resolved
 * to no sort at all and the link was indistinguishable from an unsorted browse.
 * Popularity is the sort the platform actually implements for that intent.
 */
export const SORT_ALIASES: Record<string, string> = {
  trending: 'popularity',
  popular: 'popularity',
  soonest: 'date_asc',
  cheapest: 'price_asc',
}

// ---------------------------------------------------------------------------
// event_type -> real tags and a real category
// ---------------------------------------------------------------------------
/**
 * The eight city-page format tiles (`CITY_EVENT_TYPES` in lib/cities/data.ts)
 * link to `/events?city=X&event_type=Y`. There is no `event_type` column, so
 * each one resolves to tags that exist on real events plus the category that
 * carries the same meaning.
 *
 * Tag counts measured on the 362 published events on TEST, 8 August 2026:
 *   comedy 28, community 61, arts-community 7, food-drink 28, food 2,
 *   sports 11, electronic 10, edm 10, techno 10, house 11, dance 12,
 *   electronic-dance 10, music 12, arts-culture 20, headline-concert 1.
 *
 * Two mappings are judgements rather than a literal tag match, and both are
 * grounded in the locked Scene taxonomy in CLAUDE.md:
 *   - dj-set resolves to the electronic and dance tokens, because a DJ set IS
 *     the Electronic & Dance scene; there is no `dj` tag on any event.
 *   - workshop resolves to the Education category, because a workshop is what
 *     that category holds; there is no `workshop` tag on any event.
 */
export const EVENT_TYPE_MAP: Record<string, { tags: string[]; category: string | null }> = {
  concert: { tags: ['concert', 'headline-concert', 'live-music', 'music'], category: 'music' },
  'dj-set': {
    tags: ['electronic', 'electronic-dance', 'edm', 'techno', 'house', 'dance', 'nightlife'],
    category: 'nightlife',
  },
  comedy: { tags: ['comedy', 'stand-up'], category: 'comedy' },
  theatre: { tags: ['theatre', 'arts-culture', 'performance'], category: 'arts-culture' },
  workshop: { tags: ['workshop', 'masterclass', 'education'], category: 'education' },
  community: { tags: ['community', 'arts-community'], category: 'community' },
  'food-drink': { tags: ['food-drink', 'food', 'drink'], category: 'food-drink' },
  sport: { tags: ['sports', 'sport'], category: 'sports' },
}

/** The PostgREST `.or(...)` fragment matching any of an event type's tags. */
export function buildEventTypeTagOrFilter(eventType: string): string | null {
  const entry = EVENT_TYPE_MAP[eventType]
  if (!entry || entry.tags.length === 0) return null
  return entry.tags.map((t) => `tags.cs.["${t}"]`).join(',')
}

/** The category slug an event type also accepts, or null. */
export function eventTypeCategory(eventType: string): string | null {
  return EVENT_TYPE_MAP[eventType]?.category ?? null
}

export function isEventType(value: string): boolean {
  return Object.hasOwn(EVENT_TYPE_MAP, value)
}

// ---------------------------------------------------------------------------
// city
// ---------------------------------------------------------------------------
/**
 * The `city` parameter carries a city SLUG (`/events?city=gold-coast`), and the
 * column it filters is `events.venue_city`, which holds a display NAME
 * ("Gold Coast"). The fetcher's `ilike('venue_city', '%gold-coast%')` therefore
 * matched nothing at all for every multi-word city: Gold Coast, Sunshine Coast.
 * It appeared to work only because single-word cities survive the mismatch by
 * accident.
 *
 * Returns the display name for a known slug, and otherwise the trimmed input,
 * so a hand-typed `?city=Geelong` still behaves.
 */
export function resolveCityName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  const city = getCity(trimmed.toLowerCase())
  return city ? city.name : trimmed
}

/** The canonical city slug for a slug or a display name, or null. */
export function resolveCitySlug(value: string): string | null {
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  if (isCitySlug(trimmed)) return trimmed
  const asSlug = trimmed.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return isCitySlug(asSlug) ? asSlug : null
}

// ---------------------------------------------------------------------------
// suburb
// ---------------------------------------------------------------------------
/**
 * `/city/[slug]/[suburb]` emits `?city=melbourne&suburb=inner-melbourne`: the
 * city-facing half of the suburb slug, whose full form is `melbourne-inner-melbourne`.
 *
 * These are broad districts ("Inner Melbourne", "Eastern Suburbs"), NOT literal
 * suburb names, so matching them against `venue_name` or `venue_city` as text
 * would resolve to nothing. What they do carry is a real centroid: every row in
 * the `suburbs` table has a latitude and a longitude, and 346 of the 362
 * published events on TEST (95.6 percent) have venue coordinates. So a suburb
 * filter is a radius around that centroid, resolved through the
 * `events_within_distance` RPC the distance filter already uses, unioned with a
 * direct match on `events.suburb_primary` for events that carry one.
 *
 * 12 km is the district radius. These entries are metropolitan districts rather
 * than single suburbs (Inner West spans Newtown to Marrickville to Enmore), and
 * a tighter radius cuts real venues out of their own district while a wider one
 * dissolves the distinction between neighbouring districts. It is a tuning
 * value, not a taxonomy, and the `city` filter always applies alongside it
 * because both parameters are emitted together.
 *
 * Re-exported from ONE source rather than declared twice. The organiser write
 * path, this filter and the suburb landing page all have to agree on which
 * district an event is in; two constants that happen to hold the same number
 * are two constants that will eventually not.
 */
export { SUBURB_MATCH_RADIUS_KM as SUBURB_RADIUS_KM } from '@/lib/cities/resolve-suburb'

/** Resolve a city-facing suburb slug to its full slug, city and centroid. */
export function resolveSuburb(
  citySlug: string | undefined,
  suburbValue: string,
): {
  slug: string
  cityFacingSlug: string
  citySlug: string
  name: string
  latitude: number
  longitude: number
} | null {
  const value = suburbValue.trim().toLowerCase()
  if (!value) return null
  // The emitted form is city-facing ("inner-melbourne"); the stored form is
  // fully qualified ("melbourne-inner-melbourne"). Accept either.
  const candidates = citySlug ? [`${citySlug}-${value}`, value] : [value]
  for (const candidate of candidates) {
    const suburb = getSuburb(candidate)
    if (suburb) {
      return {
        slug: suburb.slug,
        // Derived from the record rather than from the URL, so it is right even
        // when the caller passed the fully qualified form.
        cityFacingSlug: suburb.slug.slice(suburb.citySlug.length + 1),
        citySlug: suburb.citySlug,
        name: suburb.name,
        latitude: suburb.latitude,
        longitude: suburb.longitude,
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// venue
// ---------------------------------------------------------------------------
/**
 * `venue` arrives in TWO different shapes from two different surfaces, which is
 * itself a defect the parser has to absorb rather than pick a winner and break
 * the other:
 *   - the venue profile page emits a HANDLE: `/events?venue=${handle}`, where
 *     the handle is `venueSlugify(venue.name)`;
 *   - the homepage featured-venues rail emits an encoded NAME:
 *     `/events?venue=${encodeURIComponent(v.name)}`.
 *
 * Both resolve to the same thing: a match on `events.venue_name`. A handle is
 * turned back into a loose text match by replacing its separators, so
 * `the-forum-melbourne` matches "The Forum Melbourne" without needing a venue
 * table lookup on a column that is free text anyway.
 */
export function venueSearchTerm(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  // A handle has no spaces and at least one hyphen; a name almost always has a
  // space. Only rewrite the handle shape.
  if (!trimmed.includes(' ') && trimmed.includes('-')) {
    return trimmed.replace(/-+/g, ' ').trim()
  }
  return trimmed
}

// ---------------------------------------------------------------------------
// faith
// ---------------------------------------------------------------------------
/** The `.or(...)` fragment for `/events?faith=christian`, reusing the one
 *  source the /faith/[faith] landing already selects on. */
export function buildFaithFilter(value: string): string | null {
  const slug = value.trim().toLowerCase()
  return isFaithSlug(slug) ? buildFaithTagOrFilter(slug) : null
}

export function isKnownFaith(value: string): boolean {
  return isFaithSlug(value.trim().toLowerCase())
}

// ---------------------------------------------------------------------------
// moment
// ---------------------------------------------------------------------------
/**
 * `/events?moment=diwali-2026` comes from the homepage community-moments bento.
 * A moment is a named window in the year with an optional heritage, so it
 * resolves to that heritage's community filter plus the moment's date window.
 * A moment with no heritage (a faith or identity moment) still narrows by date,
 * which is the honest half of the answer rather than none of it.
 */
export function resolveMoment(
  value: string,
): { community: string | null; from: string; to: string } | null {
  const slug = value.trim().toLowerCase()
  const moment = COMMUNITY_MOMENTS.find((m) => m.slug === slug)
  if (!moment) return null
  return {
    community: moment.community ?? null,
    // The window is inclusive of the end day, so extend to its final moment.
    from: new Date(`${moment.start}T00:00:00.000Z`).toISOString(),
    to: new Date(`${moment.end}T23:59:59.999Z`).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// tab
// ---------------------------------------------------------------------------
/**
 * The header search overlay routes three of its four tabs to
 * `/events?q=...&tab=communities|cities|organisers`. The tab is not a filter on
 * events: it is the SCOPE of the search, and /events rendered the events scope
 * for all four, so searching "Melbourne" under Cities returned events whose
 * title contains Melbourne and no cities at all. Three of the four tabs were
 * dead ends.
 */
export const SEARCH_TABS = ['events', 'communities', 'cities', 'organisers'] as const
export type SearchTab = (typeof SEARCH_TABS)[number]

export function isSearchTab(value: string): value is SearchTab {
  return (SEARCH_TABS as readonly string[]).includes(value)
}
