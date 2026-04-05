export default function DashboardLoading() {
  return (
    <div className="space-y-8">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="h-4 w-28 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-9 w-16 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  )
}
