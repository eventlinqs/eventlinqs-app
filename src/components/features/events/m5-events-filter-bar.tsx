import Link from 'next/link'
import { SlidersHorizontal, LayoutGrid, Map as MapIcon } from 'lucide-react'
import {
  buildEventsUrl,
  type EventsSearchParams,
  type EventsView,
} from '@/lib/events/search-params'

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

type Props = {
  params: EventsSearchParams
  categories: CategoryChip[]
  view: EventsView
}

/**
 * Sticky filter bar under the site header.
 * Row 1: date preset chips (wraps on mobile).
 * Row 2: category chips (horizontal scroll on mobile).
 * Right rail: grid/map view toggle + "More filters" button (placeholder).
 */
export function EventsFilterBar({ params, categories, view }: Props) {
  const activePreset = params.preset ?? null
  const activeCategory = params.category ?? null

  return (
    <div
      className="sticky z-40 border-b border-ink-100 bg-white/95 backdrop-blur-sm"
      style={{ top: 'var(--header-height)' }}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
        {/* Row 1 — date preset chips + view toggle + more-filters */}
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap gap-2" role="group" aria-label="Date filters">
            {DATE_PRESETS.map(p => {
              const isActive = activePreset === p.key
              const href = buildEventsUrl(params, {
                preset: isActive ? undefined : p.key,
                page: undefined,
              })
              return (
                <Link
                  key={p.key}
                  href={href}
                  aria-pressed={isActive}
                  className={
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors ' +
                    (isActive
                      ? 'bg-ink-900 text-white'
                      : 'border border-ink-200 bg-white text-ink-700 hover:border-ink-400')
                  }
                >
                  {p.label}
                </Link>
              )
            })}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div
              role="group"
              aria-label="View mode"
              className="hidden rounded-lg border border-ink-200 bg-white p-0.5 sm:inline-flex"
            >
              <Link
                href={buildEventsUrl(params, { view: view === 'grid' ? undefined : 'grid' })}
                aria-pressed={view === 'grid'}
                className={
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ' +
                  (view === 'grid' ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100')
                }
              >
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                Grid
              </Link>
              <Link
                href={buildEventsUrl(params, { view: 'map' })}
                aria-pressed={view === 'map'}
                className={
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ' +
                  (view === 'map' ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-100')
                }
              >
                <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Map
              </Link>
            </div>

            <button
              type="button"
              disabled
              title="More filters (coming in Step 3)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-ink-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              More filters
            </button>
          </div>
        </div>

        {/* Row 2 — category chips, horizontal scroll on mobile */}
        {categories.length > 0 && (
          <div
            role="group"
            aria-label="Category filters"
            className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          >
            <Link
              href={buildEventsUrl(params, { category: undefined, page: undefined })}
              aria-pressed={!activeCategory}
              className={
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ' +
                (!activeCategory
                  ? 'bg-gold-500 text-white'
                  : 'border border-ink-200 bg-white text-ink-700 hover:border-ink-400')
              }
            >
              All categories
            </Link>
            {categories.map(c => {
              const isActive = activeCategory === c.slug
              const href = buildEventsUrl(params, {
                category: isActive ? undefined : c.slug,
                page: undefined,
              })
              return (
                <Link
                  key={c.id}
                  href={href}
                  aria-pressed={isActive}
                  className={
                    'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ' +
                    (isActive
                      ? 'bg-gold-500 text-white'
                      : 'border border-ink-200 bg-white text-ink-700 hover:border-ink-400')
                  }
                >
                  {c.name}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
