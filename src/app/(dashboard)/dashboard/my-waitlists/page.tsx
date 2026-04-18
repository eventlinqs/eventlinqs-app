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
        <h1 className="text-2xl font-bold text-ink-900">My Waitlists</h1>
        <Link
          href="/events"
          className="text-sm text-gold-500 hover:text-gold-600 transition-colors"
        >
          Browse Events →
        </Link>
      </div>

      {waitlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white px-6 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-gold-600">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
          </div>
          <h2 className="mt-5 font-display text-lg font-semibold text-ink-900">You are not on any waitlists</h2>
          <p className="mt-1 max-w-md text-sm text-ink-600">
            When an event sells out you can join its waitlist from the event page. We will notify you if spots open up.
          </p>
          <Link
            href="/events"
            className="mt-6 inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg"
          >
            Browse sold-out events
          </Link>
        </div>
      ) : (
        <WaitlistDashboardClient initialWaitlists={waitlists} />
      )}
    </div>
  )
}
