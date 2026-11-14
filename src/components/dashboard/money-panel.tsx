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

function nextPayoutCard(summary: OrganiserMoneySummary): { value: string; detail: string; action?: { label: string; href: string } } {
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
      // Leaders' wording for this moment (EL-SELLING-PATH-14NOV/copy-sources.md): a payout method, added and verified.
      return {
        value: 'Payout method needed',
        detail: `${amount} is paid once your payout method is added and verified`,
        action: { label: 'Add payout method', href: '/dashboard/payouts' },
      }
  }
}

/**
 * `actionInBanner`: the dashboard's payout banner carries "Add payout method" while a method is needed, so the Next
 * payout card keeps its words and drops its own button (the PM's score of 15 November 2026, D1: one action, one
 * button). Anywhere without the banner the card keeps the button.
 */
export function MoneyPanel({ summary, actionInBanner = false }: { summary: OrganiserMoneySummary; actionInBanner?: boolean }) {
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
      {/* D2 (15 November 2026): Sales and Refunds side by side as compact tiles at 390; Paid out and Next payout
          full width there, as they carry sentences. From sm up, two and then four across as before. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          compact
          label="Sales"
          testId="money-sales"
          value={money(summary.salesCents, summary.currency)}
          caption={summary.salesCount > 0 ? `${summary.salesCount} order${summary.salesCount === 1 ? '' : 's'}` : 'Your share of each sale'}
        />
        <KpiCard
          compact
          label="Refunds"
          testId="money-refunds"
          value={money(summary.refundedCents, summary.currency)}
          caption={summary.refundCount > 0 ? `${summary.refundCount} refund${summary.refundCount === 1 ? '' : 's'}` : 'No refunds'}
        />
        <KpiCard
          className="col-span-2 sm:col-span-1"
          label="Paid out"
          testId="money-paid-out"
          value={money(summary.paidOutCents, summary.currency)}
          detail={
            summary.heldCents > 0
              ? `${money(summary.heldCents, summary.currency)} held for your payout${summary.reserveCents > 0 ? `, ${money(summary.reserveCents, summary.currency)} for refunds` : ''}`
              : 'Paid after each event ends'
          }
        />
        <KpiCard
          className="col-span-2 sm:col-span-1"
          label="Next payout"
          testId="money-next-payout"
          value={next.value}
          detail={next.detail}
          action={actionInBanner ? null : (next.action ?? null)}
        />
      </div>
    </section>
  )
}
