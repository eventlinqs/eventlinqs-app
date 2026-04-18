import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { EventsTable } from './events-table'
import { DashboardEmptyState } from '@/components/dashboard/empty-state'
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
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink-900">My events</h1>
        <DashboardEmptyState
          icon={<Building2 className="h-6 w-6" aria-hidden="true" />}
          title="Set up your organisation first"
          description="Your organisation is the brand you publish events under. Create one to start selling tickets."
          primary={{ label: 'Create organisation', href: '/dashboard/organisation/create' }}
          secondary={{ label: 'Browse events', href: '/events' }}
        />
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

  // For reserved seating events, sold count must come from seats table, not ticket_tiers.sold_count
  const reservedEventIds = (events ?? [])
    .filter(e => (e as Event & { has_reserved_seating?: boolean }).has_reserved_seating)
    .map(e => e.id)

  const seatSoldCountMap: Record<string, number> = {}
  if (reservedEventIds.length > 0) {
    // Use admin client so RLS never blocks reading seat counts for the organiser's own events
    const adminClient = createAdminClient()
    const { data: soldSeats } = await adminClient
      .from('seats')
      .select('event_id')
      .in('event_id', reservedEventIds)
      .eq('status', 'sold')
    for (const row of soldSeats ?? []) {
      seatSoldCountMap[row.event_id] = (seatSoldCountMap[row.event_id] ?? 0) + 1
    }
    console.log('[dashboard/events] reservedEventIds:', reservedEventIds)
    console.log('[dashboard/events] seatSoldCountMap:', seatSoldCountMap)
  }

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

      <EventsTable events={events ?? []} seatSoldCountMap={seatSoldCountMap} />
    </div>
  )
}
