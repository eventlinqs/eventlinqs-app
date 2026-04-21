import { Search } from 'lucide-react'
import type { EventsSearchParams } from '@/lib/events/search-params'

type Props = {
  params: EventsSearchParams
  total: number
  /** Form action target. Defaults to /events; browse pages pass /events/browse/{slug}. */
  basePath?: string
  /** Optional heading override (e.g. "Events in Melbourne"). */
  heading?: string
  /** Optional subtitle override below the count. */
  subtitle?: string
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

export function EventsHeroStrip({
  params,
  total,
  basePath = '/events',
  heading = 'Discover events',
  subtitle,
}: Props) {
  return (
    <section className="border-b border-ink-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <h1 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
          {heading}
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          {total} event{total === 1 ? '' : 's'} available
          {subtitle ? ` · ${subtitle}` : ''}
        </p>

        <form method="GET" action={basePath} className="mt-4">
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
                placeholder="Search events, artists, venues…"
                aria-label="Search events"
                className="w-full rounded-lg border border-ink-200 bg-white py-2.5 pl-10 pr-4 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-400"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
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
