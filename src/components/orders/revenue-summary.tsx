interface RevenueSummaryProps {
  grossCents: number
  platformFeeCents: number
  processingFeeCents: number
  currency: string
}

function formatCents(cents: number, currency: string) {
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
}

export function RevenueSummary({ grossCents, platformFeeCents, processingFeeCents, currency }: RevenueSummaryProps) {
  const netCents = grossCents - platformFeeCents - processingFeeCents

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-ink-400 uppercase tracking-wider mb-4">Revenue Summary</h3>
      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-ink-600">Gross Sales</span>
          <span className="text-sm font-semibold text-ink-900">{formatCents(grossCents, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-ink-400">Platform fees</span>
          <span className="text-sm text-ink-400">−{formatCents(platformFeeCents, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-ink-400">Processing fees</span>
          <span className="text-sm text-ink-400">−{formatCents(processingFeeCents, currency)}</span>
        </div>
        <div className="border-t border-ink-100 pt-3 flex justify-between">
          <span className="text-sm font-semibold text-ink-900">Net Revenue</span>
          <span className="text-sm font-bold text-green-700">{formatCents(netCents, currency)}</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-400">Payouts are processed after the event</p>
    </div>
  )
}
