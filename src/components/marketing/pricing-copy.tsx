import Link from 'next/link'

/**
 * Canonical marketing fee statement.
 *
 * Single source of truth for the public fee copy shown on /pricing,
 * /organisers, and the homepage. The previous state had three different
 * wordings across these pages, which undermined the "Simple.
 * Transparent. Fair." promise.
 *
 * The numbers below mirror the live production pricing_rules engine for
 * AU/AUD, verified 2026-05-16 by direct query:
 *   - platform_fee_percentage  AU/AUD = 2.5
 *   - platform_fee_fixed       AU/AUD = 50  (smallest unit, A$0.50)
 *
 * Worked example arithmetic (self-consistent, do not paraphrase):
 *   2.5% of $50.00 = $1.25
 *   + $0.50 fixed   = $1.75 total fee
 *   $50.00 - $1.75  = $48.25 received by the organiser
 *
 * If the pricing_rules table changes, update these two constants in the
 * same change so copy never drifts from what is actually charged.
 * Hedging words ("from", "indicative", "may vary", "approximately",
 * "starting at") are deliberately absent. The fee is the fee.
 */

export const FEE_PRIMARY =
  '2.5% + 50¢ AUD per ticket. Free events are free, forever.'

export const FEE_WORKED_EXAMPLE =
  'On a $50 ticket: you receive $48.25, EventLinqs takes $1.75. No hidden charges, no surprise fees.'

type Variant = 'light' | 'dark'

const TONE: Record<Variant, { primary: string; example: string; cta: string }> = {
  light: {
    primary: 'text-[var(--text-primary)]',
    example: 'text-[var(--text-secondary)]',
    cta:
      'border border-[var(--surface-2)] text-[var(--text-primary)] hover:border-[var(--brand-accent)]',
  },
  dark: {
    primary: 'text-white',
    example: 'text-white/70',
    cta: 'border border-white/20 text-white/80 hover:border-white/40 hover:text-white',
  },
}

/**
 * Renders the canonical fee statement and worked example.
 *
 * Server-component safe (no client hooks). Money figures use
 * tabular-nums so digits align across the primary line and the example.
 * The optional CTA is sized for the mobile thumb zone (44px min height,
 * full width on small screens) and links to /pricing.
 */
export function FeeStatement({
  variant = 'light',
  showCta = false,
  className = '',
}: {
  variant?: Variant
  showCta?: boolean
  className?: string
}) {
  const tone = TONE[variant]
  return (
    <div className={`tabular-nums ${className}`}>
      <p className={`font-display text-lg font-bold leading-snug sm:text-xl ${tone.primary}`}>
        {FEE_PRIMARY}
      </p>
      <p className={`mt-2 text-sm leading-relaxed ${tone.example}`}>
        {FEE_WORKED_EXAMPLE}
      </p>
      {showCta && (
        <Link
          href="/pricing"
          className={`mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg px-6 text-sm font-semibold transition-colors sm:w-auto ${tone.cta}`}
        >
          See full pricing
        </Link>
      )}
    </div>
  )
}
