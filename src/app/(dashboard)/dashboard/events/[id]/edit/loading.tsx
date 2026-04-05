export default function EditEventLoading() {
  return (
    <div>
      <div className="mb-8 h-8 w-40 animate-pulse rounded bg-gray-200" />
      <div className="rounded-xl border border-gray-200 bg-white p-8">
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-200" />
          ))}
        </div>
      </div>
    </div>
  )
}
