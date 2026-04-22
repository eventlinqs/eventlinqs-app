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
        <h2 className="mt-5 font-display text-xl font-bold text-ink-900">
          Insights are coming soon
        </h2>
        <p className="mt-2 max-w-md text-sm text-ink-600">
          Real-time sales, cohort analysis and ticket-velocity charts for every event
          you run are being built. Your event pages already track sales in real time.
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
