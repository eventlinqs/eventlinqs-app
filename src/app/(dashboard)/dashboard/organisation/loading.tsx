export default function OrganisationLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      </div>
    </div>
  )
}
