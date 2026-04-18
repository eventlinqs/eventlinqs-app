import Link from 'next/link'
import { Wallet } from 'lucide-react'

export const metadata = {
  title: 'Payouts | EventLinqs Dashboard',
}

export default function PayoutsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">Payouts</h1>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-gold-600">
          <Wallet className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-5 font-display text-xl font-bold text-ink-900">
          Payouts dashboard coming soon
        </h2>
        <p className="mt-2 max-w-md text-sm text-ink-600">
          Stripe Connect is being wired for organiser payouts. Transparent fees,
          per-event breakdowns and payout schedules will all live here.
        </p>
        <Link
          href="/dashboard/events"
          className="mt-6 inline-flex items-center rounded-lg bg-gold-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gold-600"
        >
          View my events
        </Link>
      </div>
    </div>
  )
}
