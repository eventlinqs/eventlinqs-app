import { ShieldCheck, CalendarClock, PiggyBank } from 'lucide-react'
import type { PayoutTerms } from '@/lib/payouts/queries'

interface PayoutTermsCardProps {
  terms: PayoutTerms
}

/**
 * Shows the payout tier, cadence, and reserve that apply to the organisation.
 * The organiser terms (src/app/legal/organiser-terms) promise this exact view,
 * so the figures here are sourced from the same place the platform actually
 * charges and holds against: the organisations row (tier/schedule) and the
 * pricing-rules service (reserve %, cadence days). Organiser-view and admin-view
 * read the same sources and cannot disagree.
 */
export function PayoutTermsCard({ terms }: PayoutTermsCardProps) {
  const cadenceText =
    terms.cadenceDays === 1
      ? '1 business day after each event'
      : `${terms.cadenceDays} business days after each event`

  const items = [
    {
      key: 'tier',
      icon: ShieldCheck,
      label: 'Your payout tier',
      value: terms.tierLabel,
      detail: terms.scheduleLabel,
    },
    {
      key: 'cadence',
      icon: CalendarClock,
      label: 'Payout cadence',
      value: cadenceText,
      detail: terms.onDemandEligible
        ? 'On-demand pre-event payouts available'
        : 'Pre-event payouts unlock at higher tiers',
    },
    {
      key: 'reserve',
      icon: PiggyBank,
      label: 'Reserve held',
      value: `${terms.reservePercent}% of gross`,
      detail: 'Covers refunds and chargebacks, released after each event',
    },
  ]

  return (
    <section
      aria-labelledby="payout-terms-heading"
      className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id="payout-terms-heading" className="font-display text-lg font-bold text-ink-900">
            Your payout terms
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            The tier, cadence, and reserve that apply to your account right now.
          </p>
        </div>
        <span
          className="inline-flex items-center rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold text-gold-800"
        >
          {terms.tierLabel} tier
        </span>
      </header>

      <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {items.map(({ key, icon: Icon, label, value, detail }) => (
          <div
            key={key}
            className="rounded-xl border border-ink-100 bg-ink-100/40 p-4"
          >
            <div className="flex items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-100 text-gold-700"
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" />
              </span>
              <dt className="text-xs font-semibold uppercase tracking-wider text-ink-600">
                {label}
              </dt>
            </div>
            <dd className="mt-3 font-display text-lg font-bold text-ink-900">{value}</dd>
            <p className="mt-1 text-xs text-ink-400">{detail}</p>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs text-ink-400">
        As your track record builds you may move to faster cadences and lower
        reserves. See the organiser terms for how tiers progress.
      </p>
    </section>
  )
}
