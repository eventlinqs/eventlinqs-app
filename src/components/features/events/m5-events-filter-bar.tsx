'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SlidersHorizontal, LayoutGrid, Map as MapIcon } from 'lucide-react'
import {
  buildEventsUrl,
  type EventsSearchParams,
  type EventsView,
} from '@/lib/events/search-params'
import { FilterSheet } from './m5-filter-sheet'
import { MoreFiltersPanel, type MoreFiltersValues } from './m5-more-filters-panel'
import { trackEventSearch } from '@/lib/analytics/plausible'

type CategoryChip = { id: string; name: string; slug: string }

type DatePreset = { key: 'today' | 'tomorrow' | 'weekend' | '7d' | 'month' | 'free'; label: string }

const DATE_PRESETS: DatePreset[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'weekend', label: 'This weekend' },
  { key: '7d', label: 'Next 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'free', label: 'Free' },
]

const MORE_FILTER_KEYS: (keyof EventsSearchParams)[] = [
  'price_min',
  'price_max',
  'from',
  'to',
  'distance_km',
  'sort',
]

type Props = {
  params: EventsSearchParams
  categories: CategoryChip[]
  view: EventsView
  hasGeoSignal: boolean
  /** /events or /events/browse/{slug} - drives URL building for chips + pagination. */
  basePath?: string
}

export function EventsFilterBar({ params, categories, view, hasGeoSignal, basePath = '/events' }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [sheetOpen, setSheetOpen] = useState(false)

  const activePreset = params.preset ?? null
  const activeCategory = params.category ?? null

  const moreFiltersActiveCount = MORE_FILTER_KEYS.reduce(
    (n, k) => (params[k] !== undefined && params[k] !== '' ? n + 1 : n),
    0,
  )

  const navigate = useCallback(
    (url: string) => {
      startTransition(() => router.push(url, { scroll: false }))
    },
    [router],
  )

  const handlePresetClick = useCallback(
    (key: DatePreset['key']) => {
      const isActive = activePreset === key
      const nextPreset = isActive ? undefined : key
      if (nextPreset) {
        trackEventSearch({
          date_preset: nextPreset,
          category: params.category,
          query: params.q,
        })
      }
      navigate(buildEventsUrl(params, { preset: nextPreset, page: undefined }, basePath))
    },
    [activePreset, params, navigate, basePath],
  )

  const handleCategoryClick = useCallback(
    (slug: string | null) => {
      const nextSlug = slug && activeCategory !== slug ? slug : undefined
      if (nextSlug) {
        trackEventSearch({
          category: nextSlug,
          date_preset: params.preset,
          query: params.q,
        })
      }
      navigate(buildEventsUrl(params, { category: nextSlug, page: undefined }, basePath))
    },
    [activeCategory, params, navigate, basePath],
  )

  const handleViewChange = useCallback(
    (next: EventsView) => {
      navigate(buildEventsUrl(params, { view: next === 'grid' ? undefined : next }, basePath))
    },
    [params, navigate, basePath],
  )

  const handleApplyMoreFilters = useCallback(
    (values: MoreFiltersValues) => {
      navigate(
        buildEventsUrl(params, {
          price_min: values.price_min ?? undefined,
          price_max: values.price_max ?? undefined,
          from: values.from ?? undefined,
          to: values.to ?? undefined,
          distance_km: values.distance_km ?? undefined,
          sort: values.sort ?? undefined,
          page: undefined,
        }, basePath),
      )
      setSheetOpen(false)
    },
    [params, navigate, basePath],
  )

  const handleClearAll = useCallback(() => {
    navigate(basePath)
    setSheetOpen(false)
  }, [navigate, basePath])

  return (
    <div
      className="sticky z-40 border-b border-ink-100 bg-white/95 backdrop-blur-sm"
      style={{ top: 'var(--header-height)' }}
      aria-busy={isPending || undefined}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Row 1 - date preset chips + view toggle + more-filters */}
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap gap-2" role="group" aria-label="Date filters">
            {DATE_PRESETS.map(p => {
              const isActive = activePreset === p.key
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePresetClick(p.key)}
                  aria-pressed={isActive}
                  className={
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ' +
                    (isActive
                      ? 'bg-ink-900 text-white'
                      : 'border border-ink-200 bg-white text-ink-700 hover:border-ink-400')
                  }
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div
              role="group"
              aria-label="View mode"
              className="hidden rounded-lg border border-ink-200 bg-white p-0.5 sm:inline-flex"
            >
              <button
                type="button"
                onClick={() => handleViewChange('grid')}
                aria-pressed={view === 'grid'}
                className={
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ' +
                  (view === 'grid' ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100')
                }
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                Grid
              </button>
              <button
                type="button"
                onClick={() => handleViewChange('map')}
                aria-pressed={view === 'map'}
                className={
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ' +
                  (view === 'map' ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100')
                }
              >
                <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Map
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              className={
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ' +
                (moreFiltersActiveCount > 0
                  ? 'border-gold-500 bg-gold-100 text-gold-600'
                  : 'border-ink-200 bg-white text-ink-700 hover:border-ink-400')
              }
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              More filters
              {moreFiltersActiveCount > 0 && (
                <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-ink-900">
                  {moreFiltersActiveCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Row 2 - category chips, horizontal scroll on mobile */}
        {categories.length > 0 && (
          <div
            role="group"
            aria-label="Category filters"
            className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          >
            <button
              type="button"
              onClick={() => handleCategoryClick(null)}
              aria-pressed={!activeCategory}
              className={
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ' +
                (!activeCategory
                  ? 'bg-gold-500 text-ink-900'
                  : 'border border-ink-200 bg-white text-ink-700 hover:border-ink-400')
              }
            >
              All categories
            </button>
            {categories.map(c => {
              const isActive = activeCategory === c.slug
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCategoryClick(c.slug)}
                  aria-pressed={isActive}
                  className={
                    'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 ' +
                    (isActive
                      ? 'bg-gold-500 text-ink-900'
                      : 'border border-ink-200 bg-white text-ink-700 hover:border-ink-400')
                  }
                >
                  {c.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="More filters"
        footer={
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs font-semibold text-ink-600 underline-offset-4 hover:text-ink-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              Clear all
            </button>
            <button
              type="submit"
              form="m5-more-filters-form"
              className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              Apply
            </button>
          </div>
        }
      >
        <MoreFiltersPanel
          initial={params}
          hasGeoSignal={hasGeoSignal}
          onApply={handleApplyMoreFilters}
        />
      </FilterSheet>
    </div>
  )
}
