export default function OrganisationLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-ink-200" />
      <div className="rounded-xl border border-ink-200 bg-white p-6">
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-ink-200" />
          ))}
        </div>
      </div>
    </div>
  )
}
