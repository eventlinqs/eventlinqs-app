import type { FeeBreakdown } from '@/lib/payments/payment-calculator'

interface CheckoutSummaryProps {
  fees: FeeBreakdown
  eventTitle: string
  eventDate: string
  venue: string | null
}

function formatCents(cents: number, currency: string) {
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`
}

export function CheckoutSummary({ fees, eventTitle, eventDate, venue }: CheckoutSummaryProps) {
  const { breakdown_display: bd, currency } = fees
  const hasLineItems = bd.tickets.length > 0 || bd.addons.length > 0

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink-900">Order summary</h2>
          <p className="text-sm text-ink-600 mt-0.5 truncate">{eventTitle}</p>
          {(venue || eventDate) && (
            <p className="text-xs text-ink-400 mt-0.5">
              {[venue, eventDate].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Ticket + addon lines */}
      {hasLineItems && (
        <div className="space-y-2 border-t border-ink-100 pt-4 mb-4">
          {bd.tickets.map((t, i) => (
            <div key={`t-${i}`} className="flex justify-between gap-3 text-sm">
              <span className="text-ink-600 min-w-0 truncate">{t.name} <span className="text-ink-400">× {t.qty}</span></span>
              <span className="text-ink-900 font-semibold tabular-nums shrink-0">{formatCents(t.line_total_cents, currency)}</span>
            </div>
          ))}

          {bd.addons.map((a, i) => (
            <div key={`a-${i}`} className="flex justify-between gap-3 text-sm">
              <span className="text-ink-600 min-w-0 truncate">{a.name} <span className="text-ink-400">× {a.qty}</span></span>
              <span className="text-ink-900 font-semibold tabular-nums shrink-0">{formatCents(a.line_total_cents, currency)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-ink-100 pt-3 space-y-1.5">
        <div className="flex justify-between text-sm text-ink-600">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCents(bd.subtotal, currency)}</span>
        </div>

        {bd.discount > 0 && (
          <div className="flex justify-between text-sm text-success font-medium">
            <span>Discount</span>
            <span className="tabular-nums">−{formatCents(bd.discount, currency)}</span>
          </div>
        )}

        {bd.platform_fee > 0 && (
          <div className="flex justify-between text-sm text-ink-600">
            <span>Service fee</span>
            <span className="tabular-nums">{formatCents(bd.platform_fee, currency)}</span>
          </div>
        )}

        {bd.processing_fee > 0 && (
          <div className="flex justify-between text-sm text-ink-600">
            <span>Payment processing fee</span>
            <span className="tabular-nums">{formatCents(bd.processing_fee, currency)}</span>
          </div>
        )}

        {bd.tax > 0 && (
          <div className="flex justify-between text-sm text-ink-600">
            <span>Tax (GST)</span>
            <span className="tabular-nums">{formatCents(bd.tax, currency)}</span>
          </div>
        )}
      </div>

      <div className="mt-3 border-t-2 border-ink-900 pt-3 flex justify-between items-baseline">
        <span className="text-sm font-bold uppercase tracking-wider text-ink-900">Total</span>
        <span className="text-xl font-extrabold text-ink-900 tabular-nums">{formatCents(bd.total, currency)}</span>
      </div>

      {fees.fee_pass_type === 'absorb' && (
        <p className="mt-2 text-xs text-ink-400">All fees included in ticket price</p>
      )}

      {/* Trust signal */}
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-ink-100/60 px-3 py-2 text-[11px] text-ink-600">
        <svg className="h-3.5 w-3.5 shrink-0 text-gold-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span>Secure checkout · payment encrypted end-to-end</span>
      </div>
    </div>
  )
}
