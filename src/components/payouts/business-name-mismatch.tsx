import { AlertTriangle } from 'lucide-react'
import { StripeDashboardButton } from '@/components/payouts/stripe-dashboard-button'

/**
 * Reports that the organisation name on EventLinqs and the business name on the
 * connected Stripe account have drifted apart.
 *
 * This band exists because the disagreement was previously invisible. On
 * production an organisation named "Party Pty Ltd" carries a Stripe account
 * whose business name reads "Eventlinqs", and no surface anywhere said so. The
 * organiser is the only person who can put it right, because Stripe stops the
 * platform editing that field once Express onboarding has started, so the fix
 * has to be told to them plainly and with the door to Stripe already open.
 *
 * Rendered only on a genuine mismatch. An unset Stripe name is not a mismatch,
 * it is onboarding that has not reached the business-details step yet, and
 * shouting about an ordinary in-progress state is how a warning gets ignored.
 */
export function BusinessNameMismatch({
  platformName,
  stripeName,
}: {
  platformName: string
  stripeName: string
}) {
  return (
    <section
      aria-labelledby="business-name-mismatch-heading"
      className="rounded-2xl border border-warning bg-warning/10 px-5 py-4 sm:px-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-ink-900" aria-hidden="true" />
          <div className="min-w-0">
            <h2
              id="business-name-mismatch-heading"
              className="font-display text-base font-bold text-ink-900"
            >
              Your Stripe business name does not match this organisation
            </h2>
            <p className="mt-1 text-sm text-ink-700">
              EventLinqs has you as <strong className="font-semibold">{platformName}</strong>, and
              Stripe has <strong className="font-semibold">{stripeName}</strong>. Stripe uses its
              own name on your buyers&rsquo; bank statements and on your payout records, so a buyer
              who does not recognise it can raise a chargeback.
            </p>
            <p className="mt-2 text-sm text-ink-700">
              If the Stripe name is the wrong one, fix it under Settings, then Public business
              information, then Business name. If the EventLinqs name is the wrong one, change it in
              your organisation settings and tell us, so we leave your trading name alone.
            </p>
          </div>
        </div>
        <StripeDashboardButton enabled />
      </div>
    </section>
  )
}
