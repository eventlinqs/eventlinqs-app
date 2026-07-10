'use client'

import { useId, useState } from 'react'
import {
  computeAllInTotalCents,
  computeFeeLineCents,
  type FeePassType,
  type FeeRates,
} from '@/lib/payments/fee-math'

/**
 * Live payout calculator - the organiser landing's signature element.
 *
 * Wired to the SAME pure fee math the checkout charges (`fee-math.ts`) with
 * the SAME live rates the server resolves from `pricing_rules`, passed in as
 * props. What this shows is what an organiser's buyer would pay and what the
 * organiser would receive, to the cent, under today's real rates: never a
 * marketing approximation. Free tickets short-circuit to zero fees exactly as
 * the real calculator does.
 */

interface Props {
  rates: FeeRates
  currency?: string
}

const PRESETS = [1500, 3000, 6000, 12000] // cents

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

export function PayoutCalculator({ rates, currency = 'AUD' }: Props) {
  const inputId = useId()
  const [priceInput, setPriceInput] = useState('30.00')
  const [quantity, setQuantity] = useState(1)
  const [passType, setPassType] = useState<FeePassType>('pass_to_buyer')

  const parsed = Number.parseFloat(priceInput)
  const priceCents = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0
  const subtotalCents = priceCents * quantity

  // Free events are free: the real calculator short-circuits a zero subtotal
  // before any fee applies, so the display must too.
  const fees =
    subtotalCents === 0
      ? { platform_fee_cents: 0, payment_processing_fee_cents: 0 }
      : computeFeeLineCents(subtotalCents, quantity, rates)
  const buyerPaysCents = computeAllInTotalCents(subtotalCents, fees, passType)
  const totalFeesCents = fees.platform_fee_cents + fees.payment_processing_fee_cents
  const organiserReceivesCents =
    passType === 'pass_to_buyer' ? subtotalCents : subtotalCents - totalFeesCents

  const segmentBase =
    'flex-1 rounded-control px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]'

  return (
    <div className="grid gap-6 rounded-card border border-[var(--surface-2)] bg-[var(--surface-0)] p-6 shadow-[var(--shadow-card)] sm:p-8 lg:grid-cols-2 lg:gap-10">
      {/* Inputs */}
      <div>
        <label
          htmlFor={inputId}
          className="font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]"
        >
          Your ticket price
        </label>
        <div className="mt-3 flex items-center gap-2">
          <span aria-hidden className="font-display text-lg font-bold text-[var(--text-secondary)]">
            $
          </span>
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.50"
            value={priceInput}
            onChange={e => setPriceInput(e.target.value)}
            className="h-12 w-full max-w-[10rem] rounded-control border border-ink-200 bg-white px-4 font-display text-lg font-bold text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {PRESETS.map(cents => (
            <button
              key={cents}
              type="button"
              onClick={() => setPriceInput((cents / 100).toFixed(2))}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] ${
                priceCents === cents
                  ? 'border-ink-900 bg-ink-900 text-white'
                  : 'border-ink-200 bg-white text-ink-900 hover:border-ink-900'
              }`}
            >
              ${cents / 100}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPriceInput('0')}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] ${
              priceCents === 0
                ? 'border-ink-900 bg-ink-900 text-white'
                : 'border-ink-200 bg-white text-ink-900 hover:border-ink-900'
            }`}
          >
            Free
          </button>
        </div>

        <p className="mt-6 font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]">
          Tickets in the order
        </p>
        <div className="mt-3 inline-flex items-center rounded-control border border-ink-200 bg-white">
          <button
            type="button"
            aria-label="Fewer tickets"
            onClick={() => setQuantity(q => Math.max(1, q - 1))}
            className="h-11 w-11 text-lg font-bold text-ink-900 transition-colors hover:text-gold-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          >
            -
          </button>
          <span aria-live="polite" className="w-10 text-center font-display text-base font-bold text-ink-900">
            {quantity}
          </span>
          <button
            type="button"
            aria-label="More tickets"
            onClick={() => setQuantity(q => Math.min(10, q + 1))}
            className="h-11 w-11 text-lg font-bold text-ink-900 transition-colors hover:text-gold-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
          >
            +
          </button>
        </div>

        <p className="mt-6 font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]">
          Who pays the fees
        </p>
        <div className="mt-3 flex gap-2 rounded-control bg-[var(--surface-1)] p-1" role="group" aria-label="Who pays the fees">
          <button
            type="button"
            aria-pressed={passType === 'pass_to_buyer'}
            onClick={() => setPassType('pass_to_buyer')}
            className={`${segmentBase} ${
              passType === 'pass_to_buyer'
                ? 'bg-ink-900 text-white'
                : 'bg-transparent text-ink-900 hover:bg-white'
            }`}
          >
            My buyer
          </button>
          <button
            type="button"
            aria-pressed={passType === 'absorb'}
            onClick={() => setPassType('absorb')}
            className={`${segmentBase} ${
              passType === 'absorb'
                ? 'bg-ink-900 text-white'
                : 'bg-transparent text-ink-900 hover:bg-white'
            }`}
          >
            I absorb them
          </button>
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {passType === 'pass_to_buyer'
            ? 'Fees are added at checkout and shown up front. You keep the full face value.'
            : 'Your buyer pays face value only. Fees come out of your payout.'}
        </p>
      </div>

      {/* Results */}
      <div className="flex flex-col justify-between rounded-panel bg-[var(--surface-1)] p-6 sm:p-7">
        {subtotalCents === 0 ? (
          <div>
            <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-primary)]">
              Free events are free
            </p>
            <p className="mt-3 font-display text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
              $0 in fees
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              No platform fee, no processing fee, no card required. Every tool
              included, same as every paid event.
            </p>
          </div>
        ) : (
          <dl className="space-y-5">
            <div>
              <dt className="font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                Your buyer pays
              </dt>
              <dd className="mt-1 font-display text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                {formatMoney(buyerPaysCents, currency)}
              </dd>
              <dd className="mt-0.5 text-sm text-[var(--text-secondary)]">
                Shown as one all-in total from the first click. No surprises at
                the end.
              </dd>
            </div>
            <div>
              <dt className="font-display text-sm font-bold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                You receive
              </dt>
              <dd className="mt-1 font-display text-4xl font-extrabold tracking-tight text-[var(--brand-accent-strong)]">
                {formatMoney(organiserReceivesCents, currency)}
              </dd>
              <dd className="mt-0.5 text-sm text-[var(--text-secondary)]">
                Paid to your account within 5 business days of your event ending.
              </dd>
            </div>
            <div className="border-t border-ink-200 pt-4">
              <dt className="text-sm font-semibold text-[var(--text-primary)]">EventLinqs fees</dt>
              <dd className="mt-1 flex items-baseline justify-between text-sm text-[var(--text-secondary)]">
                <span>Platform fee ({rates.platformFeePercent}% + {formatMoney(rates.platformFeeFixedCents, currency)} per ticket)</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {formatMoney(fees.platform_fee_cents, currency)}
                </span>
              </dd>
              <dd className="mt-1 flex items-baseline justify-between text-sm text-[var(--text-secondary)]">
                <span>
                  Payment processing ({rates.processingFeePercent}%
                  {rates.processingFeeFixedCents > 0
                    ? ` + ${formatMoney(rates.processingFeeFixedCents, currency)} per order`
                    : ''}
                  )
                </span>
                <span className="font-semibold text-[var(--text-primary)]">
                  {formatMoney(fees.payment_processing_fee_cents, currency)}
                </span>
              </dd>
            </div>
          </dl>
        )}
        <p className="mt-6 text-xs leading-relaxed text-[var(--text-muted)]">
          Live rates from the same pricing engine that runs checkout, GST
          inclusive. What you see here is what the numbers would be today.
        </p>
      </div>
    </div>
  )
}
