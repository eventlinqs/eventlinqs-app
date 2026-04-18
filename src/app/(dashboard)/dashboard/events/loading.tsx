export default function EventsLoading() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="h-8 w-32 animate-pulse rounded bg-ink-200" />
        <div className="h-10 w-32 animate-pulse rounded bg-ink-200" />
      </div>
      <div className="mb-6 flex gap-1 border-b border-ink-200">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-9 w-20 animate-pulse rounded-t bg-ink-200" />
        ))}
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-16 animate-pulse rounded-lg border border-ink-200 bg-white" />
        ))}
      </div>
    </div>
  )
}
