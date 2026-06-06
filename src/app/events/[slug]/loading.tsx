/**
 * Route-level loading skeleton for the event detail page - the first step
 * of the buyer journey. Shown on in-app navigation (browse -> detail).
 *
 * Mirrors the loaded layout: a dark photo+overlay hero (an allowed dark
 * surface) over the light, two-column content with a sticky ticket panel,
 * so the swap into the real page reads as a settle rather than a jump. No
 * spinners; designed shimmer blocks on the brand palette.
 */
export default function EventDetailLoading() {
  return (
    <div className="min-h-screen bg-canvas" aria-busy="true" aria-label="Loading event">
      {/* Hero - dark to match the loaded photo+overlay hero (no tone jump) */}
      <section className="relative flex min-h-[55vh] items-end overflow-hidden bg-navy-950 md:min-h-[70vh]">
        {/* Subtle warm gold sheen - the EventLinqs touch */}
        <div
          className="pointer-events-none absolute"
          style={{
            top: '-20%', right: '-10%', width: '60%', height: '140%',
            background: 'radial-gradient(ellipse 70% 60% at 100% 50%, var(--brand-accent), transparent 62%)',
            opacity: 0.08,
          }}
          aria-hidden
        />
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-14 sm:px-6 lg:px-8 lg:pb-20">
          <div className="max-w-3xl space-y-4">
            <div className="h-6 w-28 rounded-full bg-white/10 animate-pulse" aria-hidden />
            <div className="h-11 w-3/4 rounded-lg bg-white/15 animate-pulse" aria-hidden />
            <div className="h-11 w-1/2 rounded-lg bg-white/10 animate-pulse" aria-hidden />
            <div className="flex flex-wrap gap-4 pt-2">
              <div className="h-4 w-40 rounded bg-white/10 animate-pulse" aria-hidden />
              <div className="h-4 w-32 rounded bg-white/10 animate-pulse" aria-hidden />
            </div>
            <div className="flex items-center gap-3 pt-4">
              <div className="h-12 w-44 rounded-lg bg-gold-500/30 animate-pulse" aria-hidden />
              <div className="h-5 w-24 rounded bg-white/10 animate-pulse" aria-hidden />
            </div>
          </div>
        </div>
      </section>

      {/* Content - light, two-column with sticky ticket panel */}
      <section className="bg-canvas pt-12 sm:pt-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-10 lg:flex-row">
            {/* Main column */}
            <div className="min-w-0 flex-1 space-y-10">
              {/* About */}
              <div className="space-y-3">
                <div className="h-7 w-40 rounded bg-ink-200/70 animate-pulse" aria-hidden />
                <div className="h-4 w-full rounded bg-ink-200/50 animate-pulse" aria-hidden />
                <div className="h-4 w-11/12 rounded bg-ink-200/50 animate-pulse" aria-hidden />
                <div className="h-4 w-4/5 rounded bg-ink-200/50 animate-pulse" aria-hidden />
              </div>
              {/* When / Where cards */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {[0, 1].map(i => (
                  <div key={i} className="space-y-3 rounded-2xl border border-ink-200 bg-white p-5">
                    <div className="h-3 w-20 rounded bg-ink-200/60 animate-pulse" aria-hidden />
                    <div className="h-4 w-40 rounded bg-ink-200/60 animate-pulse" aria-hidden />
                    <div className="h-3 w-32 rounded bg-ink-200/40 animate-pulse" aria-hidden />
                  </div>
                ))}
              </div>
              {/* Venue map */}
              <div className="h-56 rounded-2xl border border-ink-200 bg-ink-100 animate-pulse" aria-hidden />
            </div>
            {/* Sticky ticket panel */}
            <aside className="w-full lg:w-[360px] lg:shrink-0">
              <div className="space-y-4 rounded-2xl border border-ink-200 bg-white p-6">
                <div className="h-5 w-32 rounded bg-ink-200/70 animate-pulse" aria-hidden />
                <div className="h-px w-full bg-ink-100" aria-hidden />
                {[0, 1].map(i => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 w-3/4 rounded bg-ink-200/60 animate-pulse" aria-hidden />
                    <div className="h-3 w-1/3 rounded bg-ink-200/40 animate-pulse" aria-hidden />
                  </div>
                ))}
                <div className="h-12 w-full rounded-lg bg-gold-500/30 animate-pulse" aria-hidden />
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  )
}
