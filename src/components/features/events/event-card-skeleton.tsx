export function EventCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col overflow-hidden rounded-lg border border-ink-100 bg-white shadow-sm"
    >
      <div className="aspect-video animate-pulse bg-ink-100 md:aspect-[4/3]" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="h-3 w-24 animate-pulse rounded bg-ink-100" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-ink-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-ink-100" />
        <div className="mt-auto pt-3">
          <div className="h-4 w-20 animate-pulse rounded bg-ink-100" />
        </div>
      </div>
    </div>
  )
}
