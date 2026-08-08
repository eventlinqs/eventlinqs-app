/**
 * The city event-type rail, resolved onto data that exists.
 *
 * Every city page renders a rail of eight event types (Concerts, DJ Sets,
 * Comedy, Theatre, Workshops, Community, Food & Drink, Sports) linking to
 * `/events?city=X&event_type=Y`. Nothing backed that parameter:
 * `events.event_type` is the online/in-person axis and is the literal string
 * `in_person` on all 362 published events, and there is no other column
 * carrying this taxonomy. So the rail was eight links that all landed on the
 * unfiltered national list.
 *
 * Rather than invent a column, each type maps onto the two things events
 * genuinely carry: a category slug (`event_categories.slug`) and free tags
 * (`events.tags`). A type matches if EITHER hits, so a comedy night tagged
 * "comedy" is found even though `event_categories` has no comedy row at all.
 *
 * Category slugs used here are verified present in `event_categories`, with
 * one deliberate exception: `arts-community` is the slug the homepage already
 * asks for and the slug migration 20260808000001 renames the arts row to. It
 * is referenced here by its correct post-migration name; until that migration
 * is applied the category half simply matches nothing and the tag half
 * carries the type, which is the same fallback comedy relies on.
 */

export type EventTypeFilter = {
  /** Category slugs whose events belong to this type. */
  categories: string[]
  /** Tag tokens whose events belong to this type. */
  tags: string[]
}

export const EVENT_TYPE_FILTER: Record<string, EventTypeFilter> = {
  concert: { categories: ['music'], tags: ['music', 'concert', 'live-music'] },
  'dj-set': { categories: ['nightlife'], tags: ['nightlife', 'dj-set', 'electronic', 'amapiano'] },
  // event_categories has no comedy row, so comedy is tag-only. This is why the
  // mapping is a union and not a single category lookup.
  comedy: { categories: [], tags: ['comedy'] },
  theatre: { categories: ['arts-community'], tags: ['theatre', 'arts-community'] },
  workshop: { categories: ['education'], tags: ['workshop', 'education'] },
  community: { categories: ['community'], tags: ['community'] },
  'food-drink': { categories: ['food-drink'], tags: ['food-drink', 'food', 'drink'] },
  sport: { categories: ['sports'], tags: ['sports', 'sport'] },
}

export function isKnownEventType(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(EVENT_TYPE_FILTER, slug)
}

/**
 * The tag half of the filter, as a PostgREST `.or()` group. Returns null when
 * the type has no tags, so the caller can tell "no tag clause" from "empty".
 */
export function buildEventTypeTagOr(slug: string): string | null {
  const def = EVENT_TYPE_FILTER[slug]
  if (!def || def.tags.length === 0) return null
  return def.tags.map((t) => `tags.cs.["${t}"]`).join(',')
}
