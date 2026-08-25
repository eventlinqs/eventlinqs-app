/**
 * EVERY SERVER-SIDE DATA CACHE THAT CAN HOLD A COPY OF AN EVENT ROW.
 *
 * ============================================================================
 * WHY A REGISTRY RATHER THAN A STRING AT EACH CALL SITE
 * ============================================================================
 *
 * A tag written only where the cache is DECLARED is a tag nobody invalidates. On
 * 25 August 2026 an audit of this codebase found that of every tag declared on a
 * cached read, exactly ONE (`picker-cities`) was ever passed to `revalidateTag`
 * anywhere. Every other cache, including the one holding public event rows,
 * expired on a timer and on nothing else.
 *
 * The visible consequence was on production: after the demo catalogue was purged,
 * the "Popular this week" rail on /events served eight deleted events beside a
 * correct header count of 2, and a visitor clicking any of them got a 404. The
 * rail read through `events:popular-public`, a thirty minute cache that nothing
 * had ever invalidated in the history of the repository.
 *
 * Listing the tags HERE, and having both the declaration and the invalidation
 * import them from here, makes the two halves impossible to add separately:
 * `scripts/guards/one-visibility-source.mjs` fails the build if a cached read
 * declares a tag that is not in this registry.
 *
 * ============================================================================
 * THE RULE THIS REGISTRY EXISTS TO SUPPORT
 * ============================================================================
 *
 * Prefer NOT to cache event rows at all. Cache a ranking, an id list or an
 * aggregate, then read the rows live by id (see `fetchPopularThisWeekPublic`,
 * which was fixed this way). A cached ROW outlives the row it copied: it goes on
 * rendering after the event is deleted, unpublished, made private or cancelled,
 * and no correctness in the visibility predicate can save a caller that asked
 * once and kept the answer.
 *
 * Where a row cache is genuinely worth its keep, its tag belongs in this list so
 * that every mutation clears it.
 */

/**
 * Tags whose cached value can contain, or be derived from, event rows.
 *
 * `revalidateEventSurfaces` clears ALL of them on every event mutation. That is
 * deliberate over-invalidation: working out which tags a particular edit could
 * have touched is the reasoning that produced `if (input.has_reserved_seating)`,
 * which shipped and was wrong. The cost of clearing too much is one cold read.
 */
export const EVENT_DATA_CACHE_TAGS = [
  /** fetchPublicEventsCached: the /events grid and count. 60s. */
  'events-public',
  /** fetchPopularThisWeekPublic: the ranking only, since 25 August 2026. 30m. */
  'events:popular-public',
  /** fetchActiveCategoriesCached: which categories have anything in them. 1h. */
  'event-categories',
  /** The cities index page: per-city event counts. 5m. */
  'cities-index',
  /** The communities index page: per-community event counts. 5m. */
  'communities-index',
] as const

export type EventDataCacheTag = (typeof EVENT_DATA_CACHE_TAGS)[number]
