'use client'

import { useId, useState, type FormEvent } from 'react'
import { Info } from 'lucide-react'
import type { EventsSearchParams } from '@/lib/events/search-params'

export type MoreFiltersValues = {
  price_min: string | null
  price_max: string | null
  from: string | null
  to: string | null
  distance_km: string | null
  sort: string | null
}

type Props = {
  initial: EventsSearchParams
  hasGeoSignal: boolean
  onApply: (values: MoreFiltersValues) => void
}

const DISTANCE_STEPS = [5, 10, 25, 50, 100] as const
type DistanceStep = (typeof DISTANCE_STEPS)[number]

const SORT_OPTIONS: { value: 'relevance' | 'date_asc' | 'price_asc' | 'popularity'; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'date_asc', label: 'Date (soonest)' },
  { value: 'price_asc', label: 'Price (low to high)' },
  { value: 'popularity', label: 'Popularity' },
]

function clampDistanceStep(raw: string | undefined): DistanceStep {
  if (!raw) return 25
  const parsed = Number.parseFloat(raw)
  if (!Number.isFinite(parsed)) return 25
  let best: DistanceStep = DISTANCE_STEPS[0]
  for (const step of DISTANCE_STEPS) {
    if (Math.abs(parsed - step) < Math.abs(parsed - best)) best = step
  }
  return best
}

export function MoreFiltersPanel({ initial, hasGeoSignal, onApply }: Props) {
  const priceMinId = useId()
  const priceMaxId = useId()
  const fromId = useId()
  const toId = useId()
  const distanceId = useId()
  const distanceHelpId = useId()
  const sortId = useId()

  const initialDistanceEnabled = initial.distance_km !== undefined && initial.distance_km !== ''

  const [priceMin, setPriceMin] = useState(initial.price_min ?? '')
  const [priceMax, setPriceMax] = useState(initial.price_max ?? '')
  const [from, setFrom] = useState(initial.from ?? '')
  const [to, setTo] = useState(initial.to ?? '')
  const [distanceEnabled, setDistanceEnabled] = useState(initialDistanceEnabled)
  const [distance, setDistance] = useState<DistanceStep>(clampDistanceStep(initial.distance_km))
  const [sort, setSort] = useState(initial.sort ?? '')

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    onApply({
      price_min: priceMin.trim() === '' ? null : priceMin.trim(),
      price_max: priceMax.trim() === '' ? null : priceMax.trim(),
      from: from === '' ? null : from,
      to: to === '' ? null : to,
      distance_km: distanceEnabled ? String(distance) : null,
      sort: sort === '' ? null : sort,
    })
  }

  return (
    <form id="m5-more-filters-form" onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Price range */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ink-900">Price range (AUD)</legend>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label htmlFor={priceMinId} className="block text-xs text-ink-600">
              Min
            </label>
            <div className="mt-1 flex items-center rounded-lg border border-ink-200 bg-white focus-within:border-gold-500 focus-within:ring-1 focus-within:ring-gold-400">
              <span className="pl-3 text-sm text-ink-400" aria-hidden="true">
                $
              </span>
              <input
                id={priceMinId}
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                placeholder="0"
                value={priceMin}
                onChange={e => setPriceMin(e.target.value)}
                className="w-full bg-transparent px-2 py-2 text-sm text-ink-900 focus:outline-none"
              />
            </div>
          </div>
          <span className="mt-5 text-ink-400" aria-hidden="true">
            –
          </span>
          <div className="flex-1">
            <label htmlFor={priceMaxId} className="block text-xs text-ink-600">
              Max
            </label>
            <div className="mt-1 flex items-center rounded-lg border border-ink-200 bg-white focus-within:border-gold-500 focus-within:ring-1 focus-within:ring-gold-400">
              <span className="pl-3 text-sm text-ink-400" aria-hidden="true">
                $
              </span>
              <input
                id={priceMaxId}
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                placeholder="Any"
                value={priceMax}
                onChange={e => setPriceMax(e.target.value)}
                className="w-full bg-transparent px-2 py-2 text-sm text-ink-900 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </fieldset>

      {/* Date range */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-ink-900">Date range</legend>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label htmlFor={fromId} className="block text-xs text-ink-600">
              From
            </label>
            <input
              id={fromId}
              type="date"
              value={from}
              onChange={e => setFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-400"
            />
          </div>
          <span className="mt-5 text-ink-400" aria-hidden="true">
            –
          </span>
          <div className="flex-1">
            <label htmlFor={toId} className="block text-xs text-ink-600">
              To
            </label>
            <input
              id={toId}
              type="date"
              value={to}
              onChange={e => setTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-400"
            />
          </div>
        </div>
      </fieldset>

      {/* Distance */}
      <fieldset className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <legend className="text-sm font-semibold text-ink-900">Distance</legend>
          <label className="inline-flex items-center gap-2 text-xs text-ink-600">
            <input
              type="checkbox"
              checked={distanceEnabled}
              onChange={e => setDistanceEnabled(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-ink-300 text-gold-500 focus:ring-gold-400"
            />
            Enable
          </label>
        </div>
        <input
          id={distanceId}
          type="range"
          min={0}
          max={DISTANCE_STEPS.length - 1}
          step={1}
          value={DISTANCE_STEPS.indexOf(distance)}
          onChange={e => setDistance(DISTANCE_STEPS[Number.parseInt(e.target.value, 10)])}
          aria-describedby={!hasGeoSignal ? distanceHelpId : undefined}
          aria-valuetext={`${distance} kilometres`}
          disabled={!distanceEnabled}
          className="w-full accent-gold-500 disabled:opacity-50"
        />
        <div className="flex items-center justify-between text-[11px] text-ink-400">
          {DISTANCE_STEPS.map(s => (
            <span key={s} className={s === distance && distanceEnabled ? 'font-semibold text-ink-900' : ''}>
              {s}km
            </span>
          ))}
        </div>
        {!hasGeoSignal && (
          <p id={distanceHelpId} className="flex items-start gap-1.5 text-xs text-ink-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Requires location access. You can still apply this filter — it activates once you grant
            location or pick a city.
          </p>
        )}
      </fieldset>

      {/* Sort */}
      <fieldset className="flex flex-col gap-2">
        <label htmlFor={sortId} className="text-sm font-semibold text-ink-900">
          Sort by
        </label>
        <select
          id={sortId}
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-400"
        >
          <option value="">Default</option>
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </fieldset>
    </form>
  )
}
