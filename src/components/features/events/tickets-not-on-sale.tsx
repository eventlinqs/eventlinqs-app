import { SectionHeader } from '@/components/ui/SectionHeader'
import {
  TICKETS_NOT_ON_SALE_BODY,
  TICKETS_NOT_ON_SALE_HEADING,
} from '@/lib/payments/sale-status'

/**
 * On-brand "tickets not yet on sale" state for a paid event whose organiser
 * has not finished Stripe setup. Reuses the event-detail card styling and the
 * navy/gold palette; renders no selection controls so inventory cannot be
 * consumed for an unsellable event.
 *
 * `embedded` drops the outer card + heading for use inside an existing panel
 * (the seated-event card already supplies those).
 */
export function TicketsNotOnSale({ embedded = false }: { embedded?: boolean }) {
  const message = (
    <div className="rounded-2xl border border-ink-200 bg-ink-100/40 px-4 py-5 text-center">
      <p className="font-display text-base font-bold text-ink-900">
        {TICKETS_NOT_ON_SALE_HEADING}
      </p>
      <p className="mt-2 text-sm text-ink-600">{TICKETS_NOT_ON_SALE_BODY}</p>
    </div>
  )

  if (embedded) return message

  return (
    <div className="sticky top-20 rounded-2xl border border-ink-200 bg-white p-6 shadow-[var(--shadow-card)]">
      <SectionHeader eyebrow="Get in" title="Tickets" size="sm" className="mb-5" />
      {message}
    </div>
  )
}

/**
 * The ticket panel of an event that is over: the same card, the banner's own
 * sentence, and no selection controls. Over by its end date as well as by its
 * status (src/lib/events/event-state.ts).
 */
export function TicketsEnded() {
  return (
    <div className="sticky top-20 rounded-2xl border border-ink-200 bg-white p-6 shadow-[var(--shadow-card)]">
      <SectionHeader eyebrow="Get in" title="Tickets" size="sm" className="mb-5" />
      <div className="rounded-2xl border border-ink-200 bg-ink-100/40 px-4 py-5 text-center">
        <p className="font-display text-base font-bold text-ink-900">This event has ended.</p>
        <p className="mt-2 text-sm text-ink-600">Tickets are no longer on sale.</p>
      </div>
    </div>
  )
}
