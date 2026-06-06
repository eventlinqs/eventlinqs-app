import { SiteHeader } from '@/components/layout/site-header'

/**
 * Route-level loading skeleton for /events browse - the entry point of the
 * buyer journey (browse -> detail -> checkout, the other two of which already
 * ship loading.tsx). Shown on in-app navigation into browse.
 *
 * Mirrors the loaded shell exactly so the swap into the real page reads as a
 * settle, not a jump: the same solid SiteHeader chrome, the white hero strip
 * (H1 + subtitle + search) with its border, the sticky filter row, a popular
 * rail, then the 4-up real-photo grid. No spinners; designed shimmer blocks on
 * the brand light canvas (ink-100/200), matching the event-detail + checkout
 * skeletons. Same max-w-7xl gutters as the page, so zero layout shift.
 */
function CardSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="aspect-[3/2] w-full rounded-xl bg-ink-100 animate-pulse" />
      <div className="h-3 w-20 rounded bg-ink-200/60 animate-pulse" />
      <div className="h-4 w-4/5 rounded bg-ink-200/70 animate-pulse" />
      <div className="h-3 w-3/5 rounded bg-ink-200/40 animate-pulse" />
      <div className="h-3 w-1/3 rounded bg-gold-500/25 animate-pulse" />
    </div>
  )
}

export default function EventsBrowseLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas" aria-busy="true" aria-label="Loading events">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero strip - white, bordered, matching EventsHeroStrip */}
        <section className="border-b border-ink-100 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            <div className="h-8 w-64 rounded-lg bg-ink-200/70 animate-pulse sm:h-9 sm:w-80" aria-hidden />
            <div className="mt-2 h-4 w-44 rounded bg-ink-200/50 animate-pulse" aria-hidden />
            <div className="mt-5 h-11 w-full max-w-xl rounded-lg bg-ink-100 animate-pulse" aria-hidden />
          </div>
        </section>

        {/* Filter bar - solid white sticky row of chips + view toggle */}
        <div className="border-b border-ink-100 bg-white">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
            {['w-16', 'w-20', 'w-16', 'w-24'].map((w, i) => (
              <div key={i} className={`h-8 ${w} shrink-0 rounded-full bg-ink-100 animate-pulse`} aria-hidden />
            ))}
            <div className="ml-auto h-8 w-24 shrink-0 rounded-lg bg-ink-100 animate-pulse" aria-hidden />
          </div>
        </div>

        {/* Popular rail - heading + 5-up peeking row */}
        <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="mb-4 h-6 w-48 rounded bg-ink-200/70 animate-pulse" aria-hidden />
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </section>

        {/* Results grid - 4-up real-photo grid */}
        <section aria-label="Loading event results" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
