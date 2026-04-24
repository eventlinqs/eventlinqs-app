function CardSkeleton() {
  return (
    <div
      className="w-64 shrink-0 snap-start overflow-hidden rounded-xl bg-ink-100 sm:w-72"
      aria-hidden
    >
      <div className="aspect-[16/10] bg-ink-200/60 animate-pulse" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-3/4 rounded bg-ink-200/60 animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-ink-200/40 animate-pulse" />
      </div>
    </div>
  )
}

function GridCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl bg-ink-100" aria-hidden>
      <div className="aspect-[16/10] bg-ink-200/60 animate-pulse" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-3/4 rounded bg-ink-200/60 animate-pulse" />
        <div className="h-3 w-1/2 rounded bg-ink-200/40 animate-pulse" />
        <div className="h-3 w-1/3 rounded bg-ink-200/40 animate-pulse" />
      </div>
    </div>
  )
}

export function EventsRecommendedSkeleton() {
  return (
    <section
      aria-label="Recommended events — loading"
      className="border-b border-ink-100 bg-canvas"
    >
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <div className="h-6 w-48 rounded bg-ink-200/60 animate-pulse sm:h-7" />
          <div className="h-4 w-16 rounded bg-ink-200/40 animate-pulse" />
        </div>
        <div className="mt-4 -mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:gap-4 sm:px-0">
          {[0, 1, 2, 3, 4].map(i => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

export function EventsResultsSkeleton() {
  return (
    <section
      aria-label="Event results — loading"
      className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <GridCardSkeleton key={i} />
        ))}
      </div>
    </section>
  )
}
