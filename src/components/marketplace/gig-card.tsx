import Link from 'next/link'
import { CalendarDays, MapPin, Mic2 } from 'lucide-react'
import {
  PAY_TYPE_LABELS,
  PERFORMANCE_TYPE_LABELS,
  type GigWithOrg,
} from '@/lib/marketplace/gigs'
import { formatMoney } from '@/lib/money/format'

function payLine(gig: GigWithOrg): string {
  if (gig.pay_type === 'fixed_fee' && gig.pay_amount_cents) {
    return formatMoney(gig.pay_amount_cents, 'AUD')
  }
  return PAY_TYPE_LABELS[gig.pay_type]
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso))
}

/**
 * One gig on the board. The whole card is the link (no dead-end tiles), with
 * the platform card language: white surface, ink border, lift on hover.
 */
export function GigCard({ gig, cityName }: { gig: GigWithOrg; cityName: string }) {
  return (
    <Link
      href={`/gigs/${gig.id}`}
      className="group flex min-h-[44px] flex-col rounded-xl border border-ink-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--brand-accent)]/40 hover:shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-700">
          <Mic2 className="h-3.5 w-3.5 text-gold-800" aria-hidden />
          {PERFORMANCE_TYPE_LABELS[gig.performance_type]}
        </span>
        <span className="shrink-0 rounded-full bg-gold-100 px-2.5 py-1 text-xs font-bold text-gold-800">
          {payLine(gig)}
        </span>
      </div>

      <h3 className="mt-3 line-clamp-2 font-display text-lg font-bold leading-snug text-ink-900 group-hover:text-ink-950">
        {gig.title}
      </h3>
      <p className="mt-1 text-sm text-ink-600">{gig.organisation_name}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-200/70 pt-3 text-sm text-ink-700">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-ink-500" aria-hidden />
          {formatDate(gig.event_date)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-4 w-4 text-ink-500" aria-hidden />
          {gig.venue_name ? `${gig.venue_name}, ${cityName}` : cityName}
        </span>
      </div>
      <p className="mt-2 text-xs font-medium text-ink-500">
        Apply by {formatDate(gig.application_deadline)}
      </p>
    </Link>
  )
}
