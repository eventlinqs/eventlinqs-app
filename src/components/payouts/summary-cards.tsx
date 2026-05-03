import { CalendarClock, Clock, Lock, Wallet } from 'lucide-react'
import type { PayoutSummary } from '@/lib/payouts/queries'
import { formatCents, formatDate } from './format'

interface SummaryCardsProps {
  summary: PayoutSummary
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  const cards = [
    {
      key: 'pending',
      label: 'Pending payouts',
      value: formatCents(summary.pendingCents, summary.currency),
      hint: summary.nextArrivalDate
        ? `Next arrival ${formatDate(summary.nextArrivalDate)}`
        : 'Awaits Stripe schedule',
      icon: Clock,
      tone: 'warning' as const,
    },
    {
      key: 'paid_month',
      label: 'Paid this month',
      value: formatCents(summary.paidThisMonthCents, summary.currency),
      hint: 'Settled to your bank',
      icon: Wallet,
      tone: 'success' as const,
    },
    {
      key: 'on_hold',
      label: 'On hold (reserves)',
      value: formatCents(summary.onHoldCents, summary.currency),
      hint: 'Releases after each event',
      icon: Lock,
      tone: 'neutral' as const,
    },
    {
      key: 'lifetime',
      label: 'Lifetime paid',
      value: formatCents(summary.lifetimeCents, summary.currency),
      hint: 'All time, all events',
      icon: CalendarClock,
      tone: 'navy' as const,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(({ key, label, value, hint, icon: Icon, tone }) => (
        <article
          key={key}
          className="rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              {label}
            </p>
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${toneClasses(tone)}`}
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-3 font-display text-2xl font-bold text-ink-900 tabular-nums">
            {value}
          </p>
          <p className="mt-1 text-xs text-ink-500">{hint}</p>
        </article>
      ))}
    </div>
  )
}

function toneClasses(tone: 'warning' | 'success' | 'neutral' | 'navy'): string {
  switch (tone) {
    case 'warning':
      return 'bg-amber-100 text-amber-700'
    case 'success':
      return 'bg-emerald-100 text-emerald-700'
    case 'neutral':
      return 'bg-ink-100 text-ink-700'
    case 'navy':
      return 'bg-gold-100 text-gold-700'
  }
}
