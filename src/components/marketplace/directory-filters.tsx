'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { PERFORMANCE_TYPES, PERFORMANCE_TYPE_LABELS } from '@/lib/marketplace/gigs'

/** Performer directory filters: city, type, availability, mentoring, draw sort. */
export function DirectoryFilters({ cities }: { cities: { slug: string; name: string }[] }) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`/artists${next.size ? `?${next.toString()}` : ''}`)
  }

  const selectClass =
    'h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20'
  const chipBase =
    'inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors'

  const available = params.get('available') === '1'
  const mentor = params.get('mentor') === '1'
  const byDraw = params.get('sort') === 'draw'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="dir-city">City</label>
      <select
        id="dir-city"
        value={params.get('city') ?? ''}
        onChange={(e) => setParam('city', e.target.value)}
        className={selectClass}
      >
        <option value="">All cities</option>
        {cities.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="dir-type">Performance type</label>
      <select
        id="dir-type"
        value={params.get('type') ?? ''}
        onChange={(e) => setParam('type', e.target.value)}
        className={selectClass}
      >
        <option value="">All performance types</option>
        {PERFORMANCE_TYPES.map((t) => (
          <option key={t} value={t}>
            {PERFORMANCE_TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      <button
        type="button"
        aria-pressed={available}
        onClick={() => setParam('available', available ? '' : '1')}
        className={`${chipBase} ${available ? 'border-gold-800 bg-gold-100 text-gold-800' : 'border-ink-200 bg-white text-ink-700 hover:border-gold-800'}`}
      >
        Open to bookings
      </button>
      <button
        type="button"
        aria-pressed={mentor}
        onClick={() => setParam('mentor', mentor ? '' : '1')}
        className={`${chipBase} ${mentor ? 'border-gold-800 bg-gold-100 text-gold-800' : 'border-ink-200 bg-white text-ink-700 hover:border-gold-800'}`}
      >
        Open to mentoring
      </button>
      <button
        type="button"
        aria-pressed={byDraw}
        onClick={() => setParam('sort', byDraw ? '' : 'draw')}
        className={`${chipBase} ${byDraw ? 'border-gold-800 bg-gold-100 text-gold-800' : 'border-ink-200 bg-white text-ink-700 hover:border-gold-800'}`}
      >
        Strongest draw first
      </button>
    </div>
  )
}
