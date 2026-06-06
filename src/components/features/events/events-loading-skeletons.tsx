/**
 * In-page loading skeletons for /events browse.
 *
 * These back the page-level <Suspense> boundaries around the popular rail and
 * the results grid (NOT a segment-level loading.tsx - that would wrap the
 * /events/[slug] and /events/browse/[city] child routes and break their hard
 * 404s). The hero strip + filter bar render immediately; only these
 * below-the-shell data regions stream behind a fallback. Brand light-canvas
 * shimmer matching the event-detail + checkout skeletons; dimensions mirror the
 * real RecommendedRail / EventsGrid so the swap into real content is zero-CLS.
 */

/** One card placeholder - shared by the rail + grid skeletons (Surface-1 craft). */
function EventCardSkeleton() {
  return (
    <div className="space-y-3">
      <div className="aspect-[3/2] w-full rounded-xl bg-ink-100 animate-pulse" />
      <div className="h-3 w-20 rounded bg-ink-200/60 animate-pulse" />
      <div className="h-4 w-4/5 rounded bg-ink-200/70 animate-pulse" />
      <div className="h-3 w-3/5 rounded bg-ink-200/40 animate-pulse" />
      <div className="h-3 w-1/3 rounded bg-gold-500/25 animate-pulse" />
    </div>
  )
}

/**
 * Popular-rail fallback. Mirrors RecommendedRail exactly: the bordered canvas
 * section, the heading row, and the horizontal w-64/sm:w-72 card row, so the
 * real rail streams into the same footprint.
 */
export function PopularRailSkeleton() {
  return (
    <section className="border-b border-ink-100 bg-canvas" aria-hidden>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div className="h-6 w-44 rounded bg-ink-200/70 animate-pulse sm:h-7 sm:w-52" />
          <div className="h-4 w-16 shrink-0 rounded bg-ink-200/50 animate-pulse" />
        </div>
        <div className="mt-4 -mx-4 flex items-stretch gap-3 overflow-hidden px-4 pb-2 sm:mx-0 sm:gap-4 sm:px-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-64 shrink-0 sm:w-72">
              <EventCardSkeleton />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Results-grid fallback. Matches EventsGrid's grid template
 * (grid-cols-1 sm:2 lg:3 xl:4, gap-6) and renders inside the page's existing
 * results <section> wrapper, so the gutters and column count line up exactly.
 */
export function EventsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <EventCardSkeleton key={i} />
      ))}
    </div>
  )
}

/**
 * Inline count fallback for the hero strip's "N events available" line. Sized
 * to the text-sm line so the hero never shifts when the real count streams in.
 */
export function EventsCountSkeleton() {
  return (
    <span
      className="inline-block h-3.5 w-32 animate-pulse rounded bg-ink-200/60 align-[-1px]"
      aria-hidden
    />
  )
}
