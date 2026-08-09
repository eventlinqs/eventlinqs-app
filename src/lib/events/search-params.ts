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

  const filters: FetchPublicEventsFilters = {
    q: raw.q?.trim() || undefined,
    preset,
    category: raw.category?.trim() || undefined,
    community: raw.community?.trim() || moment?.community || undefined,
    sub_community: raw.sub_community?.trim() || undefined,
    country: raw.country?.trim() || undefined,
    price_min: parseNonNegativeFloat(raw.price_min),
    price_max: parseNonNegativeFloat(raw.price_max),
    from: isIsoish(raw.from) ?? moment?.from,
    to: isIsoish(raw.to) ?? moment?.to,
    distance_km: parseNonNegativeFloat(raw.distance_km),
    sort,
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
    // MERGE NOTE: origin/main collapsed suburb into city as a text match. This
    // branch keeps suburb as its own filter, resolved to a district centroid
    // and applied as a radius, which is what /city/[slug]/[suburb] needs. The
    // tab scope below is main's and is additive, so both survive.
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
