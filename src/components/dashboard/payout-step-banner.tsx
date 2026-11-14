/**
 * THE ONE STEP FIRST (the PM's score of 14 November 2026, 22:42, fix 6). An organiser who has sold before adding a
 * payout method saw that step about 1,450 px down the 390 dashboard. It sits here, under the greeting and above the
 * numbers, in the leaders' words ("Add a payout method", copy-sources.md), and only while the money panel's next payout
 * reads "Payout method needed": it goes as soon as a method is added. It stays on the Next payout card too.
 */
export function PayoutStepBanner() {
  return (
    <div
      className="flex flex-col gap-3 rounded-2xl border border-gold-500/40 bg-gold-100/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      data-payout-step-banner
    >
      <p className="text-sm text-ink-900">
        <span className="font-semibold">Payout method needed.</span> Add a payout method to receive your ticket sales
        after your event.
      </p>
      <a
        href="/dashboard/payouts"
        className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg bg-gold-500 px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/40"
      >
        Add payout method
      </a>
    </div>
  )
}
