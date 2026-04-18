import Link from 'next/link'
import { PlusCircle } from 'lucide-react'

function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

type Props = {
  firstName: string
  canCreateEvent?: boolean
}

export function DashboardHero({ firstName, canCreateEvent = true }: Props) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Here is what is happening across your events today.
        </p>
      </div>

      {canCreateEvent && (
        <Link
          href="/dashboard/events/create"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2"
        >
          <PlusCircle className="h-4 w-4" aria-hidden="true" />
          Create event
        </Link>
      )}
    </div>
  )
}
