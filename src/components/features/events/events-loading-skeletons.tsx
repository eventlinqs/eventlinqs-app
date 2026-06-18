/**
 * In-page loading skeletons for /events browse.
 *
 * These back the page-level <Suspense> boundaries around the results grid and
 * the hero count (NOT a segment-level loading.tsx - that would wrap the
 * /events/[slug] and /events/browse/[city] child routes and break their hard
 * 404s). The hero strip, filter bar, AND popular rail render immediately (the
 * rail's first card image is the LCP, kept parse-discoverable); only the
 * below-the-fold results grid + the hero count streams behind a fallback. Brand
 * light-canvas shimmer matching the event-detail + checkout skeletons;
 * dimensions mirror the real EventsGrid so the swap to real content is zero-CLS.
 */

/** One card placeholder for the results-grid skeleton (Surface-1 craft). */
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
