import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { EventsTable } from './events-table'
import { DashboardEmptyState } from '@/components/dashboard/empty-state'
import { OrganisationSwitcher } from '@/components/organisations/organisation-switcher'
import {
  organisationIdFromParams,
  resolveOrganisationScope,
  withOrganisation,
} from '@/lib/organisations/scope'
import type { Event } from '@/types/database'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'

type FilterTab = 'all' | 'draft' | 'published' | 'past' | 'cancelled'

type Props = {
  searchParams: Promise<{ tab?: string; saved?: string; org?: string }>
}

export default async function MyEventsPage({ searchParams }: Props) {
  const params = await searchParams
  const { tab, saved } = params
  const activeTab = (tab as FilterTab) ?? 'all'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // WHICH business's events. This was `.eq('owner_id', user.id).single()`, which
  // returns PGRST116 and `data: null` rather than a row when the caller owns more
  // than one, so an owner of several businesses was shown "Set up your organisation
  // first" and could not reach a single one of their events.
  const scope = await resolveOrganisationScope(organisationIdFromParams(params))
  const org = scope.ok ? scope.active : null
  const organisationCount = scope.ok ? scope.organisations.length : 0

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

  // EXPLICIT COLUMNS, NOT (*). This result is passed to <EventsTable>, a CLIENT
  // component, so every column crosses into the RSC payload and is readable with
  // view-source. `events` has 64 columns; the table renders nine. ASVS 8.2.3.
  //
  // These are the organiser's own events, so this is not a cross-tenant leak. It
  // is unnecessary width at a trust boundary, and the narrow list also documents
  // what the table actually depends on.
  let query = supabase
    .from('events')
    .select(
      'id, slug, title, status, start_date, venue_city, has_reserved_seating, ticket_tiers(sold_count, total_capacity)',
    )
    .eq('organisation_id', org.id)
    .order('created_at', { ascending: false })

  const now = new Date().toISOString()

  if (activeTab === 'draft') {
    query = query.eq('status', 'draft')
  } else if (activeTab === 'published') {
    query = query.eq('status', 'published').or(listingWindowOrPredicate(new Date(now)))
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
        <h1 className="text-2xl font-bold text-ink-900">My Events</h1>
        <Link
          href={withOrganisation('/dashboard/events/create', org.id, organisationCount)}
          className="rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-medium text-ink-900 hover:bg-gold-600 transition-colors"
        >
          + Create Event
        </Link>
      </div>

      {scope.ok ? (
        <OrganisationSwitcher
          organisations={scope.organisations}
          activeId={org.id}
          basePath="/dashboard/events"
        />
      ) : null}

      {/* Filter tabs. They carry the business, so a tab click cannot silently move
          an owner of several onto a different one. */}
      <div className="mb-6 flex gap-1 border-b border-ink-200">
        {tabs.map(t => (
          <Link
            key={t.key}
            href={withOrganisation(`/dashboard/events?tab=${t.key}`, org.id, organisationCount)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.key
                ? 'border-gold-500 text-gold-500'
                : 'border-transparent text-ink-400 hover:text-ink-600'
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
