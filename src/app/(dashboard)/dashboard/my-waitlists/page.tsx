import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getMyWaitlists } from '@/app/actions/waitlist'
import { WaitlistDashboardClient } from './waitlist-dashboard-client'

export default async function MyWaitlistsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const waitlists = await getMyWaitlists(user.id)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Waitlists</h1>
        <Link
          href="/events"
          className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          Browse Events →
        </Link>
      </div>

      {waitlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
            <svg className="h-7 w-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">You&apos;re not on any waitlists yet</p>
          <p className="mt-1 text-xs text-gray-400">
            When a sold-out event has a waitlist, you can join from the event page.
          </p>
          <Link
            href="/events"
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Browse Events
          </Link>
        </div>
      ) : (
        <WaitlistDashboardClient initialWaitlists={waitlists} />
      )}
    </div>
  )
}
