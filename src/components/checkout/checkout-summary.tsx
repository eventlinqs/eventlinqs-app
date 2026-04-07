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

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Order Summary</h2>
      <p className="text-sm text-gray-500 mb-4">{eventTitle}</p>

      {venue && <p className="text-xs text-gray-400 mb-4">{venue} · {eventDate}</p>}

      {/* Ticket lines */}
      <div className="space-y-2 mb-4">
        {bd.tickets.map((t, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-700">{t.name} × {t.qty}</span>
            <span className="text-gray-900 font-medium">{formatCents(t.line_total_cents, currency)}</span>
          </div>
        ))}

        {bd.addons.map((a, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-gray-700">{a.name} × {a.qty}</span>
            <span className="text-gray-900 font-medium">{formatCents(a.line_total_cents, currency)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-3 space-y-2">
        <div className="flex justify-between text-sm text-gray-600">
          <span>Subtotal</span>
          <span>{formatCents(bd.subtotal, currency)}</span>
        </div>

        {bd.discount > 0 && (
          <div className="flex justify-between text-sm text-green-700">
            <span>Discount</span>
            <span>−{formatCents(bd.discount, currency)}</span>
          </div>
        )}

        {bd.fees > 0 && (
          <div className="flex justify-between text-sm text-gray-500">
            <span>Service fee</span>
            <span>{formatCents(bd.fees, currency)}</span>
          </div>
        )}

        {bd.tax > 0 && (
          <div className="flex justify-between text-sm text-gray-500">
            <span>Tax (GST)</span>
            <span>{formatCents(bd.tax, currency)}</span>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 mt-3 pt-3 flex justify-between">
        <span className="text-base font-bold text-gray-900">Total</span>
        <span className="text-base font-bold text-gray-900">{formatCents(bd.total, currency)}</span>
      </div>

      {fees.fee_pass_type === 'absorb' && (
        <p className="mt-2 text-xs text-gray-400">All fees included in ticket price</p>
      )}
    </div>
  )
}
