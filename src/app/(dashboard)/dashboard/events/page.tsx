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
import { ARCHIVED_STATUS } from '@/lib/event-lifecycle'
import { judgeDeleteEligibility, readMoneyRecordCountsMany } from '@/lib/events/delete-eligibility'
import { readSeatStatusCountsMany } from '@/lib/events/seat-counts'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import type { LifecycleEligibility } from '@/components/features/dashboard/event-lifecycle-actions'

type FilterTab = 'all' | 'draft' | 'published' | 'past' | 'cancelled' | 'archived'

type Props = {
  searchParams: Promise<{ tab?: string; saved?: string; deleted?: string; org?: string }>
}

export default async function MyEventsPage({ searchParams }: Props) {
  const params = await searchParams
  const { tab, saved, deleted } = params
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
  const now = new Date().toISOString()

  /*
   * THE LIST ITSELF IS PAGED, AND IT IS BUILT BY A FUNCTION FOR THAT REASON.
   *
   * A PostgREST builder is a thenable and resolves once, so a pager cannot be
   * handed the same `query` object twice: the second `.range()` never reissues
   * it and page one comes back for ever. The filter is therefore built afresh
   * for each window. The chain is byte for byte the one that was here, with
   * `id` appended to the order so the paging is a total order, and the tab
   * predicates in the same sequence.
   *
   * ARCHIVED EVENTS LEAVE THE DEFAULT LIST (close-out C13.4). Every tab but the
   * Archived one excludes them, so an organiser's working list is what they are
   * working on, and the Archived tab is where a restore starts.
   */
  const eventsPage = (from: number, to: number) => {
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
        'id, slug, title, status, archived_from_status, start_date, venue_city, has_reserved_seating, ticket_tiers(sold_count, total_capacity)',
      )
      .eq('organisation_id', org.id)
      /*
       * THE ORDER AND THE WINDOW SIT IN THE OPENING CHAIN, NOT AT THE END.
       *
       * A PostgREST builder accumulates parameters and issues one request when
       * it is awaited, so where in the chain `.order()` and `.range()` are
       * called makes no difference to the request. It makes a difference to a
       * READER, and to `scripts/guards/lib/supabase-select-chains.mjs`, which
       * follows a chain across `.method(...)` links and cannot follow one that
       * continues through a reassigned variable. A bound that a scanner cannot
       * see is a bound the next guard cannot enforce.
       */
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)

    if (activeTab === 'archived') {
      query = query.eq('status', ARCHIVED_STATUS)
    } else {
      query = query.neq('status', ARCHIVED_STATUS)
      if (activeTab === 'draft') {
        query = query.eq('status', 'draft')
      } else if (activeTab === 'published') {
        query = query.eq('status', 'published').or(listingWindowOrPredicate(new Date(now)))
      } else if (activeTab === 'past') {
        query = query.lt('start_date', now).in('status', ['published', 'completed'])
      } else if (activeTab === 'cancelled') {
        query = query.eq('status', 'cancelled')
      }
    }

    return query
  }

  const events = await readEveryRow<Event & { ticket_tiers: { sold_count: number; total_capacity: number }[] }>(
    'organiser events list',
    eventsPage as (from: number, to: number) => PromiseLike<{
      data: (Event & { ticket_tiers: { sold_count: number; total_capacity: number }[] })[] | null
      error: { message: string } | null
    }>,
  )

  /*
   * FOR RESERVED-SEATING EVENTS THE SOLD COUNT COMES FROM THE SEATS, AND THE
   * DATABASE DOES THE COUNTING.
   *
   * This used to read one row per sold seat and tally them here:
   *
   *     .from('seats').select('event_id').in('event_id', reservedEventIds)
   *       .eq('status', 'sold')
   *     for (const row of soldSeats ?? []) map[row.event_id] += 1
   *
   * Supabase caps a response at 1,000 rows in silence (HTTP 200, `error` null,
   * a full-looking array; https://supabase.com/docs/reference/javascript/select,
   * fetched 2026-09-19). The cap is on the RESPONSE, not on each event, so the
   * thousand was shared across every reserved-seating event at once: two
   * sold-out 800-seat shows reported 1,000 sold between them. There was no
   * `order by`, so which thousand arrived was arbitrary and the shortfall moved
   * between page loads. And the error was dropped, so a read that FAILED
   * rendered as nought sold on every row.
   *
   * One RPC, counted by the database, cannot be truncated. A failure now leaves
   * the map EMPTY and the column says so, because nought sold and could-not-be
   * -read are different facts and an organiser is owed the difference.
   */
  const reservedEventIds = events
    .filter(e => (e as Event & { has_reserved_seating?: boolean }).has_reserved_seating)
    .map(e => e.id)

  const seatSoldCountMap: Record<string, number> = {}
  if (reservedEventIds.length > 0) {
    // Admin client so RLS never blocks the organiser's own events.
    const adminClient = createAdminClient()
    try {
      const counts = await readSeatStatusCountsMany(adminClient, reservedEventIds)
      for (const [id, c] of counts) {
        seatSoldCountMap[id] = c.byStatus.sold ?? 0
      }
    } catch (err) {
      console.error('[dashboard/events] could not count sold seats; the column reads Unknown:', err)
    }
  }

  /*
   * MAY EACH EVENT BE DELETED. One round trip through the database's own count
   * of money records (event_money_record_counts_many), under the organiser's
   * session so the function's per-event authorisation applies. If the count
   * cannot be read, NO event offers Delete: an unknown must never read as
   * "nothing sold". The failure is logged, never swallowed.
   */
  const eligibilityById: Record<string, LifecycleEligibility> = {}
  const ids = events.map((e) => e.id)
  if (ids.length > 0) {
    try {
      const counts = await readMoneyRecordCountsMany(supabase, ids)
      for (const [id, c] of counts) {
        const judged = judgeDeleteEligibility(c)
        eligibilityById[id] = { deletable: judged.deletable, reasons: judged.reasons }
      }
    } catch (err) {
      console.error('[dashboard/events] could not read money record counts; Delete is not offered:', err)
    }
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'published', label: 'Published' },
    { key: 'past', label: 'Past' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'archived', label: 'Archived' },
  ]

  return (
    <div>
      {saved === '1' && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Event saved successfully.
        </div>
      )}
      {deleted === '1' && (
        <div role="status" className="mb-6 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900">
          The event was deleted. Nothing of it remains.
        </div>
      )}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-ink-900 sm:text-3xl">My Events</h1>
        <Link
          href={withOrganisation('/dashboard/events/create', org.id, organisationCount)}
          className="inline-flex min-h-11 items-center rounded-lg bg-gold-500 px-4 text-sm font-medium text-ink-900 hover:bg-gold-600 transition-colors"
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
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-ink-200">
        {tabs.map(t => (
          <Link
            key={t.key}
            href={withOrganisation(`/dashboard/events?tab=${t.key}`, org.id, organisationCount)}
            className={`inline-flex min-h-11 items-center whitespace-nowrap px-4 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t.key
                // Gold TEXT on a light surface is the strong tier (gold-800), never
                // gold-500: axe measured the old class at a serious contrast failure.
                ? 'border-gold-500 text-[var(--brand-accent-strong)]'
                : 'border-transparent text-ink-600 hover:text-ink-900'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <EventsTable
        events={events}
        seatSoldCountMap={seatSoldCountMap}
        eligibilityById={eligibilityById}
        emptyTab={activeTab}
      />
    </div>
  )
}
