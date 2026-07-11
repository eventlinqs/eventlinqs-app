'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  PAY_TYPES,
  PAY_TYPE_LABELS,
  PERFORMANCE_TYPES,
  PERFORMANCE_TYPE_LABELS,
} from '@/lib/marketplace/gigs'

/**
 * Gig board filter bar: city, performance type, pay. Plain URL-driven GET
 * semantics so every filtered view is linkable and the server renders it.
 */
export function GigFilters({ cities }: { cities: { slug: string; name: string }[] }) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.push(`/gigs${next.size ? `?${next.toString()}` : ''}`)
  }

  const selectClass =
    'h-11 rounded-lg border border-ink-200 bg-white px-3 text-sm text-ink-900 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="gig-city">City</label>
      <select
        id="gig-city"
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

      <label className="sr-only" htmlFor="gig-type">Performance type</label>
      <select
        id="gig-type"
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

      <label className="sr-only" htmlFor="gig-pay">Pay</label>
      <select
        id="gig-pay"
        value={params.get('pay') ?? ''}
        onChange={(e) => setParam('pay', e.target.value)}
        className={selectClass}
      >
        <option value="">Any pay structure</option>
        {PAY_TYPES.map((t) => (
          <option key={t} value={t}>
            {PAY_TYPE_LABELS[t]}
          </option>
        ))}
      </select>

      {(params.get('city') || params.get('type') || params.get('pay')) && (
        <button
          type="button"
          onClick={() => router.push('/gigs')}
          className="h-11 rounded-lg px-3 text-sm font-semibold text-gold-800 hover:underline"
        >
          Clear
        </button>
      )}
    </div>
  )
}
