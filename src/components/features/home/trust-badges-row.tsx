import { CheckCircle, Shield, RotateCcw } from 'lucide-react'

/**
 * TrustBadgesRow - radical-transparency strip below the hero (Batch 9).
 *
 * Three differentiator badges that sell EventLinqs against the legacy
 * incumbents. Every word is brand-locked: no em-dashes, no exclamation
 * marks, AU English, factual claims only.
 *
 *   - "No hidden fees": Ticketmaster was sued by the FTC in 2025 for
 *      junk fees; this is the single-biggest brand differentiator we
 *      have today.
 *   - "Verified community organisers": signals trust to first-time
 *      buyers landing from social/SEO. The verification flag will
 *      be wired to the M7 admin panel verification badge once it ships.
 *   - "Fair refund policy": addresses the cancellation anxiety that
 *      drives cart abandonment.
 *
 * Renders as a horizontal scroll on mobile (< sm), fixed 3-column row
 * on desktop. Sits on a light surface so the gold icons read with
 * full WCAG-AA contrast against a white background.
 */
export function TrustBadgesRow() {
  const badges = [
    {
      Icon: CheckCircle,
      label: 'No hidden fees',
      tag: 'Pay what you see',
    },
    {
      Icon: Shield,
      label: 'Verified community organisers',
      tag: 'Real people, real events',
    },
    {
      Icon: RotateCcw,
      label: 'Fair refund policy',
      tag: '24-hour support',
    },
  ]

  return (
    <section
      aria-label="EventLinqs guarantees"
      className="border-y border-[var(--surface-2)] bg-[var(--surface-0)]"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ul
          role="list"
          className="flex items-center gap-6 overflow-x-auto py-4 scrollbar-none sm:grid sm:grid-cols-3 sm:gap-8 sm:py-5"
        >
          {badges.map(({ Icon, label, tag }) => (
            <li
              key={label}
              className="flex shrink-0 items-center gap-3 sm:justify-center"
            >
              <Icon
                className="h-5 w-5 shrink-0 text-[var(--brand-accent-strong)] sm:h-6 sm:w-6"
                strokeWidth={2}
                aria-hidden
              />
              <div className="leading-tight">
                <p className="font-display text-sm font-bold text-[var(--text-primary)]">
                  {label}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] sm:text-xs">
                  {tag}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
