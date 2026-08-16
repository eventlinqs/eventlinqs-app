import { SectionHeader } from '@/components/ui/SectionHeader'
import {
  TICKETS_SOLD_ELSEWHERE_BODY,
  TICKETS_SOLD_ELSEWHERE_HEADING,
} from '@/lib/payments/sale-status'

/**
 * The ticket column for an event whose ticketing lives on another platform.
 *
 * Founder ruling 15 August 2026, non-negotiable 3: "An external event must never
 * render a ticket selector, a price, a quantity stepper or anything a buyer
 * could mistake for a checkout here. The call to action is one button that
 * leaves."
 *
 * SO THIS COMPONENT HAS NO PRICE AND NO NUMBER IN IT AT ALL, and that is not an
 * oversight to be filled in later. A price shown beside a button on an
 * EventLinqs page reads as an EventLinqs price, and we do not know what the
 * organiser charges, whether their fees differ, or whether it changed this
 * morning. Showing a stale price next to somebody else's checkout is worse than
 * showing none.
 *
 * NO FEE COPY EITHER. We take no money on these events, so there is no fee to
 * quote, and a fee line here would be describing a charge that does not exist.
 *
 * The link carries `rel="noopener"` because it opens a third-party site, and it
 * is a plain anchor rather than a router link because it leaves the app.
 */
export function ExternalTicketsPanel({
  destinationUrl,
  host,
}: {
  destinationUrl: string
  /** The destination's hostname, shown so the visitor knows where they land. */
  host: string | null
}) {
  return (
    <div className="sticky top-20 space-y-5">
      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <SectionHeader eyebrow="Tickets" title={TICKETS_SOLD_ELSEWHERE_HEADING} size="sm" className="mb-4" />

        <p className="text-sm leading-relaxed text-ink-600">{TICKETS_SOLD_ELSEWHERE_BODY}</p>

        <a
          href={destinationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-ink-900 px-6 text-base font-semibold text-white transition hover:bg-ink-800"
        >
          Get tickets
        </a>

        {/*
          The destination host, stated plainly. A button that silently throws
          somebody onto a domain they did not expect is how a link stops being
          trusted, and naming it costs nothing.
        */}
        {host && (
          <p className="mt-3 text-center text-xs text-ink-400">
            Opens {host}
          </p>
        )}
      </div>
    </div>
  )
}
