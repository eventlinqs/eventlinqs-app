/**
 * Route-level loading skeleton for checkout - the payment step of the
 * buyer journey. Shown on navigation from the event detail / ticket
 * selection into checkout, so the transition is a designed settle, not a
 * blank flash. Mirrors the page grid (form column + trust sidebar) on the
 * light canvas; no spinners.
 */
export default function CheckoutLoading() {
  return (
    <div
      className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_320px] lg:gap-12 lg:px-8 lg:py-12"
      aria-busy="true"
      aria-label="Loading checkout"
    >
      {/* Form column */}
      <div className="min-w-0 space-y-6">
        {/* Order summary */}
        <div className="space-y-4 rounded-2xl border border-ink-200 bg-white p-6">
          <div className="h-6 w-48 rounded bg-ink-200/70 animate-pulse" aria-hidden />
          <div className="h-px w-full bg-ink-100" aria-hidden />
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center justify-between">
              <div className="h-4 w-40 rounded bg-ink-200/60 animate-pulse" aria-hidden />
              <div className="h-4 w-16 rounded bg-ink-200/50 animate-pulse" aria-hidden />
            </div>
          ))}
          <div className="h-px w-full bg-ink-100" aria-hidden />
          <div className="flex items-center justify-between">
            <div className="h-5 w-20 rounded bg-ink-200/70 animate-pulse" aria-hidden />
            <div className="h-5 w-24 rounded bg-ink-200/70 animate-pulse" aria-hidden />
          </div>
        </div>
        {/* Payment fields */}
        <div className="space-y-4 rounded-2xl border border-ink-200 bg-white p-6">
          <div className="h-5 w-32 rounded bg-ink-200/70 animate-pulse" aria-hidden />
          {[0, 1].map(i => (
            <div key={i} className="h-12 w-full rounded-lg bg-ink-100 animate-pulse" aria-hidden />
          ))}
          <div className="grid grid-cols-2 gap-4">
            <div className="h-12 rounded-lg bg-ink-100 animate-pulse" aria-hidden />
            <div className="h-12 rounded-lg bg-ink-100 animate-pulse" aria-hidden />
          </div>
          <div className="h-12 w-full rounded-lg bg-gold-500/30 animate-pulse" aria-hidden />
        </div>
      </div>
      {/* Trust sidebar */}
      <aside className="order-2 lg:order-1">
        <div className="space-y-4 rounded-2xl border border-ink-200 bg-white p-6">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-ink-100 animate-pulse" aria-hidden />
              <div className="h-4 flex-1 rounded bg-ink-200/50 animate-pulse" aria-hidden />
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
