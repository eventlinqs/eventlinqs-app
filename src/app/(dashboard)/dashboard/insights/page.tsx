import Link from 'next/link'
import { BarChart3 } from 'lucide-react'

export const metadata = {
  title: 'Insights | EventLinqs Dashboard',
}

export default function InsightsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">Insights</h1>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-gold-600">
          <BarChart3 className="h-6 w-6" aria-hidden="true" />
        </div>
        {/* This read "Insights are coming soon", which Law 1 names as a defect
          * by definition and which promises a delivery nobody has committed to.
          * The honest version points at the numbers that already exist today
          * rather than at ones that might exist later. Nothing is invented:
          * per-event sales and the reach panel are both live surfaces. */}
        <h2 className="mt-5 font-display text-xl font-bold text-ink-900">
          Your numbers live on each event
        </h2>
        <p className="mt-2 max-w-md text-sm text-ink-600">
          Every event you run tracks its sales, its remaining capacity and the reach of
          each shared link, on the event itself. Open an event to see how it is going.
        </p>
        <Link
          href="/dashboard/events"
          className="mt-6 inline-flex items-center rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-600"
        >
          View my events
        </Link>
      </div>
    </div>
  )
}
