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
export function EventStateBanner({ state, newDate, originalDate, organiserHandle }: Props) {
  if (state === 'cancelled') {
    return (
      <div role="alert" className="bg-[#fdecec] border-b border-[#f5c5c5]">
        <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#c8302a]" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-[#7a1e1a]">This event has been cancelled.</p>
            <p className="mt-0.5 text-[#7a1e1a]/85">
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
      <div role="alert" className="bg-[#fdf6e3] border-b border-[#f5e3a5]">
        <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-[#a87a00]" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-[#5c4400]">This event has been postponed.</p>
            <p className="mt-0.5 text-[#5c4400]/85">
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

/** Lower-effort sold-out marker that sits inside the hero CTA row. */
export function EventSoldOutBadge() {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[#c8302a] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white">
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
      Sold out
    </span>
  )
}
