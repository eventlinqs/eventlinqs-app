import type { FetchPublicEventsFilters } from './types'

/**
 * Shape of the raw searchParams object that Next.js awaits in /events.
 * Everything is optional + string — parsing happens here so the page and
 * its children never touch raw URL state.
 */
export type EventsSearchParams = {
  q?: string
  preset?: string
  category?: string
  country?: string
  price_min?: string
  price_max?: string
  from?: string
  to?: string
  distance_km?: string
  sort?: string
  view?: string
  page?: string
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
  const preset =
    raw.preset && PRESETS.has(raw.preset)
      ? (raw.preset as FetchPublicEventsFilters['preset'])
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
    country: raw.country?.trim() || undefined,
    price_min: parseNonNegativeFloat(raw.price_min),
    price_max: parseNonNegativeFloat(raw.price_max),
    from: isIsoish(raw.from),
    to: isIsoish(raw.to),
    distance_km: parseNonNegativeFloat(raw.distance_km),
    sort,
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
