import { Lock, Users, RefreshCw } from 'lucide-react'

interface Props {
  /** Visual variant. `light` is the default (navy text on canvas) used
   *  in content sections. `dark` is white text for use over the event
   *  hero overlay. */
  variant?: 'light' | 'dark'
}

/**
 * EventTrustSignals (Batch 11.0, microcopy revised post-review).
 *
 * Three-icon row that sits directly beneath the "Get tickets" CTA on
 * event detail pages, per the 2026 contextual-trust pattern:
 *
 *   - Trust signals appear at the purchase-decision moment, not as a
 *     repeated page-level band across the site (legacy 2010s pattern
 *     removed from homepage in Batch 11.0).
 *   - Icons are gold for visual weight, microcopy is the brand-voice
 *     condensed form (no exclamation, no "100%", no hyperbole).
 *
 * Microcopy is universally accurate for every event on the platform:
 *   - "Secure checkout" - true for every flow (Stripe + HTTPS).
 *   - "Community organiser" - matches the EventLinqs positioning per
 *     STRATEGY-LOCK.md Section 1 ("community-first operating system
 *     that happens to sell tickets"). Avoids the "Verified organiser"
 *     claim that would require a `verified` flag on `organisations`
 *     which does not yet exist as a vetted pipeline.
 *   - "Refund policy" - true for every event (each organiser sets a
 *     policy, and the platform routes refund requests through the
 *     existing refund flow).
 *
 * Layout: horizontal row on tablet/desktop, stacked column on mobile.
 * The component is purely presentational - the actual checkout flow
 * carries its own verification surface (CheckoutTrustSignals).
 */
export function EventTrustSignals({ variant = 'light' }: Props = {}) {
  const textClass = variant === 'dark' ? 'text-white/85' : 'text-[var(--color-navy-950)]'
  return (
    <ul
      role="list"
      aria-label="Trust signals"
      className={`mt-4 flex flex-col gap-2 text-sm font-medium ${textClass} sm:flex-row sm:items-center sm:gap-6`}
    >
      <li className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-[var(--brand-accent)]" aria-hidden />
        <span>Secure checkout</span>
      </li>
      <li className="flex items-center gap-2">
        <Users className="h-4 w-4 text-[var(--brand-accent)]" aria-hidden />
        <span>Community organiser</span>
      </li>
      <li className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-[var(--brand-accent)]" aria-hidden />
        <span>Refund policy</span>
      </li>
    </ul>
  )
}
