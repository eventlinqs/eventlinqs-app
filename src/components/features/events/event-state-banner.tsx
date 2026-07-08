import Link from 'next/link'
import { AlertTriangle, XCircle, CalendarClock, Clock } from 'lucide-react'

type EventBannerState = 'cancelled' | 'postponed' | 'past'

interface Props {
  state: EventBannerState
  /** Optional new-date display for postponed events. */
  newDate?: string | null
  /** Optional original-date display for postponed events. */
  originalDate?: string | null
  /** Organiser handle so past-event banners can deep link to upcoming. */
  organiserHandle?: string | null
}

/**
 * EventStateBanner - top-of-page banner for /events/[slug] when the
 * event isn't in the standard upcoming state (Batch 8.1).
 *
 * Cancelled and postponed events still get full SEO treatment because
 * they hold archive value and refund/customer-service traffic. The
 * banner replaces the previous full-page replacement so the rest of
 * the page (description, venue, organiser, related events) still
 * renders.
 *
 * Past events get a softer notice + a deep link to the organiser's
 * upcoming events as the primary recovery CTA.
 */
// Banner palettes derive from the semantic tokens in globals.css:
// - Cancelled: --color-error #DC2626. Background #FCE9E9 is a 10% tint of
//   error on white, border #F4BEBE a 30% tint; text #991B1B is the error-800
//   equivalent shade (AA on the tint); the icon is the error token itself.
// - Postponed: --color-warning #F59E0B. Background #FEF5E7 is a 10% tint of
//   warning on white, border #FCE2B6 a 30% tint; icon #B45309 is the
//   warning-700 equivalent, text #78350F the warning-900 equivalent (AA).
export function EventStateBanner({ state, newDate, originalDate, organiserHandle }: Props) {
  if (state === 'cancelled') {
    return (
      <div role="alert" className="bg-[#FCE9E9] border-b border-[#F4BEBE]">
        <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-[#991B1B]">This event has been cancelled.</p>
            <p className="mt-0.5 text-[#991B1B]/85">
              Refunds are processed automatically to the original payment method within 5 business days.
              For questions, contact{' '}
              <a href="mailto:support@eventlinqs.com" className="underline hover:no-underline">
                support@eventlinqs.com
              </a>.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'postponed') {
    return (
      <div role="alert" className="bg-[#FEF5E7] border-b border-[#FCE2B6]">
        <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[#B45309]" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-[#78350F]">This event has been postponed.</p>
            <p className="mt-0.5 text-[#78350F]/85">
              {newDate ? (
                <>New date: <strong>{newDate}</strong>. Existing tickets remain valid.</>
              ) : (
                <>A new date will be announced. Existing tickets remain valid.</>
              )}
              {originalDate ? (
                <>{' '}Original date: <span className="line-through">{originalDate}</span>.</>
              ) : null}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // past
  return (
    <div role="status" className="bg-[var(--surface-1)] border-b border-[var(--surface-2)]">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-secondary)]" aria-hidden />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-[var(--text-primary)]">This event has ended.</p>
          <p className="mt-0.5 text-[var(--text-secondary)]">
            {organiserHandle ? (
              <>
                See{' '}
                <Link
                  href={`/organisers/${organiserHandle}`}
                  className="font-medium text-[var(--brand-accent-strong)] underline hover:no-underline"
                >
                  upcoming events from this organiser
                </Link>
                {' '}or{' '}
                <Link href="/events" className="font-medium text-[var(--brand-accent-strong)] underline hover:no-underline">
                  browse all upcoming events
                </Link>.
              </>
            ) : (
              <>
                <Link href="/events" className="font-medium text-[var(--brand-accent-strong)] underline hover:no-underline">
                  Browse upcoming events
                </Link>.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

/** Lower-effort sold-out marker that sits inside the hero CTA row.
 * #B91C1C is the error-700 equivalent shade of --color-error #DC2626,
 * chosen so white 12px bold text keeps AA (the raw token sits below 4.5:1). */
export function EventSoldOutBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[#B91C1C] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      Sold out
    </span>
  )
}
