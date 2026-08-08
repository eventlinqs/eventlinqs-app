import { Clock } from 'lucide-react'
import type { EventsNotice } from '@/lib/events/search-params'

/**
 * The message a buyer sees when checkout bounced them back to browse.
 *
 * /checkout/[reservation_id] redirects to `/events?error=reservation_expired`
 * (or `reservation_not_found`) when the hold has gone. /events parsed nothing
 * from the URL, so the seats the buyer was holding vanished with no explanation
 * on a generic browse page. From the buyer's side that reads as the platform
 * losing their order, at the exact moment they were trying to pay.
 *
 * Inherits the banner treatment from `event-state-banner.tsx` rather than
 * introducing a second notice language: same surface tokens, same border, same
 * icon weight, same max-w-7xl container.
 */
export function BrowseNotice({ notice }: { notice: EventsNotice }) {
  return (
    <div role="status" className="bg-[var(--surface-1)] border-b border-[var(--surface-2)]">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-secondary)]" aria-hidden />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-[var(--text-primary)]">{notice.heading}</p>
          <p className="mt-0.5 text-[var(--text-secondary)]">{notice.body}</p>
        </div>
      </div>
    </div>
  )
}
