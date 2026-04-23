'use client'

import { useState, useTransition } from 'react'
import { saveDynamicPricing } from '@/app/actions/dynamic-pricing'

interface PricingStep {
  id?: string
  step_order: number
  capacity_threshold_percent: number
  price_cents: number
  // Transient display strings — only exist during user editing, stripped before save
  _priceDisplay?: string
  _percentDisplay?: string
}

interface Tier {
  id: string
  name: string
  price: number
  currency: string
  dynamic_pricing_enabled: boolean
  sold_count: number
  total_capacity: number
  dynamic_pricing_rules: PricingStep[]
}

interface Props {
  eventId: string
  eventTitle: string
  tiers: Tier[]
}

function formatPrice(cents: number, currency: string) {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

function TierPricingCard({ tier, eventId }: { tier: Tier; eventId: string }) {
  const [enabled, setEnabled] = useState(tier.dynamic_pricing_enabled)
  const [steps, setSteps] = useState<PricingStep[]>(
    tier.dynamic_pricing_rules.length > 0
      ? tier.dynamic_pricing_rules
      : [{ step_order: 1, capacity_threshold_percent: 100, price_cents: tier.price }]
  )
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const percentSold = tier.total_capacity > 0
    ? Math.round((tier.sold_count / tier.total_capacity) * 100)
    : 0

  // Find current active step based on percent sold
  const currentStepPrice = (() => {
    if (!enabled || steps.length === 0) return tier.price
    const sorted = [...steps].sort((a, b) => a.capacity_threshold_percent - b.capacity_threshold_percent)
    const active = sorted.find(s => s.capacity_threshold_percent >= percentSold)
    return active?.price_cents ?? sorted[sorted.length - 1]?.price_cents ?? tier.price
  })()

  function addStep() {
    if (steps.length >= 10) return
    const lastThreshold = steps[steps.length - 1]?.capacity_threshold_percent ?? 0
    const newThreshold = Math.min(100, lastThreshold + 25)
    setSteps(prev => [
      ...prev,
      {
        step_order: prev.length + 1,
        capacity_threshold_percent: newThreshold,
        price_cents: tier.price,
        // Start new rows with an empty price display so the field is blank and ready to type
        _priceDisplay: '',
      },
    ])
  }

  function removeStep(index: number) {
    if (steps.length <= 1) return
    setSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i + 1 })))
  }

  // ── Price input handlers ──────────────────────────────────────────────────
  // onChange only updates the raw display string — no parsing, no reformatting.
  // onBlur parses, clamps, formats, and commits to price_cents.
  function handlePriceChange(index: number, raw: string) {
    // Allow digits and at most one decimal point; reject anything else
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
    setSteps(prev =>
      prev.map((s, i) => (i === index ? { ...s, _priceDisplay: raw } : s))
    )
  }

  function handlePriceBlur(index: number) {
    setSteps(prev =>
      prev.map((s, i) => {
        if (i !== index) return s
        const display = s._priceDisplay
        // If the user never touched this field, nothing to do
        if (display === undefined) return s
        const parsed = parseFloat(display)
        const priceCents = isNaN(parsed) || parsed < 0 ? 0 : Math.round(parsed * 100)
        return { ...s, price_cents: priceCents, _priceDisplay: undefined }
      })
    )
  }

  // ── Percent input handlers ────────────────────────────────────────────────
  // onChange allows only digits and updates display string.
  // onBlur parses and clamps to 1–100.
  function handlePercentChange(index: number, raw: string) {
    const digitsOnly = raw.replace(/[^0-9]/g, '')
    setSteps(prev =>
      prev.map((s, i) => (i === index ? { ...s, _percentDisplay: digitsOnly } : s))
    )
  }

  function handlePercentBlur(index: number) {
    setSteps(prev =>
      prev.map((s, i) => {
        if (i !== index) return s
        const display = s._percentDisplay
        if (display === undefined) return s
        const parsed = parseInt(display, 10)
        const clamped = isNaN(parsed) ? 1 : Math.min(100, Math.max(1, parsed))
        return { ...s, capacity_threshold_percent: clamped, _percentDisplay: undefined }
      })
    )
  }

  function save() {
    setMessage(null)
    // Strip transient display fields before sending to the server action
    const cleanSteps = steps.map(({ _priceDisplay: _p, _percentDisplay: _pct, ...s }) => s)
    startTransition(async () => {
      const result = await saveDynamicPricing({
        tier_id: tier.id,
        enabled,
        steps: cleanSteps,
        event_id: eventId,
      })
      if (result.success) {
        setMessage({ type: 'success', text: 'Pricing saved.' })
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Save failed.' })
      }
    })
  }

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      {/* Tier header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-ink-900">{tier.name}</h3>
          <p className="text-sm text-ink-400 mt-0.5">
            Base price: {formatPrice(tier.price, tier.currency)} · {tier.sold_count}/{tier.total_capacity} sold ({percentSold}%)
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-ink-600">Dynamic pricing</span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? 'bg-gold-500' : 'bg-ink-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      </div>

      {enabled && (
        <>
          {/* Preview */}
          <div className="mb-4 rounded-lg bg-gold-100 px-4 py-3">
            <p className="text-sm text-gold-600">
              <span className="font-medium">At current sales ({percentSold}% sold), buyers pay:</span>{' '}
              {formatPrice(currentStepPrice, tier.currency)}
            </p>
          </div>

          {/* Steps */}
          <div className="space-y-3 mb-4">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-ink-400 px-1">
              <span>Up to % sold</span>
              <span>Price ({tier.currency})</span>
              <span />
            </div>
            {steps.map((step, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                {/* Percent field — text input, digits only, clamped 1–100 on blur */}
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={step._percentDisplay ?? String(step.capacity_threshold_percent)}
                    onChange={e => handlePercentChange(i, e.target.value)}
                    onBlur={() => handlePercentBlur(i)}
                    placeholder="1-100"
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 pr-8 text-sm focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">%</span>
                </div>
                {/* Price field — text input, decimal allowed, formatted on blur */}
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={step._priceDisplay ?? (step.price_cents / 100).toFixed(2)}
                    onChange={e => handlePriceChange(i, e.target.value)}
                    onBlur={() => handlePriceBlur(i)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 pl-7 text-sm focus:border-gold-400 focus:outline-none focus:ring-1 focus:ring-gold-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  disabled={steps.length <= 1}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Remove step"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {steps.length < 10 && (
            <button
              type="button"
              onClick={addStep}
              className="mb-4 flex items-center gap-1.5 text-sm text-gold-500 hover:text-gold-600 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add step
            </button>
          )}
        </>
      )}

      {/* Save row */}
      <div className="flex items-center justify-between pt-2 border-t border-ink-100">
        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
        {!message && <span />}
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-ink-900 hover:bg-gold-600 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export function PricingClient({ eventId, eventTitle, tiers }: Props) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Dynamic Pricing</h1>
        <p className="mt-1 text-sm text-ink-400">{eventTitle}</p>
        <p className="mt-2 text-sm text-ink-600">
          Set stepwise price increases as tickets sell. Prices lock at reservation time, so buyers are never surprised.
        </p>
      </div>

      {tiers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 py-12 text-center text-sm text-ink-400">
          No ticket tiers found for this event.
        </div>
      ) : (
        <div className="space-y-6">
          {tiers.map(tier => (
            <TierPricingCard key={tier.id} tier={tier} eventId={eventId} />
          ))}
        </div>
      )}
    </div>
  )
}
