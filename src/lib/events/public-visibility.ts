import { listingWindowOrPredicate } from './listing-window'

/**
 * WHETHER AN EVENT MAY BE SEEN BY THE PUBLIC. One definition, composed by every
 * discovery query, so two parts of one page cannot disagree about it.
 *
 * ============================================================================
 * THE DEFECT THIS REPLACES, 25 August 2026
 * ============================================================================
 *
 * After the demo catalogue was purged from production, /events rendered a page
 * that disagreed with itself. On ONE render:
 *
 *   the header count      said "2 events available"   CORRECT
 *   the "All events" list  showed exactly 2            CORRECT
 *   the "Popular this week" rail showed EIGHT, every one of them an event that
 *                          had just been deleted       WRONG
 *
 * Three queries on one page, three different answers, and a visitor clicking any
 * of the eight got a 404 on a live platform.
 *
 * THE CACHE WAS THE MECHANISM, BUT IT WAS NOT THE CAUSE. The rail read through
 * `unstable_cache`, which is a SERVER-SIDE DATA cache keyed by cache key, not by
 * URL. That is why loading `/events?x=1` in a private tab, a URL never requested
 * before, still served the deleted rows: a new URL and a new browser reach the
 * same cache entry. Eliminating CDN and browser caching does not eliminate this
 * layer, and the natural conclusion from that test, that the query must be live,
 * is wrong. Proven by running the rail's own query live against production: it
 * returned 4 rows, none of them the purged ones.
 *
 * THE CAUSE is that the publication predicate was written out by hand at every
 * call site. At the time of this file, `status='published'` and
 * `visibility='public'` were spelled out across TWENTY source files. Each copy
 * was free to differ, and they did: the count applied the listing window, and the
 * popular rail applied it to a query whose id filter it then SKIPPED whenever no
 * orders had been placed, degrading "popular this week" into "any twelve
 * published events" with no popularity in it at all.
 *
 * A rule spelled out in twenty places is twenty rules. This file makes it one.
 *
 * ============================================================================
 * THE RULE
 * ============================================================================
 *
 * An event is publicly visible when ALL of these hold:
 *
 *   1. status = 'published'      not draft, not paused, not cancelled
 *   2. visibility = 'public'     not private, not unlisted
 *   3. inside the listing window  see listing-window.ts, which owns the WHEN and
 *                                 is deliberately a separate concern from this
 *                                 file's WHETHER
 *   4. external_ticket_url is null, for surfaces that promote a sale. An
 *      externally ticketed event is a real event and is not hidden; it is simply
 *      never promoted into a rail that implies buying here. Callers that list
 *      rather than promote pass `includeExternal: true`.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DECIDE. Whether the ORGANISER can
 * currently charge is a sale-posture question owned by the sale gate, and it is
 * read through a different, ownership-checked path (see the
 * `no-unowned-organisation-read` guard). Folding it in here would put five Stripe
 * columns into every anonymous discovery query. It is enforced at the point of
 * sale and surfaced as a refusal reason, never as a hidden row.
 *
 * ============================================================================
 * HOW TO USE IT, AND THE ONE RULE FOR CACHING
 * ============================================================================
 *
 *     let q = supabase.from('events').select(BASE_SELECT)
 *     q = applyPublicEventVisibility(q)
 *
 * NEVER CACHE THE ROWS THIS RETURNS. Cache a ranking, an id list or an aggregate
 * if the computation is expensive, then read the rows live by id. A cached event
 * ROW outlives the event: it keeps rendering after the row is deleted,
 * unpublished, made private or cancelled, and no amount of correctness in this
 * predicate can save a caller that asked it once and kept the answer. That is
 * precisely what happened above. `scripts/guards/one-visibility-source.mjs`
 * enforces both halves.
 */

/** The columns this rule reads. Named so a guard can check for hand-rolled copies. */
export const VISIBILITY_COLUMNS = ['status', 'visibility', 'external_ticket_url'] as const

/** The published/public values, written once. */
export const PUBLISHED_STATUS = 'published'
export const PUBLIC_VISIBILITY = 'public'

/**
 * The publication pair as a PostgREST `.match()` object.
 *
 * WHY THIS EXISTS BESIDE applyPublicEventVisibility. The builder-wrapping form is
 * the better API and is what new code should use, but adopting it across the
 * seventeen existing discovery surfaces means restructuring the head of every
 * query chain, in seventeen differently-formatted files, in one change. That is a
 * large diff with real regression risk on exactly the surfaces that must not
 * break.
 *
 * `.match(PUBLIC_EVENT_MATCH)` replaces the two hand-written `.eq` calls in
 * place, leaves the rest of each chain untouched, and moves the VALUES to one
 * definition. It is the part that was genuinely identical in all seventeen
 * copies, so it is the part that can be shared mechanically and safely.
 *
 * What it deliberately does NOT carry is the listing window and the
 * external-ticketing rule, because those legitimately differ per surface: a
 * venue profile lists an externally ticketed event, a rail that implies a
 * purchase does not. Those stay explicit, and applyPublicEventVisibility remains
 * the way to get all four together.
 */
export const PUBLIC_EVENT_MATCH = {
  status: PUBLISHED_STATUS,
  visibility: PUBLIC_VISIBILITY,
} as const

/**
 * The minimum shape of a Supabase query builder this helper needs. Structural
 * rather than importing PostgrestFilterBuilder, so it composes with the several
 * differently-typed builders in this codebase without a cast at every call site.
 */
export type VisibilityQuery = {
  eq(column: string, value: unknown): VisibilityQuery
  is(column: string, value: null): VisibilityQuery
  or(filters: string): VisibilityQuery
}

export type PublicVisibilityOptions = {
  /** The instant to judge the listing window against. Defaults to now. */
  now?: Date
  /**
   * Include externally ticketed events. Default false, which is correct for any
   * surface that promotes a sale. Pass true only where the surface lists without
   * implying a purchase here.
   */
  includeExternal?: boolean
}

/**
 * Apply the public visibility rule to a Supabase events query.
 *
 * Every discovery query composes from this. It is the single definition of what
 * the public may see, so the count, the rail and the grid on one page cannot
 * give three different answers.
 */
export function applyPublicEventVisibility<T>(
  query: T,
  options: PublicVisibilityOptions = {},
): T {
  const now = options.now ?? new Date()

  /*
   * THE ONE CAST, and why it is here rather than at every call site. Supabase's
   * PostgrestFilterBuilder is generic over the row type, the schema and the
   * relationship shape, and it returns a NEW builder type from every chained
   * call. Writing this helper against that type with a self-referential generic
   * (`T extends VisibilityQuery<T>`) makes tsc give up with TS2589, "type
   * instantiation is excessively deep and possibly infinite", which is what the
   * first version of this file did.
   *
   * The alternative is a cast at each of the twenty-odd call sites, which is
   * twenty places to get it wrong. One contained cast, in the file that owns the
   * rule, is the smaller risk: it cannot silently apply the WRONG predicate,
   * only fail loudly at runtime if a caller passes something that is not a
   * builder, and every caller passes one.
   */
  const q = query as VisibilityQuery
  let out = q
    .eq('status', PUBLISHED_STATUS)
    .eq('visibility', PUBLIC_VISIBILITY)
    .or(listingWindowOrPredicate(now))
  if (!options.includeExternal) {
    out = out.is('external_ticket_url', null)
  }
  return out as T
}

/**
 * The same rule as SQL, for the direct-Postgres paths (guards, drills, probes)
 * that do not hold a Supabase client.
 *
 * Kept beside the builder version on purpose: two expressions of one rule that
 * live in the same file can be read against each other in one screen, and
 * `tests/unit/events/public-visibility.test.ts` asserts they agree.
 */
export function publicEventVisibilitySql(options: { includeExternal?: boolean } = {}): string {
  const clauses = [
    `status = '${PUBLISHED_STATUS}'`,
    `visibility = '${PUBLIC_VISIBILITY}'`,
  ]
  if (!options.includeExternal) clauses.push('external_ticket_url is null')
  return clauses.join(' and ')
}
