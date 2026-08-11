import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPublicClient } from '@/lib/supabase/public-client'
import { withBadge } from './badges'
import { buildCommunityTagOrFilter } from '@/lib/communities/tag-bridge'
import type { CommunitySlug } from '@/lib/communities/data'
import { buildSearchOrGroups, tokenise, sanitiseToken } from './search-query'
import { EVENT_TYPE_FILTER, buildEventTypeTagOr } from './event-type-filter'
import { resolveSearchTab } from './search-tab'
import {
  buildEventTypeTagOrFilter,
  buildFaithFilter,
  eventTypeCategory,
  resolveCityName,
  resolveSuburb,
  venueSearchTerm,
} from './url-filters'
import { resolveSuburbSlug } from '@/lib/cities/resolve-suburb'
import {
  rankEventsByAffinity,
  hasAnyAffinitySignal,
  type AffinitySignals,
} from './affinity'
import type {
  FetchPublicEventsFilters,
  FetchPublicEventsInput,
  FetchPublicEventsResult,
  PublicEventRow,
} from './types'

/**
 * Resolve community / sub_community filters into a PostgREST OR-filter that
 * matches events whose `tags` jsonb array contains any identifying tag
 * for the community. Returns null when no community constraint is set.
 *
 * Replaces the legacy category-slug bridge: live events carry generic
 * categories ('music', 'nightlife', 'community', ...) so the old path
 * resolved every community to zero rows and silently emptied the entire
 * community surface. Tag containment is the reliable signal. See
 * src/lib/communities/tag-bridge.ts.
 */
function resolveCommunityTagOrFilter(
  filters: FetchPublicEventsFilters,
): string | null {
  if (!filters.community) return null
  return buildCommunityTagOrFilter(
    filters.community as CommunitySlug,
    filters.sub_community,
  )
}

/** The impossible id used to force an empty result set deliberately. */
const NO_MATCH = '00000000-0000-0000-0000-000000000000'

/**
 * Escape a value for use inside a PostgREST `or(...)` filter.
 *
 * Inside `or()` the characters `,` `.` `(` `)` are GRAMMAR, not data. An
 * unescaped search term containing any of them does not merely fail to match:
 * it is parsed as more filter clauses, so a query for "rock, paper" becomes two
 * conditions and a query containing a bare `.` can name a column. Quoting makes
 * the whole value literal, and a quote or backslash inside the value has to be
 * escaped so it cannot close the quoting early.
 */
function escapeOrValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Free-text columns a search reads. Ordered most to least specific. */
const SEARCH_TEXT_COLUMNS = ['title', 'summary', 'description', 'venue_name', 'venue_city'] as const

/**
 * The free-text search predicate. ONE source for both fetch paths.
 *
 * WHAT WAS BROKEN. Search was `ilike('title', '%q%')` and nothing else, so it
 * matched a substring of the event title and only that. Two consequences, both
 * of which look like an empty catalogue rather than a broken search:
 *
 *   - the twelve homepage Sounds tiles link to `/events?q=`, and NINE of them
 *     send a multi-word query ("afrobeats amapiano", "hip hop rnb", "folk
 *     acoustic"). No event title contains those literal strings. The events
 *     exist and are tagged `afrobeats-amapiano`, `hip-hop-rnb`, `folk-acoustic`;
 *     the tiles simply could not reach them;
 *   - an organiser who wrote the genre in the description, or a buyer searching
 *     a venue or a suburb name, matched nothing.
 *
 * THE SHAPE OF THE FIX, and why it is not "match any token everywhere". Free
 * text is matched on the WHOLE phrase across the five text columns. Individual
 * tokens are matched ONLY against `tags`, which is a controlled vocabulary, so
 * "hip hop rnb" reaches the `rnb` tag without "hop" also dragging in every
 * event with "Hopscotch" in its title. Matching loose tokens against free text
 * would trade one broken search for a noisy one.
 *
 * The hyphenated form of the phrase is matched against tags too, because that
 * is exactly how the scene taxonomy is stored: the tile says "afrobeats
 * amapiano" and the tag is `afrobeats-amapiano`.
 */
function buildSearchOp(q: string | undefined): QueryOp | null {
  const phrase = q?.trim()
  if (!phrase) return null

  const clauses = SEARCH_TEXT_COLUMNS.map(
    (column) => `${column}.ilike.${escapeOrValue(`%${phrase}%`)}`,
  )

  const tokens = phrase.toLowerCase().split(/\s+/).filter(Boolean)
  // The scene taxonomy stores multi-word genres hyphenated.
  const hyphenated = tokens.join('-')
  const tagTokens = new Set(tokens.length > 1 ? [hyphenated, ...tokens] : tokens)
  for (const token of tagTokens) {
    // Tag containment is exact, so a token can only match a real tag.
    clauses.push(`tags.cs.${escapeOrValue(`["${token}"]`)}`)
  }

  return { kind: 'or', filter: clauses.join(',') }
}

/**
 * One filter operation, resolved but not yet applied.
 *
 * WHY OPERATIONS RATHER THAN A SHARED QUERY BUILDER. There are two fetch paths
 * (the request-scoped public client and the cached admin client) and their
 * filter blocks were copies of each other. They had already drifted once: the
 * public path carried a `distance_km` branch the cached path did not. Resolving
 * the filters ONCE into a list of operations and applying that list in both
 * places means a new filter cannot be added to one path and forgotten in the
 * other, and it makes the decisions unit-testable without a database.
 */
type QueryOp =
  | { kind: 'eq'; column: string; value: string | boolean }
  | { kind: 'ilike'; column: string; value: string }
  | { kind: 'or'; filter: string }
  | { kind: 'in'; column: string; values: string[] }
  | { kind: 'gte'; column: string; value: string }
  | { kind: 'lte'; column: string; value: string }

/** The subset of the PostgREST builder the operations need. */
interface FilterableQuery {
  eq(column: string, value: never): this
  ilike(column: string, value: string): this
  or(filter: string): this
  in(column: string, values: never): this
  gte(column: string, value: never): this
  lte(column: string, value: never): this
}

function applyOps<Q extends FilterableQuery>(query: Q, ops: QueryOp[]): Q {
  let q = query
  for (const op of ops) {
    switch (op.kind) {
      case 'eq':
        q = q.eq(op.column, op.value as never)
        break
      case 'ilike':
        q = q.ilike(op.column, op.value)
        break
      case 'or':
        q = q.or(op.filter)
        break
      case 'in':
        q = q.in(op.column, op.values as never)
        break
      case 'gte':
        q = q.gte(op.column, op.value as never)
        break
      case 'lte':
        q = q.lte(op.column, op.value as never)
        break
    }
  }
  return q
}

/** The lookups the resolver needs. Both Supabase clients satisfy it. */
type LookupBuilder = {
  eq(column: string, value: string): LookupBuilder
  ilike(column: string, value: string): LookupBuilder
  limit(count: number): PromiseLike<{ data: unknown[] | null }>
  maybeSingle(): PromiseLike<{ data: { id: string } | null }>
}
type LookupClient = {
  from(table: string): { select(columns: string): LookupBuilder }
}

async function lookupId(
  supabase: LookupClient,
  table: string,
  slug: string,
): Promise<string | null> {
  const { data } = await supabase.from(table).select('id').eq('slug', slug).maybeSingle()
  return data?.id ?? null
}

/** The rows the district membership pass needs. */
type DistrictCandidate = {
  id: string
  suburb_primary: string | null
  venue_latitude: number | null
  venue_longitude: number | null
}

/**
 * The ids of published events whose ONE nearest district is `districtSlug`.
 *
 * Bounded by the district's own city, so this reads tens of rows, not the
 * catalogue. Prefers the stored `suburb_primary` where the row carries one (the
 * organiser path writes it, and migration 20260808000003 backfills it) and
 * falls back to resolving the coordinates with the identical rule, so the
 * filter is correct with or without that migration having been applied.
 */
async function eventIdsInDistrict(
  supabase: LookupClient,
  citySlug: string,
  districtSlug: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('events')
    .select('id, suburb_primary, venue_latitude, venue_longitude')
    .eq('status', 'published')
    .ilike('venue_city', `%${resolveCityName(citySlug)}%`)
    .limit(500)
  return ((data ?? []) as DistrictCandidate[])
    .filter(
      (e) =>
        (e.suburb_primary ??
          resolveSuburbSlug({
            citySlug,
            latitude: e.venue_latitude,
            longitude: e.venue_longitude,
          })) === districtSlug,
    )
    .map((e) => e.id)
}

/**
 * Resolve every URL filter into query operations.
 *
 * Each unknown value forces an EMPTY result rather than being ignored. That is
 * deliberate and it is the whole point of this change: silently dropping a
 * filter is what made `/events?city=gold-coast` serve the national catalogue as
 * though it were the Gold Coast answer. An empty result is a designed empty
 * state the user can read; a full national list is a wrong answer they cannot
 * tell apart from a right one.
 */
async function resolveEventFilterOps(
  supabase: LookupClient,
  filters: FetchPublicEventsFilters,
): Promise<QueryOp[]> {
  const ops: QueryOp[] = []

  const searchOp = buildSearchOp(filters.q)
  if (searchOp) ops.push(searchOp)

  if (filters.category) {
    const id = await lookupId(supabase, 'event_categories', filters.category)
    ops.push({ kind: 'eq', column: 'category_id', value: id ?? NO_MATCH })
  } else if (filters.community) {
    const tagOr = resolveCommunityTagOrFilter(filters)
    // Unknown community slug: force an empty result rather than leak the
    // entire catalogue under a community URL.
    ops.push(tagOr === null ? { kind: 'eq', column: 'id', value: NO_MATCH } : { kind: 'or', filter: tagOr })
  }

  // city: the parameter carries a SLUG and venue_city holds a display NAME, so
  // every multi-word city (Gold Coast, Sunshine Coast) matched nothing before.
  if (filters.city) {
    ops.push({ kind: 'ilike', column: 'venue_city', value: `%${resolveCityName(filters.city)}%` })
  }
  if (filters.country) ops.push({ kind: 'eq', column: 'venue_country', value: filters.country })

  // event_type: no such column exists, so it resolves to the tags that carry
  // the meaning plus the category of the same name where one exists.
  if (filters.event_type) {
    const tagOr = buildEventTypeTagOrFilter(filters.event_type)
    const categorySlug = eventTypeCategory(filters.event_type)
    const categoryId = categorySlug ? await lookupId(supabase, 'event_categories', categorySlug) : null
    const clauses = [tagOr, categoryId ? `category_id.eq.${categoryId}` : null]
      .filter((c): c is string => Boolean(c))
    ops.push(clauses.length ? { kind: 'or', filter: clauses.join(',') } : { kind: 'eq', column: 'id', value: NO_MATCH })
  }

  // venue: a handle from the venue profile, or an encoded name from the
  // homepage rail. Both resolve to a venue_name match.
  if (filters.venue) {
    ops.push({ kind: 'ilike', column: 'venue_name', value: `%${venueSearchTerm(filters.venue)}%` })
  }

  if (filters.organiser) {
    const id = await lookupId(supabase, 'organisations', filters.organiser)
    ops.push({ kind: 'eq', column: 'organisation_id', value: id ?? NO_MATCH })
  }

  if (filters.faith) {
    const faithOr = buildFaithFilter(filters.faith)
    ops.push(faithOr ? { kind: 'or', filter: faithOr } : { kind: 'eq', column: 'id', value: NO_MATCH })
  }

  // suburb: EXCLUSIVE district assignment.
  //
  // An earlier version of this unioned suburb_primary with "any event within
  // the district radius". That is INCLUSIVE, and an assignment that is
  // inclusive is not an assignment. Melbourne's six districts all sit within
  // 12 km of the CBD, and 43 of the 55 Melbourne events carry the CBD centroid
  // as their venue coordinate, so the radius union handed those same 43 events
  // to all six districts and every district page was a copy of the city page.
  //
  // The rule is the ONE nearest district (resolveSuburbSlug), the same rule the
  // organiser write path and the suburb landing page apply. It is evaluated
  // here rather than delegated entirely to suburb_primary so the filter is
  // correct BEFORE the backfill migration has been applied as well as after: a
  // discovery surface that depends on a migration somebody has to remember to
  // run is a silent break waiting to happen, which is the whole defect class
  // this branch belongs to.
  if (filters.suburb) {
    const suburb = resolveSuburb(filters.city, filters.suburb)
    if (!suburb) {
      ops.push({ kind: 'eq', column: 'id', value: NO_MATCH })
    } else {
      const ids = await eventIdsInDistrict(supabase, suburb.citySlug, suburb.slug)
      ops.push(ids.length ? { kind: 'in', column: 'id', values: ids } : { kind: 'eq', column: 'id', value: NO_MATCH })
    }
  }

  return ops
}

/**
 * The subset of the Supabase client these search helpers touch, following the
 * same `Pick<..., 'from'>` convention as BroadcastClient. Both the server and
 * admin clients satisfy it, which is why the same helpers serve both fetch
 * paths.
 */
type EventsQueryClient = Pick<ReturnType<typeof createAdminClient>, 'from'>

/**
 * A PostgREST filter builder, narrowed to the one method these helpers call.
 * Generic so the builder's own chained type flows through untouched.
 */
type OrFilterable<T> = { or: (filter: string) => T }

/**
 * Which organisations does each search token name?
 *
 * An organiser's name lives on `organisations`, not on `events`, and PostgREST
 * cannot filter a parent table from inside an `.or()` group on the child. So
 * the names are resolved to ids in one round trip and the ids join the token's
 * OR group as `organisation_id.in.(...)`. Without this, searching an
 * organiser's own name returns nothing, which is what it did.
 *
 * One query total regardless of token count. A failure degrades to "no
 * organiser matched", never to a broken search.
 */
async function resolveOrganisationIdsByToken(
  supabase: EventsQueryClient,
  q: string,
): Promise<Map<string, string[]>> {
  const tokens = tokenise(q)
  const byToken = new Map<string, string[]>()
  if (tokens.length === 0) return byToken

  const { data, error } = await supabase
    .from('organisations')
    .select('id, name')
    .or(tokens.map((t) => `name.ilike.*${t}*`).join(','))
    .limit(200)
  if (error || !data) return byToken

  for (const token of tokens) {
    const lower = token.toLowerCase()
    const ids = (data as { id: string; name: string | null }[])
      .filter((o) => (o.name ?? '').toLowerCase().includes(lower))
      .map((o) => o.id)
    if (ids.length > 0) byToken.set(token, ids)
  }
  return byToken
}

/**
 * Narrow to one of the eight city event types. Unknown slugs are IGNORED
 * rather than forced empty: an event type is a browse convenience, and a stale
 * link should widen to the city rather than dead-end on nothing.
 *
 * Returns the OR clause, not a modified builder. A PostgrestFilterBuilder is
 * itself thenable, so `await`ing a function that returns one unwraps it to the
 * response type and the query is lost. Doing the async work here and applying
 * the string at the call site keeps the builder's own chained type intact.
 */
async function buildEventTypeClause(
  supabase: EventsQueryClient,
  slug: string,
): Promise<string | null> {
  const def = EVENT_TYPE_FILTER[slug]
  if (!def) return null

  const parts: string[] = []
  if (def.categories.length > 0) {
    const { data: cats } = await supabase
      .from('event_categories')
      .select('id')
      .in('slug', def.categories)
    const ids = ((cats ?? []) as { id: string }[]).map((c) => c.id)
    if (ids.length > 0) parts.push(`category_id.in.(${ids.join(',')})`)
  }
  const tagOr = buildEventTypeTagOr(slug)
  if (tagOr) parts.push(tagOr)

  return parts.length > 0 ? parts.join(',') : null
}

/**
 * The venue link is emitted twice with two different values: a display name
 * from a venue rail and a URL handle from a venue profile. Both are matched,
 * with hyphens read as spaces, so "the-espy" and "The Espy" both find the
 * venue instead of landing on the national list.
 */
function applyVenueFilter<T extends OrFilterable<T>>(query: T, venue: string): T {
  const clean = sanitiseToken(venue)
  if (!clean) return query
  const spaced = sanitiseToken(venue.replace(/-/g, ' '))
  const variants = [...new Set([clean, spaced])].filter(Boolean)
  return query.or(variants.map((v) => `venue_name.ilike.*${v}*`).join(','))
}

/**
 * Sorts that cannot be expressed in the query, because what they order by is
 * not a column on `events`.
 *
 * `price_asc` reads the cheapest tier and `popularity` reads total tickets
 * sold, both of which live on the child `ticket_tiers` rows. PostgREST cannot
 * order a parent by a child aggregate, so these are computed after the fetch.
 *
 * THE DEFECT THAT MADE THIS NECESSARY. Both were applied AFTER `.range()` had
 * already paginated, so `price_asc` reordered only the 24 rows on the current
 * page: page one of 195 results showed the 24 SOONEST events arranged by
 * price, never the 24 cheapest. `popularity` had no sort at all and simply
 * left the date order in place, so choosing it changed nothing whatsoever.
 *
 * When one of these is chosen the query fetches a bounded superset instead of
 * one page, sorts it whole, and then slices the page out. The cap keeps a
 * pathological query bounded; beyond it the sort is still correct for the rows
 * considered, which is the same contract the price filter already has.
 */
const IN_MEMORY_SORTS = new Set(['price_asc', 'popularity'])
const MAX_SORT_ROWS = 500

function sortsInMemory(sort: string | undefined): boolean {
  return Boolean(sort && IN_MEMORY_SORTS.has(sort))
}

/** Total tickets sold across an event's tiers. */
function soldTotal(e: PublicEventRow): number {
  return e.ticket_tiers.reduce((sum, t) => sum + (t.sold_count ?? 0), 0)
}

function cheapest(e: PublicEventRow): number {
  if (e.ticket_tiers.length === 0) return 0
  return Math.min(...e.ticket_tiers.map(t => t.price))
}

/** Apply the post-fetch sort and slice the requested page out of the result. */
function applyInMemorySort(
  events: PublicEventRow[],
  sort: string | undefined,
  page: number,
  pageSize: number,
): PublicEventRow[] {
  if (!sortsInMemory(sort)) return events
  const sorted = [...events]
  if (sort === 'price_asc') sorted.sort((a, b) => cheapest(a) - cheapest(b))
  // Most sold first; ties keep the earlier date, which is the default order.
  else if (sort === 'popularity') sorted.sort((a, b) => soldTotal(b) - soldTotal(a))
  const start = (page - 1) * pageSize
  return sorted.slice(start, start + pageSize)
}

/**
 * Raw row shape as it comes back from the Supabase query.
 * Nested selects return single-item arrays or objects depending on FK type;
 * we normalise both in toPublicEventRow.
 */
type RawRow = {
  id: string
  slug: string
  title: string
  summary: string | null
  description: string | null
  cover_image_url: string | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  start_date: string
  end_date: string
  venue_name: string | null
  venue_city: string | null
  venue_country: string | null
  venue_latitude: number | null
  venue_longitude: number | null
  created_at: string
  is_free: boolean | null
  category: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null
  organisation: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null
  ticket_tiers: {
    id: string
    price: number
    currency: string
    sold_count: number
    reserved_count: number
    total_capacity: number
  }[] | null
}

const DEFAULT_PAGE_SIZE = 24
const BASE_SELECT =
  'id, slug, title, summary, description, cover_image_url, thumbnail_url, gallery_urls, start_date, end_date, venue_name, venue_city, venue_country, venue_latitude, venue_longitude, created_at, is_free, category:event_categories(id, name, slug), organisation:organisations(id, name, slug), ticket_tiers(id, price, currency, sold_count, reserved_count, total_capacity)'

function normaliseRelation<T>(rel: T | T[] | null): T | null {
  if (rel === null || rel === undefined) return null
  if (Array.isArray(rel)) return rel[0] ?? null
  return rel
}

// Batch 4: photo-required public-surface filter.
// Event cards on every public surface MUST show a real organiser-uploaded
// cover. Until the DB migration backfills, picsum.photos seed URLs are
// treated as "no cover" so seed events disappear from the public catalogue
// rather than rendering as duplicate Pexels-stock collisions in the grid.
// The migration (20260504000001_event_photo_required.sql) hardens this at
// the DB layer for new published events.
export function hasRealCover(url: string | null | undefined): url is string {
  if (!url) return false
  if (/^https:\/\/picsum\.photos\//i.test(url)) return false
  return true
}

function toPublicEventRow(raw: RawRow): PublicEventRow {
  const row = {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    summary: raw.summary,
    description: raw.description,
    cover_image_url: raw.cover_image_url,
    thumbnail_url: raw.thumbnail_url,
    gallery_urls: raw.gallery_urls,
    start_date: raw.start_date,
    end_date: raw.end_date,
    venue_name: raw.venue_name,
    venue_city: raw.venue_city,
    venue_country: raw.venue_country,
    venue_latitude: raw.venue_latitude,
    venue_longitude: raw.venue_longitude,
    created_at: raw.created_at,
    is_free: raw.is_free,
    category: normaliseRelation(raw.category),
    organisation: normaliseRelation(raw.organisation),
    ticket_tiers: raw.ticket_tiers ?? [],
  }
  return withBadge(row)
}

function presetWindow(preset: string | undefined, now: Date): { from: string; to?: string } | null {
  if (!preset || preset === 'all' || preset === 'free') return null

  const nowIso = now.toISOString()

  if (preset === 'today') {
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return { from: nowIso, to: end.toISOString() }
  }

  if (preset === 'tomorrow') {
    const start = new Date(now)
    start.setDate(start.getDate() + 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setHours(23, 59, 59, 999)
    return { from: start.toISOString(), to: end.toISOString() }
  }

  if (preset === 'weekend') {
    const day = now.getDay() // 0 Sun .. 6 Sat
    const start = new Date(now)
    if (day === 6) {
      start.setHours(0, 0, 0, 0)
    } else if (day === 0) {
      start.setDate(start.getDate() - 1)
      start.setHours(0, 0, 0, 0)
    } else {
      start.setDate(start.getDate() + (6 - day))
      start.setHours(0, 0, 0, 0)
    }
    const end = new Date(start)
    end.setDate(start.getDate() + 1)
    end.setHours(23, 59, 59, 999)
    return { from: start.toISOString(), to: end.toISOString() }
  }

  if (preset === '7d') {
    const end = new Date(now)
    end.setDate(end.getDate() + 7)
    return { from: nowIso, to: end.toISOString() }
  }

  if (preset === 'month') {
    const end = new Date(now)
    end.setMonth(end.getMonth() + 1)
    return { from: nowIso, to: end.toISOString() }
  }

  return null
}

/**
 * Fetch published public events with filter + pagination + optional bbox.
 * Uses the cookies-free public client so callers (including dynamic
 * /events filter renders) don't get tainted into per-request SSR by a
 * cookies() read. RLS permits SELECT on published + public events for
 * anonymous visitors via the anon key.
 */
export async function fetchPublicEvents(
  input: FetchPublicEventsInput = {},
): Promise<FetchPublicEventsResult> {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE
  const offset = (page - 1) * pageSize
  const filters = input.filters ?? {}
  const now = new Date()

  const supabase = createPublicClient()

  // Distance filter: resolve IDs within radius via Haversine RPC before
  // the main query. Requires an origin; silently no-ops if the caller
  // didn't provide one (geolocation not granted / unresolved).
  let distanceIds: string[] | null = null
  if (
    typeof filters.distance_km === 'number' &&
    filters.distance_km > 0 &&
    input.origin
  ) {
    const { data: nearby } = await supabase.rpc('events_within_distance', {
      p_lat: input.origin.latitude,
      p_lng: input.origin.longitude,
      p_radius_km: filters.distance_km,
    })
    distanceIds = ((nearby ?? []) as { id: string }[]).map(e => e.id)
    if (distanceIds.length === 0) {
      return { events: [], total: 0, page, pageSize, totalPages: 0 }
    }
  }

  let query = supabase
    .from('events')
    .select(BASE_SELECT, { count: 'exact' })
    .eq('status', 'published')
    .eq('visibility', 'public')
    .range(
      sortsInMemory(filters.sort) ? 0 : offset,
      sortsInMemory(filters.sort) ? MAX_SORT_ROWS - 1 : offset + pageSize - 1,
    )

  if (distanceIds) query = query.in('id', distanceIds)

  if (filters.sort === 'date_asc' || !filters.sort || filters.sort === 'relevance') {
    query = query.order('start_date', { ascending: true })
  } else if (filters.sort === 'price_asc') {
    query = query.order('start_date', { ascending: true })
  } else if (filters.sort === 'popularity') {
    query = query.order('start_date', { ascending: true })
  }

  // TAB SCOPING (origin/main) THEN THE OPS RESOLVER (this branch).
  //
  // MERGE NOTE, resolution 7 of the nine in
  // docs/roast/HANDOVER-public-composer-2026-08-09.md section 2. Both branches
  // changed this block. They are not alternatives: the tab decides WHERE the
  // free text may match, and the resolver decides HOW each filter becomes a
  // PostgREST op. Composing them keeps the header search tabs and the
  // suburb/organiser/faith/moment filters, and dropping either side would
  // silently un-ship a working surface.
  //
  // main's inline category, community, city and country blocks are not repeated
  // here because resolveEventFilterOps already emits exactly those ops, along
  // with venue, event_type, organiser, faith and suburb. Keeping both would
  // apply each filter twice.
  const tab = resolveSearchTab(filters.tab, filters.q)
  const effective = { ...filters, ...tab.overrides }

  // On the Organisers tab the query names an ORGANISER, so a title match would
  // be a wrong answer that looks like a result. The free text is consumed here
  // and withheld from the resolver so it cannot also run as a text search.
  if (effective.q && tab.keepFreeText && tab.organisersOnly) {
    const orgIds = await resolveOrganisationIdsByToken(supabase, effective.q)
    const ids = [...new Set([...orgIds.values()].flat())]
    query = query.in('organisation_id', ids.length > 0 ? ids : [NO_MATCH])
  }

  const forResolver = tab.organisersOnly
    ? { ...effective, q: undefined }
    : tab.keepFreeText
      ? effective
      : { ...effective, q: undefined }

  query = applyOps(query, await resolveEventFilterOps(supabase as unknown as LookupClient, forResolver))

  if (filters.preset === 'free') {
    query = query.eq('is_free', true)
  }

  const window = presetWindow(filters.preset, now)
  if (window) {
    query = query.gte('start_date', window.from)
    if (window.to) query = query.lte('start_date', window.to)
  } else {
    query = query.gte('start_date', now.toISOString())
  }

  if (filters.from) query = query.gte('start_date', filters.from)
  if (filters.to) query = query.lte('start_date', filters.to)

  if (input.bbox) {
    query = query
      .gte('venue_longitude', input.bbox.minLng)
      .lte('venue_longitude', input.bbox.maxLng)
      .gte('venue_latitude', input.bbox.minLat)
      .lte('venue_latitude', input.bbox.maxLat)
  }

  const { data, count, error } = await query
  if (error) {
    console.error('[fetchPublicEvents] query failed:', error)
    return { events: [], total: 0, page, pageSize, totalPages: 0 }
  }

  const raw = (data ?? []) as unknown as RawRow[]
  let events = raw.map(toPublicEventRow).filter(e => hasRealCover(e.cover_image_url))

  // price_min / price_max arrive in AUD (dollar units) from the URL; tier
  // prices are stored as integer minor units (cents) per the monetary
  // conventions in CLAUDE.md. Convert before comparison.
  const priceFiltered =
    typeof filters.price_min === 'number' || typeof filters.price_max === 'number'
  if (priceFiltered) {
    const minCents = (filters.price_min ?? 0) * 100
    const maxCents =
      filters.price_max === undefined ? Number.POSITIVE_INFINITY : filters.price_max * 100
    events = events.filter(e => {
      if (e.ticket_tiers.length === 0) return minCents === 0
      const cheapest = Math.min(...e.ticket_tiers.map(t => t.price))
      return cheapest >= minCents && cheapest <= maxCents
    })
  }

  const sortedWhole = sortsInMemory(filters.sort)
  // Captured BEFORE the sort slices a page out, so pagination still reflects
  // how many events actually matched rather than how many are on this page.
  const matchedBeforeSlice = events.length
  if (sortedWhole) events = applyInMemorySort(events, filters.sort, page, pageSize)

  // When price filtering strips rows post-query, the Supabase `count`
  // reflects the pre-filter total and disagrees with the rendered grid.
  // Use the filtered length as the source of truth so the hero strip
  // and pagination match what the user sees.
  // TODO(m5-perf): move price filter into SQL to avoid over-fetching
  //   when query pages are large - tracked against Step 8.
  const total = sortedWhole
    ? (priceFiltered ? matchedBeforeSlice : count ?? matchedBeforeSlice)
    : priceFiltered
      ? events.length
      : count ?? events.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return { events, total, page, pageSize, totalPages }
}


/**
 * Cached variant for anonymous default-case browsing. Uses the admin client
 * (published + public filter keeps data scope identical to RLS) and
 * unstable_cache so PSI/bot cache-bust queries still share a warm snapshot.
 * Bucketed by hour to avoid cache-key explosion while staying fresh.
 * Callers must only pass origin when genuinely needed - ignore the argument
 * for the default case so the cache key stays stable.
 */
export async function fetchPublicEventsCached(
  input: FetchPublicEventsInput = {},
): Promise<FetchPublicEventsResult> {
  const filters = input.filters ?? {}
  const page = input.page ?? 1
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE
  const bucket = Math.floor(Date.now() / (60 * 60 * 1000))
  const keyParts = [
    'events-public-v1',
    `bucket:${bucket}`,
    `page:${page}`,
    `size:${pageSize}`,
    `country:${filters.country ?? ''}`,
    `city:${filters.city ?? ''}`,
    `category:${filters.category ?? ''}`,
    `community:${filters.community ?? ''}`,
    `subc:${filters.sub_community ?? ''}`,
    `preset:${filters.preset ?? ''}`,
    `sort:${filters.sort ?? ''}`,
    `q:${filters.q ?? ''}`,
    `from:${filters.from ?? ''}`,
    `to:${filters.to ?? ''}`,
    `pmin:${filters.price_min ?? ''}`,
    `pmax:${filters.price_max ?? ''}`,
    // Every filter that narrows the query MUST appear in the key. A filter
    // missing here makes two different questions share one cached answer, so
    // whichever ran first is served to both.
    //
    // MERGE NOTE, resolution 8 of the nine in
    // docs/roast/HANDOVER-public-composer-2026-08-09.md section 2: the UNION of
    // both key sets. main added `tab`; this branch added suburb, organiser,
    // faith and moment. Omitting any one of them serves a filtered page under
    // another filter's URL.
    `suburb:${filters.suburb ?? ''}`,
    `etype:${filters.event_type ?? ''}`,
    `venue:${filters.venue ?? ''}`,
    `org:${filters.organiser ?? ''}`,
    `faith:${filters.faith ?? ''}`,
    `moment:${filters.moment ?? ''}`,
    `tab:${filters.tab ?? ''}`,
  ]
  const cacheKey = keyParts.join('|')

  return unstable_cache(
    () => runFetchPublicEventsAdmin({ filters, page, pageSize, origin: input.origin, bbox: input.bbox }),
    [cacheKey],
    { revalidate: 60, tags: ['events-public'] },
  )()
}

export const fetchActiveCategoriesCached = unstable_cache(
  async () => {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('event_categories')
      .select('id, name, slug')
      .eq('is_active', true)
      .order('sort_order')
    return (data ?? []) as { id: string; name: string; slug: string }[]
  },
  ['events-active-categories-v1'],
  { revalidate: 3600, tags: ['event-categories'] },
)

async function runFetchPublicEventsAdmin(
  input: FetchPublicEventsInput,
): Promise<FetchPublicEventsResult> {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE
  const offset = (page - 1) * pageSize
  const filters = input.filters ?? {}
  const now = new Date()

  const supabase = createAdminClient()

  let query = supabase
    .from('events')
    .select(BASE_SELECT, { count: 'exact' })
    .eq('status', 'published')
    .eq('visibility', 'public')
    .range(
      sortsInMemory(filters.sort) ? 0 : offset,
      sortsInMemory(filters.sort) ? MAX_SORT_ROWS - 1 : offset + pageSize - 1,
    )

  if (filters.sort === 'date_asc' || !filters.sort || filters.sort === 'relevance') {
    query = query.order('start_date', { ascending: true })
  } else if (filters.sort === 'price_asc') {
    query = query.order('start_date', { ascending: true })
  } else if (filters.sort === 'popularity') {
    query = query.order('start_date', { ascending: true })
  }

  // TAB SCOPING (origin/main) THEN THE OPS RESOLVER (this branch).
  //
  // MERGE NOTE, resolution 9 of the nine in
  // docs/roast/HANDOVER-public-composer-2026-08-09.md section 2: the same
  // composition as the public path above, on the cached admin path. The two
  // paths must stay identical in what they filter, or the cached page and the
  // live page answer the same URL differently.
  const tab = resolveSearchTab(filters.tab, filters.q)
  const effective = { ...filters, ...tab.overrides }

  // The free text is consumed by the organiser lookup and withheld from the
  // resolver, so it cannot also run as a title match. See the public path.
  if (effective.q && tab.keepFreeText && tab.organisersOnly) {
    const orgIds = await resolveOrganisationIdsByToken(supabase, effective.q)
    const ids = [...new Set([...orgIds.values()].flat())]
    query = query.in('organisation_id', ids.length > 0 ? ids : [NO_MATCH])
  }

  const forResolver = tab.organisersOnly
    ? { ...effective, q: undefined }
    : tab.keepFreeText
      ? effective
      : { ...effective, q: undefined }

  query = applyOps(query, await resolveEventFilterOps(supabase as unknown as LookupClient, forResolver))
  if (filters.preset === 'free') query = query.eq('is_free', true)

  const window = presetWindow(filters.preset, now)
  if (window) {
    query = query.gte('start_date', window.from)
    if (window.to) query = query.lte('start_date', window.to)
  } else {
    query = query.gte('start_date', now.toISOString())
  }

  if (filters.from) query = query.gte('start_date', filters.from)
  if (filters.to) query = query.lte('start_date', filters.to)

  const { data, count, error } = await query
  if (error) {
    console.error('[fetchPublicEventsCached] query failed:', error)
    return { events: [], total: 0, page, pageSize, totalPages: 0 }
  }

  const raw = (data ?? []) as unknown as RawRow[]
  let events = raw.map(toPublicEventRow).filter(e => hasRealCover(e.cover_image_url))

  const priceFiltered =
    typeof filters.price_min === 'number' || typeof filters.price_max === 'number'
  if (priceFiltered) {
    const minCents = (filters.price_min ?? 0) * 100
    const maxCents =
      filters.price_max === undefined ? Number.POSITIVE_INFINITY : filters.price_max * 100
    events = events.filter(e => {
      if (e.ticket_tiers.length === 0) return minCents === 0
      const cheap = Math.min(...e.ticket_tiers.map(t => t.price))
      return cheap >= minCents && cheap <= maxCents
    })
  }

  const sortedWhole = sortsInMemory(filters.sort)
  // Captured BEFORE the sort slices a page out, so pagination still reflects
  // how many events actually matched rather than how many are on this page.
  const matchedBeforeSlice = events.length
  if (sortedWhole) events = applyInMemorySort(events, filters.sort, page, pageSize)

  const total = sortedWhole
    ? (priceFiltered ? matchedBeforeSlice : count ?? matchedBeforeSlice)
    : priceFiltered
      ? events.length
      : count ?? events.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return { events, total, page, pageSize, totalPages }
}

/**
 * Popular-this-week: events with the most orders confirmed in the last 7
 * days. Falls back to upcoming-by-date if the DB hasn't accrued enough order
 * signal yet. When `city` is supplied the result is narrowed to events in
 * that city (ilike match so "Melbourne" matches "Melbourne, VIC").
 */
export async function fetchPopularThisWeek(
  limit: number = 12,
  city?: string,
): Promise<PublicEventRow[]> {
  const supabase = await createClient()
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  const { data: popular, error: popularError } = await supabase
    .from('orders')
    .select('event_id')
    .gte('created_at', weekAgo.toISOString())
    .eq('status', 'confirmed')

  if (popularError) {
    console.error('[fetchPopularThisWeek] order scan failed:', popularError)
  }

  const counts = new Map<string, number>()
  for (const row of (popular ?? []) as { event_id: string }[]) {
    counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1)
  }

  const sortedIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)

  if (sortedIds.length === 0) {
    const { events } = await fetchPublicEvents({
      page: 1,
      pageSize: limit,
      filters: city ? { city } : undefined,
    })
    return events
  }

  const now = new Date().toISOString()
  let query = supabase
    .from('events')
    .select(BASE_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', now)
    .in('id', sortedIds)
  if (city) query = query.ilike('venue_city', `%${city}%`)

  const { data, error } = await query

  if (error) {
    console.error('[fetchPopularThisWeek] event hydrate failed:', error)
    return []
  }

  const raw = (data ?? []) as unknown as RawRow[]
  const byId = new Map(raw.map(r => [r.id, r]))
  return sortedIds
    .map(id => byId.get(id))
    .filter((r): r is RawRow => Boolean(r))
    .map(toPublicEventRow)
    .filter(e => hasRealCover(e.cover_image_url))
}

/**
 * ISR-friendly variant of fetchPopularThisWeek. Uses the public anon client
 * (no cookies()) and wraps in unstable_cache so /events shell can render
 * the rail synchronously without forcing dynamic SSR. Bucketed by hour.
 * The first card in the rail is the LCP candidate on /events; rendering it
 * in the shell instead of inside Suspense lets Lighthouse discover the
 * priority preload during HTML parse rather than after Suspense resolves.
 */
export async function fetchPopularThisWeekPublic(
  limit: number = 12,
  city?: string,
): Promise<PublicEventRow[]> {
  const bucket = Math.floor(Date.now() / (60 * 60 * 1000))
  const keyParts = [
    'popular-this-week-public-v1',
    `bucket:${bucket}`,
    `limit:${limit}`,
    `city:${city ?? ''}`,
  ]
  return unstable_cache(
    async () => {
      const supabase = createPublicClient()
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)

      const { data: popular } = await supabase
        .from('orders')
        .select('event_id')
        .gte('created_at', weekAgo.toISOString())
        .eq('status', 'confirmed')

      const counts = new Map<string, number>()
      for (const row of (popular ?? []) as { event_id: string }[]) {
        counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1)
      }

      const sortedIds = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id)

      const now = new Date().toISOString()
      let query = supabase
        .from('events')
        .select(BASE_SELECT)
        .eq('status', 'published')
        .eq('visibility', 'public')
        .gte('start_date', now)
        .order('start_date', { ascending: true })
        .limit(limit)
      if (sortedIds.length > 0) query = query.in('id', sortedIds)
      if (city) query = query.ilike('venue_city', `%${city}%`)

      const { data, error } = await query
      if (error) {
        console.error('[fetchPopularThisWeekPublic] query failed:', error)
        return []
      }

      const raw = (data ?? []) as unknown as RawRow[]
      if (sortedIds.length > 0) {
        const byId = new Map(raw.map(r => [r.id, r]))
        return sortedIds
          .map(id => byId.get(id))
          .filter((r): r is RawRow => Boolean(r))
          .map(toPublicEventRow)
          .filter(e => hasRealCover(e.cover_image_url))
      }
      return raw.map(toPublicEventRow).filter(e => hasRealCover(e.cover_image_url))
    },
    keyParts,
    { revalidate: 60 * 30, tags: ['events:popular-public'] },
  )()
}

/**
 * Recommended-for-you: union of events from organisers the user has saved,
 * categories the user has saved, and events in the user's preferred city.
 * Deduplicated by event id. Falls back to fetchPopularThisWeek when there
 * are no personalisation signals (anonymous user or empty profile).
 */
export async function fetchRecommendedEvents(
  userId: string | null,
  limit: number = 12,
  city?: string,
): Promise<PublicEventRow[]> {
  if (!userId) return fetchPopularThisWeek(limit, city)

  const supabase = await createClient()

  const [savedOrgsRes, savedCatsRes, profileRes] = await Promise.all([
    supabase.from('saved_organisers').select('organisation_id').eq('user_id', userId),
    supabase.from('saved_categories').select('category_id').eq('user_id', userId),
    supabase.from('profiles').select('preferred_city').eq('id', userId).maybeSingle(),
  ])

  const orgIds = (savedOrgsRes.data ?? []).map(r => r.organisation_id as string)
  const catIds = (savedCatsRes.data ?? []).map(r => r.category_id as string)
  const preferredCity =
    profileRes.data?.preferred_city && typeof profileRes.data.preferred_city === 'object'
      ? (profileRes.data.preferred_city as { city?: string }).city ?? null
      : null

  if (orgIds.length === 0 && catIds.length === 0 && !preferredCity) {
    return fetchPopularThisWeek(limit, city)
  }

  const now = new Date().toISOString()
  const orFilters: string[] = []
  if (orgIds.length > 0) orFilters.push(`organisation_id.in.(${orgIds.join(',')})`)
  if (catIds.length > 0) orFilters.push(`category_id.in.(${catIds.join(',')})`)
  if (preferredCity) orFilters.push(`venue_city.ilike.%${preferredCity}%`)

  let query = supabase
    .from('events')
    .select(BASE_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', now)
    .order('start_date', { ascending: true })
    .limit(limit)

  if (orFilters.length > 0) query = query.or(orFilters.join(','))
  // Route-level city constraint wins over preferred_city - when the user
  // lands on /events/browse/{slug} the rail must not bleed events from
  // other cities into a city-scoped page.
  if (city) query = query.ilike('venue_city', `%${city}%`)

  const { data, error } = await query
  if (error) {
    console.error('[fetchRecommendedEvents] query failed:', error)
    return fetchPopularThisWeek(limit, city)
  }

  const raw = (data ?? []) as unknown as RawRow[]
  const events = raw
    .map(toPublicEventRow)
    .filter(e => hasRealCover(e.cover_image_url))
  if (events.length === 0) return fetchPopularThisWeek(limit, city)
  return events
}

/**
 * Resolve the user's full demand-graph signals from the existing tables.
 * No migration: reads saved_organisers, saved_categories, follows
 * (artist + subgenre), saved_events (their categories), and
 * profiles.preferred_city. Used by the personalised /feed.
 */
async function resolveAffinitySignals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<AffinitySignals> {
  const [savedOrgsRes, savedCatsRes, followsRes, savedEventsRes, profileRes] =
    await Promise.all([
      supabase.from('saved_organisers').select('organisation_id').eq('user_id', userId),
      supabase.from('saved_categories').select('category_id').eq('user_id', userId),
      supabase
        .from('follows')
        .select('followable_type, followable_id')
        .eq('user_id', userId),
      supabase.from('saved_events').select('event_id').eq('user_id', userId),
      supabase.from('profiles').select('preferred_city').eq('id', userId).maybeSingle(),
    ])

  const followedOrganisationIds = new Set(
    (savedOrgsRes.data ?? []).map(r => r.organisation_id as string),
  )
  const savedCategoryIds = new Set(
    (savedCatsRes.data ?? []).map(r => r.category_id as string),
  )

  const followRows = (followsRes.data ?? []) as {
    followable_type: string
    followable_id: string
  }[]
  const followedArtistIds = followRows
    .filter(r => r.followable_type === 'artist')
    .map(r => r.followable_id)
  const followedSceneSlugs = new Set(
    followRows
      .filter(r => r.followable_type === 'subgenre')
      .map(r => r.followable_id.toLowerCase()),
  )

  // Followed artists -> the upcoming events those artists play, via event_artists.
  let followedArtistEventIds = new Set<string>()
  if (followedArtistIds.length > 0) {
    const { data: ea } = await supabase
      .from('event_artists')
      .select('event_id')
      .in('artist_id', followedArtistIds)
    followedArtistEventIds = new Set((ea ?? []).map(r => r.event_id as string))
  }

  // Categories of the user's saved events - a soft "similar to what you saved"
  // signal. One extra round trip, only when the user has saved events.
  let savedEventCategoryIds = new Set<string>()
  const savedEventIds = (savedEventsRes.data ?? []).map(r => r.event_id as string)
  if (savedEventIds.length > 0) {
    const { data: catRows } = await supabase
      .from('events')
      .select('category_id')
      .in('id', savedEventIds)
    savedEventCategoryIds = new Set(
      (catRows ?? [])
        .map(r => r.category_id as string | null)
        .filter((c): c is string => Boolean(c)),
    )
  }

  const preferredCity =
    profileRes.data?.preferred_city && typeof profileRes.data.preferred_city === 'object'
      ? (profileRes.data.preferred_city as { city?: string }).city ?? null
      : null

  return {
    followedOrganisationIds,
    savedCategoryIds,
    followedArtistEventIds,
    followedSceneSlugs,
    savedEventCategoryIds,
    preferredCity,
  }
}

/**
 * The personalised "For You" feed (demand engine 2). Resolves the user's full
 * demand graph, fetches a candidate pool of upcoming public events that touch
 * any of their signals, and ranks them with the PURE rankEventsByAffinity so
 * direct follows outrank softer taste signals.
 *
 * Returns `null` follow-state separately: when the graph carries no signal at
 * all, this returns an empty list and the page renders the designed
 * follow-prompt empty state (it does NOT silently fall back to popular here -
 * the feed is explicitly about the people and scenes the user follows).
 */
export async function fetchForYouFeed(
  userId: string,
  limit: number = 24,
): Promise<{ events: PublicEventRow[]; hasGraph: boolean }> {
  const supabase = await createClient()
  const signals = await resolveAffinitySignals(supabase, userId)
  const hasGraph = hasAnyAffinitySignal(signals)
  if (!hasGraph) return { events: [], hasGraph: false }

  const now = new Date()
  const nowIso = now.toISOString()

  // Candidate pool: events that touch any direct signal. Scene-only follows
  // (subgenre) widen the pool via category slug match where a scene maps to a
  // category, and otherwise still count toward hasGraph so the user sees their
  // followed organisers / categories / artists / city events ranked.
  const orFilters: string[] = []
  if (signals.followedOrganisationIds.size > 0) {
    orFilters.push(`organisation_id.in.(${[...signals.followedOrganisationIds].join(',')})`)
  }
  const catPool = new Set<string>([
    ...signals.savedCategoryIds,
    ...signals.savedEventCategoryIds,
  ])
  if (catPool.size > 0) {
    orFilters.push(`category_id.in.(${[...catPool].join(',')})`)
  }
  if (signals.followedArtistEventIds.size > 0) {
    orFilters.push(`id.in.(${[...signals.followedArtistEventIds].join(',')})`)
  }
  if (signals.preferredCity) {
    orFilters.push(`venue_city.ilike.%${signals.preferredCity}%`)
  }

  // No structural pool (e.g. only scene follows with no mapped category): show
  // the designed empty state rather than an unranked dump. hasGraph stays true
  // so the page copy can still acknowledge the follows.
  if (orFilters.length === 0) return { events: [], hasGraph: true }

  // Over-fetch so the pure ranker has room to order before we slice to `limit`.
  const poolSize = Math.min(120, limit * 4)
  const { data, error } = await supabase
    .from('events')
    .select(BASE_SELECT)
    .eq('status', 'published')
    .eq('visibility', 'public')
    .gte('start_date', nowIso)
    .or(orFilters.join(','))
    .order('start_date', { ascending: true })
    .limit(poolSize)

  if (error) {
    console.error('[fetchForYouFeed] query failed:', error)
    return { events: [], hasGraph: true }
  }

  const raw = (data ?? []) as unknown as RawRow[]
  const candidates = raw
    .map(toPublicEventRow)
    .filter(e => hasRealCover(e.cover_image_url))

  const ranked = rankEventsByAffinity(candidates, signals, now)
  return { events: ranked.slice(0, limit).map(r => r.event), hasGraph: true }
}
