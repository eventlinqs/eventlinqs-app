import Link from 'next/link'
import { KpiCard } from '@/components/dashboard/kpi-card'
import type { OrganiserMoneySummary } from '@/lib/payouts/money-summary'

/**
 * THE ORGANISER'S MONEY ON THEIR HOME SCREEN. Close-out MONEY FIX B7.
 *
 * Four facts, every one of them summed from organiser_balance_ledger by
 * src/lib/payouts/money-summary.ts, never typed here: what sales credited to the
 * organiser, what refunds took back, what has been paid out, and when the next
 * payout is due and for how much. The detail lives on /dashboard/payouts; this
 * panel is the answer to "where is my money" without leaving the home screen.
 *
 * Exact to the cent, unlike the revenue card above it, because these are the
 * figures the organiser checks against their bank.
 */

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
  }
}

function dayOf(iso: string, timezone: string | null): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: timezone ?? 'Australia/Sydney',
  }).format(new Date(iso))
}

function nextPayoutCard(summary: OrganiserMoneySummary): { value: string; detail: string } {
  const next = summary.nextPayout
  if (!next) return { value: 'None due', detail: 'Nothing is owed to you right now' }
  const amount = money(next.amountCents, summary.currency)
  switch (next.state) {
    case 'scheduled':
      return { value: dayOf(next.dueAt, next.timezone), detail: `${amount} for ${next.eventTitle}` }
    case 'due':
      return { value: 'Due now', detail: `${amount} for ${next.eventTitle}, in the next payout run` }
    case 'held_event':
      return { value: 'On hold', detail: `${amount} for ${next.eventTitle}, held while it is ${next.eventStatus}` }
    case 'held_setup':
      return { value: 'On hold', detail: `${amount} waiting for your payout setup to finish` }
  }
}

export function MoneyPanel({ summary }: { summary: OrganiserMoneySummary }) {
  const next = nextPayoutCard(summary)
  return (
    <section aria-labelledby="money-panel-heading" className="space-y-4" data-money-panel>
      <header className="flex items-center justify-between">
        <h2 id="money-panel-heading" className="text-base font-semibold text-ink-900">
          Your money
        </h2>
        <Link
          href="/dashboard/payouts"
          className="inline-flex min-h-[44px] items-center text-sm font-semibold text-gold-800 hover:text-ink-900"
        >
          Payout details
        </Link>
      </header>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Sales"
          testId="money-sales"
          value={money(summary.salesCents, summary.currency)}
          detail={summary.salesCount > 0 ? `${summary.salesCount} order${summary.salesCount === 1 ? '' : 's'}, your share` : 'Your share of each sale'}
        />
        <KpiCard
          label="Refunds"
          testId="money-refunds"
          value={money(summary.refundedCents, summary.currency)}
          detail={summary.refundCount > 0 ? `${summary.refundCount} refund${summary.refundCount === 1 ? '' : 's'}` : 'No refunds'}
        />
        <KpiCard
          label="Paid out"
          testId="money-paid-out"
          value={money(summary.paidOutCents, summary.currency)}
          detail={summary.heldCents > 0 ? `${money(summary.heldCents, summary.currency)} still held for you` : 'Paid after each event ends'}
        />
        <KpiCard
          label="Next payout"
          testId="money-next-payout"
          value={next.value}
          detail={next.detail}
        />
      </div>
    </section>
  )
}
