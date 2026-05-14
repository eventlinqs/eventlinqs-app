import { Search } from 'lucide-react'
import type { EventsSearchParams } from '@/lib/events/search-params'

/**
 * EventsSearchStrip - slim search-only band for pages that already
 * carry their own heading in a photographic hero (e.g. /events/browse/[city]
 * after Batch 4 rebuild). Mirrors EventsHeroStrip's form mechanics so the
 * hidden passthrough keys and submit target stay identical.
 */

type Props = {
  params: EventsSearchParams
  basePath: string
  placeholder?: string
}

const PASSTHROUGH_KEYS = [
  'preset',
  'category',
  'price_min',
  'price_max',
  'from',
  'to',
  'distance_km',
  'sort',
  'view',
] as const

export function EventsSearchStrip({
  params,
  basePath,
  placeholder = 'Search events, artists, venues…',
}: Props) {
  return (
    <section className="border-b border-ink-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <form method="GET" action={basePath}>
          <div className="flex max-w-2xl gap-2">
            <div className="relative flex-1">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              />
              <input
                name="q"
                type="search"
                defaultValue={params.q ?? ''}
                placeholder={placeholder}
                aria-label="Search events"
                className="w-full rounded-lg border border-ink-200 bg-white py-2.5 pl-10 pr-4 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-400"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
            >
              Search
            </button>
          </div>

          {PASSTHROUGH_KEYS.map(key => {
            const value = params[key]
            if (value === undefined || value === '') return null
            return <input key={key} type="hidden" name={key} value={String(value)} />
          })}
        </form>
      </div>
    </section>
  )
}
