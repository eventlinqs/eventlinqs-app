import type { FetchPublicEventsFilters } from './types'

/**
 * Shape of the raw searchParams object that Next.js awaits in /events.
 * Everything is optional + string - parsing happens here so the page and
 * its children never touch raw URL state.
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
  /**
   * The six below all appear in hrefs a visitor can click and none of them
   * was parsed, so every one of those links quietly landed on the unfiltered
   * national list while looking like a filter. Emitted by:
   *   city, date      - the city landing hero, This Week and This Weekend rails
   *   suburb          - the suburb landing
   *   event_type      - the city event-type rail
   *   venue           - the "everything at this venue" link on a venue profile
   *   tab             - the four header search tabs
   */
  city?: string
  date?: string
  suburb?: string
  event_type?: string
  venue?: string
  tab?: string
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
const DATE_TO_PRESET: Record<string, string> = {
  today: 'today',
  tomorrow: 'tomorrow',
  weekend: 'weekend',
  week: '7d',
  '7d': '7d',
  month: 'month',
}

export type EventsView = 'grid' | 'map'

export type ParsedEventsParams = {
  filters: FetchPublicEventsFilters
  page: number
  view: EventsView
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

export function parseEventsSearchParams(
  raw: EventsSearchParams,
): ParsedEventsParams {
  // `preset` wins when both are present; `date` is the city page's alias for
  // the same window and was previously discarded.
  const presetFromDate =
    raw.date && DATE_TO_PRESET[raw.date] ? DATE_TO_PRESET[raw.date] : undefined
  const presetRaw =
    raw.preset && PRESETS.has(raw.preset) ? raw.preset : presetFromDate
  const preset = presetRaw
    ? (presetRaw as FetchPublicEventsFilters['preset'])
    : undefined

  const sort =
    raw.sort && SORTS.has(raw.sort)
      ? (raw.sort as FetchPublicEventsFilters['sort'])
      : undefined

  const view: EventsView = raw.view && VIEWS.has(raw.view) ? (raw.view as EventsView) : 'grid'

  const filters: FetchPublicEventsFilters = {
    q: raw.q?.trim() || undefined,
    preset,
    category: raw.category?.trim() || undefined,
    community: raw.community?.trim() || undefined,
    sub_community: raw.sub_community?.trim() || undefined,
    country: raw.country?.trim() || undefined,
    price_min: parseNonNegativeFloat(raw.price_min),
    price_max: parseNonNegativeFloat(raw.price_max),
    from: isIsoish(raw.from),
    to: isIsoish(raw.to),
    distance_km: parseNonNegativeFloat(raw.distance_km),
    sort,
    // A suburb link carries both city and suburb. The suburb is the more
    // specific place name and `venue_city` on a real listing often carries it,
    // so it takes precedence and the city stays as the fallback.
    city: raw.suburb?.trim() || raw.city?.trim() || undefined,
    venue: raw.venue?.trim() || undefined,
    event_type: raw.event_type?.trim() || undefined,
    tab: raw.tab && TABS.has(raw.tab) ? (raw.tab as FetchPublicEventsFilters['tab']) : undefined,
  }

  return {
    filters,
    page: parsePositiveInt(raw.page, 1),
    view,
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
      filters.city ||
      filters.venue ||
      filters.event_type ||
      (filters.distance_km !== undefined && filters.distance_km > 0),
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
