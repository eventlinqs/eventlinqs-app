import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { EventsTable } from './events-table'
import type { Event } from '@/types/database'

type FilterTab = 'all' | 'draft' | 'published' | 'past' | 'cancelled'

type Props = {
  searchParams: Promise<{ tab?: string; saved?: string }>
}

export default async function MyEventsPage({ searchParams }: Props) {
  const { tab, saved } = await searchParams
  const activeTab = (tab as FilterTab) ?? 'all'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h2 className="text-xl font-semibold text-gray-900">No Organisation</h2>
        <p className="mt-2 text-gray-500">Create an organisation first to manage events.</p>
        <Link
          href="/dashboard/organisation/create"
          className="mt-6 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Create Organisation
        </Link>
      </div>
    )
  }

  let query = supabase
    .from('events')
    .select('*, ticket_tiers(sold_count, total_capacity)')
    .eq('organisation_id', org.id)
    .order('created_at', { ascending: false })

  const now = new Date().toISOString()

  if (activeTab === 'draft') {
    query = query.eq('status', 'draft')
  } else if (activeTab === 'published') {
    query = query.eq('status', 'published').gte('start_date', now)
  } else if (activeTab === 'past') {
    query = query.lt('start_date', now).in('status', ['published', 'completed'])
  } else if (activeTab === 'cancelled') {
    query = query.eq('status', 'cancelled')
  }

  const { data: events } = await query as { data: (Event & { ticket_tiers: { sold_count: number; total_capacity: number }[] })[] | null }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'published', label: 'Published' },
    { key: 'past', label: 'Past' },
    { key: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <div>
      {saved === '1' && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Event saved successfully.
        </div>
      )}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">My Events</h1>
        <Link
          href="/dashboard/events/create"
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + Create Event
        </Link>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <Link
            key={t.key}
            href={`/dashboard/events?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <EventsTable events={events ?? []} />
    </div>
  )
}
