import { ArrowDownRight, ArrowUpRight, Tag } from 'lucide-react'
import { SectionHeader } from '@/components/ui/SectionHeader'
import {
  describePriceEntry,
  formatHistoryDate,
  priceHistorySummary,
  type PriceDirection,
  type TierPriceHistory,
} from '@/lib/pricing/price-history'
import type { EventTimeZone } from '@/lib/dates/event-time'

/**
 * PRICE HISTORY ON THE EVENT PAGE (Scope v5, 3.3).
 *
 * "Price history visible on event page so buyers can see how pricing has
 * moved, reinforcing transparency." One timeline per ticket the visitor may
 * see, oldest first: listed, then every move the database recorded (the
 * organiser changing it, or a dynamic pricing step crossed as tickets sold).
 * The words carry the direction (Rose, Fell, Raised, Lowered); the icon only
 * echoes them, so nothing here depends on colour.
 *
 * A server component with no state: the rows arrive already summarised by
 * src/lib/pricing/price-history.ts, and an event with no history renders
 * nothing rather than an empty card.
 */
interface Props {
  histories: TierPriceHistory[]
  timezone: EventTimeZone
}

function DirectionIcon({ direction }: { direction: PriceDirection }) {
  const className = 'h-3.5 w-3.5'
  if (direction === 'up') return <ArrowUpRight className={className} aria-hidden="true" />
  if (direction === 'down') return <ArrowDownRight className={className} aria-hidden="true" />
  return <Tag className={className} aria-hidden="true" />
}

export function PriceHistoryPanel({ histories, timezone }: Props) {
  if (histories.length === 0) return null

  return (
    <section
      aria-labelledby="price-history-heading"
      data-testid="price-history"
      className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm"
    >
      <SectionHeader eyebrow="Price history" title="How the price has moved" size="sm" id="price-history-heading" />
      <p className="mt-3 text-sm text-ink-600" data-testid="price-history-summary">
        {priceHistorySummary(histories)}
      </p>

      <div className="mt-5 space-y-5">
        {histories.map((history) => (
          <div key={history.tierId} data-testid="price-history-tier">
            {histories.length > 1 && (
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">{history.tierName}</p>
            )}
            <ol className="mt-2 space-y-2.5">
              {history.entries.map((entry, i) => (
                <li key={`${entry.recordedAt}-${i}`} className="flex items-start gap-3 text-sm">
                  <span
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-700"
                    aria-hidden="true"
                  >
                    <DirectionIcon direction={entry.direction} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold tabular-nums text-ink-900" data-testid="price-history-entry">
                      {describePriceEntry(entry, history.currency)}
                    </span>{' '}
                    <span className="block text-xs text-ink-500">{formatHistoryDate(entry.recordedAt, timezone)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <p className="mt-5 border-t border-ink-100 pt-4 text-xs text-ink-500">
        Prices lock when you reserve, so what you see at checkout is what you pay.
      </p>
    </section>
  )
}
