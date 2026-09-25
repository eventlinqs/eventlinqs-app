import { createClient } from '@/lib/supabase/server'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { chunkInFilterValues } from '@/lib/supabase/in-chunks'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { countOrRaise } from '@/lib/supabase/count-or-raise'
import { redirect } from 'next/navigation'
import { organisationIdFromParams, resolveOrganisationScope } from '@/lib/organisations/scope'
import { OrganisationSwitcher } from '@/components/organisations/organisation-switcher'
import { DashboardHero } from '@/components/dashboard/dashboard-hero'
import { KpiCard } from '@/components/dashboard/kpi-card'
import {
  UpcomingEventsPanel,
  type UpcomingEvent,
} from '@/components/dashboard/upcoming-events-panel'
import {
  RecentActivityPanel,
  type ActivityItem,
} from '@/components/dashboard/recent-activity-panel'
import {
  GetStartedChecklist,
  type ChecklistStatus,
} from '@/components/dashboard/get-started-checklist'
import { QuickActionsPanel } from '@/components/dashboard/quick-actions-panel'
import { OrganiserReferralPanel } from '@/components/dashboard/organiser-referral-panel'
import { organiserReferralUrl } from '@/lib/growth/loops'
import { getSiteUrl } from '@/lib/site-url'
import { AssistantPanel } from '@/components/ai/assistant-panel'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { computeDashboardKpis, DAY_MS } from '@/lib/dashboard/kpis'

type OrderSummary = {
  id: string
  order_number: string
  status: string
  total_cents: number
  currency: string
  confirmed_at: string | null
  created_at: string
  event_id: string
}

function formatCurrency(cents: number, currency: string) {
  const amount = cents / 100
  const code = currency?.toUpperCase() || 'AUD'
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${code} ${amount.toFixed(2)}`
  }
}

/*
 * `bucketByDay` and `pctChange` used to live here. They moved to
 * `@/lib/dashboard/kpis` with the rest of the KPI maths, and are NOT re-exported
 * from this file: two copies of a percentage-change rule is how the same screen
 * ends up disagreeing with itself.
 */

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // WHICH business this dashboard is reporting on. This was
  // `.eq('owner_id', user.id).maybeSingle()`, which returns PGRST116 and
  // `data: null` rather than a row when the caller owns more than one, so an owner
  // of several saw the dashboard of somebody with no organisation at all: no
  // upcoming events, no revenue, no orders.
  //
  // The organisation read needs stripe_onboarding_complete, which is revoked from
  // `authenticated` by column privilege (migration 20260808000010), so the resolver
  // does it with the service role after verifying ownership.
  /*
   * THE PROFILE READ THROWS RATHER THAN DEGRADING, because of what a null does
   * three lines below: `isOrganiser` is derived from `profile.role`, and an
   * organiser whose profile read blinked would be shown the non-organiser
   * dashboard, with their events, revenue and activity absent and nothing on
   * the page saying why. "Hi there" and an empty screen is not a degraded
   * answer, it is a different person's answer.
   */
  const [profile, scope] = await Promise.all([
    readOrThrow('dashboard profile', () =>
      supabase.from('profiles').select('*').eq('id', user.id).single(),
    ),
    resolveOrganisationScope(organisationIdFromParams(await searchParams)),
  ])
  const org = scope.ok ? { id: scope.active.id, stripe_onboarding_complete: scope.active.stripeOnboardingComplete } : null

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const isOrganiser =
    profile?.role === 'organiser' || profile?.role === 'admin' || profile?.role === 'super_admin'

  // ── Fetch organiser KPIs when we have an organisation ────────────────────
  const renderedAt = new Date()
  const now = renderedAt.getTime()
  const since60Days = new Date(now - 60 * DAY_MS).toISOString()
  const nowIso = renderedAt.toISOString()

  let upcomingEvents: UpcomingEvent[] = []
  let upcomingCount = 0

  let ordersLast60: OrderSummary[] = []
  const eventTitleMap = new Map<string, string>()

  if (org) {
    /*
     * Upcoming events (next 5) with ticket_tiers aggregated for sold/capacity.
     * BOUNDED ALREADY by .limit(5), so the ceiling was never the problem here;
     * the discarded error was. A failed read rendered "no upcoming events" to
     * an organiser with a show on Friday, beside a Get Started checklist that
     * invites them to create their first one.
     */
    const evs = await readOrThrow('dashboard upcoming events', () =>
      supabase
        .from('events')
        .select(
          'id, slug, title, start_date, venue_city, cover_image_url, timezone, ticket_tiers(sold_count, total_capacity)',
        )
        .eq('organisation_id', org.id)
        .eq('status', 'published')
        .or(listingWindowOrPredicate(new Date(nowIso)))
        .order('start_date', { ascending: true })
        .limit(5),
    )

    upcomingEvents = (evs ?? []).map((e) => {
      const tiers = (e.ticket_tiers ?? []) as { sold_count: number; total_capacity: number }[]
      const sold = tiers.reduce((sum, t) => sum + (t.sold_count ?? 0), 0)
      const capacity = tiers.reduce((sum, t) => sum + (t.total_capacity ?? 0), 0)
      return {
        id: e.id,
        slug: e.slug,
        title: e.title,
        start_date: e.start_date,
        venue_city: e.venue_city,
        cover_image_url: e.cover_image_url,
        timezone: e.timezone ?? 'Australia/Melbourne',
        ticketsSold: sold,
        ticketsCapacity: capacity,
      }
    })

    // A count that FAILED and a count of zero are the same number on the screen
    // and opposite facts about the business, and this one is rendered as "0
    // upcoming events" on the KPI row. countOrRaise refuses both a failed read
    // and a count that was never asked for.
    upcomingCount = countOrRaise(
      'upcoming published events for this organisation',
      await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', org.id)
        .eq('status', 'published')
        .or(listingWindowOrPredicate(new Date(nowIso))),
    )

    /*
     * RECENT CONFIRMED ORDERS OVER 60 DAYS, AND THE CEILING USED TO EAT THE
     * HALF THIS SCREEN COMPARES AGAINST.
     *
     * This was one unbounded `.select()`. Supabase stops at 1,000 rows in
     * silence, HTTP 200, `error` null, a full-looking array
     * (https://supabase.com/docs/reference/javascript/select, fetched
     * 2026-09-19). What makes that worse than an undercount here is the ORDER:
     * the read is `created_at` DESCENDING, so the server keeps the NEWEST
     * thousand and drops the OLDEST. The oldest rows in a 60-day window are the
     * PRIOR 30 days, and the prior 30 days is the denominator of both deltas
     * computed below:
     *
     *     ticketsDelta = pctChange(ticketsSold30, ticketsSoldPrior)
     *     revenueDelta = pctChange(revenueCents30, revenuePriorCents)
     *
     * So an organiser past a thousand orders in 60 days was not shown a figure
     * that was merely low. They were shown GROWTH THAT WAS TOO HIGH, because
     * last month had been trimmed by the ceiling while this month survived
     * intact, and at the limit a fully truncated prior period makes the
     * comparison meaningless. That is the one wrong answer on this screen that
     * causes an action: it is the number an organiser repeats to a promoter.
     *
     * `error` was discarded too, so an unreachable database rendered an
     * organiser zero revenue, zero tickets and no activity, which on this
     * screen is indistinguishable from an organiser who has sold nothing.
     */
    ordersLast60 = await readEveryRow<OrderSummary>(
      'this organisation’s orders over the last 60 days',
      (from, to) =>
        supabase
          .from('orders')
          .select('id, order_number, status, total_cents, currency, confirmed_at, created_at, event_id')
          .eq('organisation_id', org.id)
          .in('status', ['confirmed', 'partially_refunded', 'refunded'])
          .gte('created_at', since60Days)
          .order('id', { ascending: true })
          .range(from, to),
    )
    /*
     * SORTED AFTER THE READ, NOT DURING IT. The page wants newest first; ranged
     * paging wants a TOTAL order, and `created_at` is not unique, so paging on
     * it may return one row in two windows and another in none. Paging on the
     * primary key and sorting here costs nothing and cannot lose a row.
     */
    ordersLast60.sort((a, b) => b.created_at.localeCompare(a.created_at))

    // Fetch event titles referenced by these orders for activity subtitles.
    // CHUNKED: the id list is spelled into the URL and Supabase bounds URL and
    // headers together at 16 KB. A missing title renders as "Your event"
    // against a real order, so a short read here mislabels rather than hides.
    const eventIds = [...new Set(ordersLast60.map((o) => o.event_id))]
    for (const chunk of chunkInFilterValues(eventIds)) {
      const eventsForActivity = await readEveryRow<{ id: string; title: string }>(
        'the events those orders belong to',
        (from, to) =>
          supabase
            .from('events')
            .select('id, title')
            .in('id', chunk)
            .order('id', { ascending: true })
            .range(from, to),
      )
      for (const e of eventsForActivity) {
        eventTitleMap.set(e.id, e.title)
      }
    }
  }

  /*
   * COMPUTE KPIs. The maths lives in `@/lib/dashboard/kpis` so it can be put
   * under test: it is the part of this screen that was wrong, and it was wrong
   * in the flattering direction. Its header carries the reasoning; the tests
   * feed it the whole 60 days and then the truncated tail and assert the two
   * disagree.
   */
  const {
    ticketsSold30,
    revenueCents30,
    ticketsDelta,
    revenueDelta,
    ticketsSparkline,
    revenueSparkline,
    currency,
  } = computeDashboardKpis(ordersLast60, now)

  const revenueFormatted = formatCurrency(revenueCents30, currency)

  // ── Recent activity (up to 10 items) ─────────────────────────────────────
  const recentActivity: ActivityItem[] = ordersLast60.slice(0, 10).map((o) => {
    const isRefund = o.status === 'refunded' || o.status === 'partially_refunded'
    const title = isRefund
      ? `Order ${o.order_number} refunded`
      : `Order ${o.order_number} confirmed`
    const eventTitle = eventTitleMap.get(o.event_id) ?? 'Your event'
    const amount = formatCurrency(o.total_cents, o.currency)

    return {
      id: o.id,
      type: isRefund ? 'order_refunded' : 'order_confirmed',
      title,
      subtitle: `${eventTitle} · ${amount}`,
      occurredAt: o.confirmed_at ?? o.created_at,
      href: `/dashboard/events/${o.event_id}/orders/${o.id}`,
    }
  })

  // ── Checklist status (only relevant to organiser w/ no events) ────────────
  const { count: totalEventsCount } = org
    ? await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', org.id)
    : { count: 0 }

  const { count: publishedEventsCount } = org
    ? await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', org.id)
        .eq('status', 'published')
    : { count: 0 }

  const checklistStatus: ChecklistStatus = {
    verifyEmail: Boolean(user.email_confirmed_at),
    createOrganisation: Boolean(org),
    connectPayouts: Boolean(org?.stripe_onboarding_complete),
    publishFirstEvent: (publishedEventsCount ?? 0) > 0,
  }

  const showChecklist =
    isOrganiser && (!org || (totalEventsCount ?? 0) === 0 || !checklistStatus.connectPayouts)

  return (
    <div className="space-y-8">
      <DashboardHero firstName={firstName} canCreateEvent={isOrganiser} />

      {/* Every number below belongs to ONE business. An owner of several has to be
          able to see which one, and change it, or the figures are unreadable. */}
      {scope.ok && org ? (
        <OrganisationSwitcher
          organisations={scope.organisations}
          activeId={org.id}
          basePath="/dashboard"
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tickets sold (30d)"
          testId="tickets-30"
          value={ticketsSold30.toLocaleString('en-AU')}
          delta={ticketsDelta !== null ? { value: ticketsDelta } : null}
          sparkline={ticketsSparkline}
          emptyHint={isOrganiser ? 'Sales will appear here' : 'No organiser data'}
        />
        <KpiCard
          label="Revenue (30d)"
          testId="revenue-30"
          value={revenueFormatted}
          delta={revenueDelta !== null ? { value: revenueDelta } : null}
          sparkline={revenueSparkline}
          emptyHint={isOrganiser ? 'Revenue will appear here' : 'No organiser data'}
        />
        <KpiCard
          label="Upcoming events"
          testId="upcoming-events"
          value={upcomingCount.toLocaleString('en-AU')}
          emptyHint="None scheduled yet"
        />
        <KpiCard
          label="Total events"
          testId="total-events"
          value={(totalEventsCount ?? 0).toLocaleString('en-AU')}
          emptyHint="Create your first event"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <UpcomingEventsPanel events={upcomingEvents} />
          <RecentActivityPanel activity={recentActivity} />
        </div>
        <div className="space-y-6">
          {showChecklist && <GetStartedChecklist status={checklistStatus} />}
          {showChecklist && (
            <AssistantPanel
              assistant="organiser-onboarding"
              title="Your setup guide"
              intro="Ask anything about getting set up and getting your first event live."
              placeholder="Ask about setup, events, or payouts"
              starters={[
                'Walk me through getting my first event live',
                'Help me write a great event description',
                'How do payouts work?',
              ]}
            />
          )}
          <QuickActionsPanel />
          {/* PL1, the fourth loop. Built on the server because the link carries
           *  a code derived from the profile id, and the browser has no business
           *  holding the encoder. */}
          <OrganiserReferralPanel link={organiserReferralUrl(getSiteUrl(), user.id)} />
        </div>
      </div>
    </div>
  )
}
