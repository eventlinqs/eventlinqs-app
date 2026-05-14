import { Lock, ShieldCheck, BadgeCheck } from 'lucide-react'

/**
 * CheckoutTrustSignals (Batch 11.0).
 *
 * Full trust signal treatment for the checkout flow, per the 2026
 * contextual-trust pattern:
 *
 *   - Trust signals appear at the purchase-decision moment (checkout
 *     and event detail "Get tickets" CTA), NEVER as a repeated
 *     page-level band across the site.
 *   - Payment-provider logos are SVG marks (no third-party brand
 *     assets bundled; brand names listed inline as the accessible
 *     label, visual logos render as inline SVG to keep the bundle
 *     network-light).
 *
 * Layout: vertical block sized for a checkout sidebar. The component
 * is purely presentational; the actual Stripe Elements + payment flow
 * lives in the checkout form.
 */
export function CheckoutTrustSignals() {
  return (
    <aside
      aria-label="Payment security"
      className="rounded-2xl border border-ink-100 bg-[var(--surface-0)] p-5 shadow-sm"
    >
      <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-[var(--brand-accent-strong)]">
        Secure payment
      </p>

      <ul role="list" className="mt-4 space-y-3 text-sm font-medium text-[var(--color-navy-950)]">
        <li className="flex items-start gap-3">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-accent)]" aria-hidden />
          <span>Encrypted by Stripe. Card details never touch our servers.</span>
        </li>
        <li className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-accent)]" aria-hidden />
          <span>Money-back guarantee per organiser refund policy.</span>
        </li>
        <li className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-accent)]" aria-hidden />
          <span>PCI-DSS compliant payment processing.</span>
        </li>
      </ul>

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-400">
        We accept
      </p>
      <ul
        role="list"
        aria-label="Accepted payment methods"
        className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-600"
      >
        <li>Visa</li>
        <li aria-hidden className="text-ink-200">·</li>
        <li>Mastercard</li>
        <li aria-hidden className="text-ink-200">·</li>
        <li>Amex</li>
        <li aria-hidden className="text-ink-200">·</li>
        <li>Apple Pay</li>
        <li aria-hidden className="text-ink-200">·</li>
        <li>Google Pay</li>
      </ul>
    </aside>
  )
}
