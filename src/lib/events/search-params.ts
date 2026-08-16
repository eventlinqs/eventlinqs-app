import type { FetchPublicEventsFilters } from './types'
import {
  DATE_TO_PRESET,
  SORT_ALIASES,
  isEventType,
  isKnownFaith,
  isSearchTab,
  resolveMoment,
  type SearchTab,
} from './url-filters'

/**
 * Shape of the raw searchParams object that Next.js awaits in /events.
 * Everything is optional + string - parsing happens here so the page and
 * its children never touch raw URL state.
 *
 * EVERY KEY HERE IS EMITTED IN A REAL HREF SOMEWHERE IN src/. That is the
 * standard: a parameter that appears in a link a user can click and is not
 * parsed here is a silent break, because the page renders perfectly and simply
 * answers a different question than the one asked. `reach-integrity`'s
 * `url-filters-parsed` check scans the source for emitted parameters and fails
 * on any that this type does not carry, so the two can never drift again.
 */
export type EventsSearchParams = {
  q?: string
  preset?: string
  category?: string
  community?: string
  sub_community?: string
  country?: string
  price_min?: string
  price_max?: string
  from?: string
  to?: string
  distance_km?: string
  sort?: string
  view?: string
  page?: string
  /*
   * MERGE NOTE, resolution 3 of the nine in
   * docs/roast/HANDOVER-public-composer-2026-08-09.md section 2. main listed
   * city, date, suburb, event_type, venue and tab here. Every one of those is
   * already below, and this side also parses free=1, price=free, focus and
   * error, so this is a strict superset and main's list adds nothing. main's
   * reason for adding them is worth keeping though: each appears in an href a
   * visitor can click, and an unparsed one lands on the unfiltered national
   * list while looking like a filter.
   */
  /** City slug, from every city and community-by-city "View all". */
  city?: string
  /** Preset alias: today, tonight, tomorrow, weekend, week, 7d, month, free. */
  date?: string
  /** City-facing suburb slug, from the suburb landing "Open in browse view". */
  suburb?: string
  /** One of the eight city-page format tiles. */
  event_type?: string
  /** Venue handle or venue name. */
  venue?: string
  /** Organisation slug, from the organiser profile "View all". */
  organiser?: string
  /** Faith slug, from the faith landing "View all". */
  faith?: string
  /** Community-moment slug, from the homepage moments bento. */
  moment?: string
  /** Header-search scope: events, communities, cities, organisers. */
  tab?: string
  /** `free=1`, from the header-search "Free events" shortcut. */
  free?: string
  /** `price=free`, from the category highlight slides. */
  price?: string
  /** `focus=1`, the mobile Search nav asking for the search field to open. */
  focus?: string
  /**
   * Why checkout bounced the buyer back here. Emitted by
   * /checkout/[reservation_id] as `reservation_not_found` or
   * `reservation_expired`.
   */
  error?: string
}

const PRESETS = new Set([
  'all',
  'today',
  'tomorrow',
  'weekend',
  '7d',
  'month',
  'free',
])

const SORTS = new Set(['relevance', 'date_asc', 'price_asc', 'popularity'])
const VIEWS = new Set(['grid', 'map'])
const TABS = new Set(['events', 'cities', 'communities', 'organisers'])

/**
 * `date` is the city page's name for the same window `preset` selects. The
 * chips emit today, weekend, 7d and `week`; `week` is the only one that is not
 * already a preset value, so it is mapped rather than dropped.
 */
// MERGE NOTE, resolution 6 of the nine in
// docs/roast/HANDOVER-public-composer-2026-08-09.md section 2. main's LOCAL
// copy of DATE_TO_PRESET stood here and is removed. It is imported from
// ./url-filters at the top of this file, which is its canonical home after this
// line of work's refactor, and two definitions of one alias table is how the
// city chips and the browse view start disagreeing about what `week` means.
// Auto-merge kept both, which would not have compiled.

/**
 * Category slugs that were RENAMED in the database and must keep resolving from
 * their old spelling, because the old spelling is in the wild.
 *
 * WHY THIS EXISTS. Migration 20260812002_category_taxonomy_repair renames
 * `arts-culture` to `arts-community` (the banned word leaves the data, and the
 * slug the homepage already asks for starts existing). Events move with it by
 * UUID, so no event changes category. But `?category=arts-culture` is a URL a
 * real person can be holding: the browse filter chips are rendered from the
 * database, so anyone who filtered by that category has it in their address bar,
 * their history, a bookmark, a message they sent, or Google's index.
 *
 * Without this map that URL does not 404, which would at least be honest. It
 * returns HTTP 200 with ZERO events, because the fetcher looks the slug up,
 * finds no row, and forces `NO_MATCH` (fetchers.ts, resolveEventFilterOps). A
 * control that looks like it works and returns nothing is the exact failure the
 * suburb ruling rejected, and a dead shared link is worse than the banned word
 * the rename removes.
 *
 * Founder ruling 2026-08-12: ship the rename WITH the alias, in one change.
 *
 * This is an alias, not a redirect: the URL keeps its old spelling in the bar
 * and the results are correct. A 301 would be the tidier web answer for a PATH,
 * and that is how /cultures and /culture/[slug] are handled in next.config.ts.
 * It cannot be used here because this is a QUERY PARAMETER on a shared route,
 * and rewriting one parameter of /events would mean owning the whole query
 * string in middleware for one legacy value.
 *
 * An entry here is permanent. Removing one silently breaks every link that
 * still carries it.
 */
const CATEGORY_SLUG_ALIASES: Record<string, string> = {
  'arts-culture': 'arts-community',
}

/** The live slug for a category, following a rename if the URL predates it. */
export function resolveCategorySlug(raw: string | undefined): string | undefined {
  const slug = raw?.trim().toLowerCase()
  if (!slug) return undefined
  return CATEGORY_SLUG_ALIASES[slug] ?? slug
}

export type EventsView = 'grid' | 'map'

export type ParsedEventsParams = {
  filters: FetchPublicEventsFilters
  page: number
  view: EventsView
  /** Search scope from the header overlay. Not a filter on events. */
  tab: SearchTab
  /** The mobile Search nav asks the browse surface to open its search field. */
  focusSearch: boolean
  /** The message to show a buyer checkout bounced back here, or null. */
  notice: EventsNotice | null
}

export type EventsNotice = { heading: string; body: string }

/**
 * Checkout redirects a buyer to /events when their reservation has gone, and
 * /events read nothing from the URL, so the seats they were holding vanished
 * with no explanation on a generic browse page. The buyer's own reading of that
 * is that the platform lost their order.
 *
 * Both messages say the same three things in the same order, because that is
 * what the person needs and in what priority: what happened, that they have not
 * been charged, and what to do next.
 */
const NOTICES: Record<string, EventsNotice> = {
  reservation_expired: {
    heading: 'Your seat hold expired',
    body: 'Seats are only held for a short window so nobody is locked out while a checkout sits open. Yours have gone back on sale and you have not been charged. Pick them again below and you will be straight through.',
  },
  reservation_not_found: {
    heading: 'That reservation is no longer available',
    body: 'We could not find the seats you were holding, so nothing has been charged. Choose your tickets again below.',
  },
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 1) return fallback
  return n
}

function parseNonNegativeFloat(value: string | undefined): number | undefined {
  if (value === undefined || value === '') return undefined
  const n = Number.parseFloat(value)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

function isIsoish(value: string | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : value
}

/** True for the affirmative spellings a link might use for a boolean flag. */
function isTruthyFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes'
}

export function parseEventsSearchParams(
  raw: EventsSearchParams,
): ParsedEventsParams {
  // MERGE NOTE, resolution 4 of the nine in
  // docs/roast/HANDOVER-public-composer-2026-08-09.md section 2. main resolved
  // preset-versus-date the same way and stopped there. This is that behaviour
  // plus the two other spellings of the free-events intent, and it trims and
  // lowercases the alias before the lookup, so it is a strict superset.
  //
  // `preset` is the canonical parameter. `date` is its alias (the homepage,
  // the header overlay and both city landings emit `date`), and `free=1` and
  // `price=free` are two more spellings of the same free-events intent. An
  // explicit `preset` always wins so nothing already working changes meaning.
  const aliasPreset = raw.date ? DATE_TO_PRESET[raw.date.trim().toLowerCase()] : undefined
  const freeIntent = isTruthyFlag(raw.free) || raw.price?.trim().toLowerCase() === 'free'
  const presetCandidate =
    (raw.preset && PRESETS.has(raw.preset) ? raw.preset : undefined) ??
    aliasPreset ??
    (freeIntent ? 'free' : undefined)
  const preset =
    presetCandidate && PRESETS.has(presetCandidate)
      ? (presetCandidate as FetchPublicEventsFilters['preset'])
      : undefined

  // `sort=trending` is emitted by the category highlight slides and is not one
  // of the four sorts, so it resolved to no sort at all.
  const rawSort = raw.sort?.trim().toLowerCase()
  const sortCandidate = rawSort ? (SORT_ALIASES[rawSort] ?? rawSort) : undefined
  const sort =
    sortCandidate && SORTS.has(sortCandidate)
      ? (sortCandidate as FetchPublicEventsFilters['sort'])
      : undefined

  const view: EventsView = raw.view && VIEWS.has(raw.view) ? (raw.view as EventsView) : 'grid'

  // A moment carries a heritage and a date window. An explicit community or an
  // explicit from/to always wins over the one the moment implies.
  const moment = raw.moment ? resolveMoment(raw.moment) : null

  const eventType = raw.event_type?.trim().toLowerCase()
  const faith = raw.faith?.trim().toLowerCase()
  const category = resolveCategorySlug(raw.category)

  const filters: FetchPublicEventsFilters = {
    q: raw.q?.trim() || undefined,
    preset,
    category,
    community: raw.community?.trim() || moment?.community || undefined,
    sub_community: raw.sub_community?.trim() || undefined,
    country: raw.country?.trim() || undefined,
    price_min: parseNonNegativeFloat(raw.price_min),
    price_max: parseNonNegativeFloat(raw.price_max),
    from: isIsoish(raw.from) ?? moment?.from,
    to: isIsoish(raw.to) ?? moment?.to,
    distance_km: parseNonNegativeFloat(raw.distance_km),
    sort,
    // MERGE NOTE, resolution 5 of the nine in
    // docs/roast/HANDOVER-public-composer-2026-08-09.md section 2, and it is
    // the SUBURB DECISION. Founder ruling, 9 August 2026, restated 12 August:
    // keep the precise behaviour.
    //
    // main wrote `city: raw.suburb?.trim() || raw.city?.trim()`, collapsing
    // suburb INTO city so ?city=sydney&suburb=newtown became an ilike on
    // venue_city for "Newtown". Most Sydney events store venue_city as
    // "Sydney", so that renders as a working filter and returns almost nothing.
    // A control that looks like it works and returns nothing is worse than no
    // control. So suburb stays its OWN filter, resolved through resolveSuburb
    // to a district and then to the ids of the events inside it.
    //
    // Everything of main's that was not the collapse is kept: its `tab` line is
    // below verbatim. Its venue and event_type lines are dropped only because
    // the versions here already do the same job with validation.
    city: raw.city?.trim() || undefined,
    suburb: raw.suburb?.trim() || undefined,
    // An unknown event_type or faith is dropped rather than passed through:
    // a value with no mapping would otherwise narrow to nothing and read to
    // the user as "this city has no comedy" instead of "that is not a type".
    event_type: eventType && isEventType(eventType) ? eventType : undefined,
    venue: raw.venue?.trim() || undefined,
    organiser: raw.organiser?.trim() || undefined,
    faith: faith && isKnownFaith(faith) ? faith : undefined,
    moment: moment ? raw.moment?.trim() : undefined,
    // MERGE NOTE: main collapsed suburb into city as a text match. This branch
    // keeps suburb as its own filter, resolved to a district centroid and
    // applied as a radius, which is what /city/[slug]/[suburb] needs. The tab
    // scope below is main's and is additive, so both survive.
    tab: raw.tab && TABS.has(raw.tab) ? (raw.tab as FetchPublicEventsFilters['tab']) : undefined,
  }

  const tab = raw.tab && isSearchTab(raw.tab) ? raw.tab : 'events'

  return {
    filters,
    page: parsePositiveInt(raw.page, 1),
    view,
    tab,
    focusSearch: isTruthyFlag(raw.focus),
    notice: (raw.error && NOTICES[raw.error.trim()]) || null,
  }
}

/**
 * Build a /events (or /events/browse/:city) URL preserving existing
 * params and applying overrides. Keys with value null/undefined are
 * removed; other values are coerced to string. `basePath` defaults to
 * /events so existing call sites keep their behaviour; the browse
 * route passes `/events/browse/{slug}` so filter/pagination URLs stay
 * under that city namespace.
 */
/**
 * Does the current filter state represent a default/unfiltered view?
 * Used to gate the Recommended rail - a personalised/popular rail is
 * noise when the user has narrowed the catalogue to something specific.
 * `country` and `sort` are excluded because `country` is auto-defaulted
 * to the visitor's detected location (not a user-initiated filter) and
 * `sort` reorders without narrowing.
 */
export function hasActiveFilters(filters: FetchPublicEventsFilters): boolean {
  return Boolean(
    filters.q ||
      filters.preset ||
      filters.category ||
      filters.community ||
      filters.sub_community ||
      filters.price_min !== undefined ||
      filters.price_max !== undefined ||
      filters.from ||
      filters.to ||
      (filters.distance_km !== undefined && filters.distance_km > 0) ||
      // Every narrowing parameter has to be listed here, not just the ones the
      // filter bar renders. A filter missing from this predicate is treated as
      // the unfiltered default case, which routes the request to the CACHED
      // fetch path and serves the whole national catalogue from a snapshot
      // taken with no filters at all.
      filters.city ||
      filters.suburb ||
      filters.event_type ||
      filters.venue ||
      filters.organiser ||
      filters.faith ||
      // main listed city, venue, event_type and distance_km here. All four are
      // already in this predicate, alongside suburb, organiser, faith and
      // moment, so this side is a strict superset.
      filters.moment,
  )
}

export function buildEventsUrl(
  base: EventsSearchParams,
  overrides: Partial<Record<keyof EventsSearchParams, string | number | null | undefined>>,
  basePath: string = '/events',
): string {
  const merged: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) {
    if (v !== undefined && v !== '') merged[k] = String(v)
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === undefined || v === '') {
      delete merged[k]
    } else {
      merged[k] = String(v)
    }
  }
  const qs = new URLSearchParams(merged).toString()
  return qs ? `${basePath}?${qs}` : basePath
}
