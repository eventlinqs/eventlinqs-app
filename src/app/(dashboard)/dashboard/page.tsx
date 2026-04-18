import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
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

const DAY_MS = 24 * 60 * 60 * 1000

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

function bucketByDay(items: { at: string; value: number }[], days: number) {
  const buckets = new Array(days).fill(0)
  const end = Date.now()
  for (const item of items) {
    const t = new Date(item.at).getTime()
    if (Number.isNaN(t)) continue
    const diff = end - t
    const index = days - 1 - Math.floor(diff / DAY_MS)
    if (index >= 0 && index < days) buckets[index] += item.value
  }
  return buckets
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return ((current - previous) / previous) * 100
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: org }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('organisations').select('*').eq('owner_id', user.id).maybeSingle(),
  ])

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
    // Upcoming events (next 5) with ticket_tiers aggregated for sold / capacity
    const { data: evs } = await supabase
      .from('events')
      .select(
        'id, slug, title, start_date, venue_city, cover_image_url, timezone, ticket_tiers(sold_count, total_capacity)',
      )
      .eq('organisation_id', org.id)
      .eq('status', 'published')
      .gte('start_date', nowIso)
      .order('start_date', { ascending: true })
      .limit(5)

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

    const { count: upcoming } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', org.id)
      .eq('status', 'published')
      .gte('start_date', nowIso)
    upcomingCount = upcoming ?? 0

    // Recent confirmed orders for this organisation over 60 days (for KPIs + activity)
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, status, total_cents, currency, confirmed_at, created_at, event_id')
      .eq('organisation_id', org.id)
      .in('status', ['confirmed', 'partially_refunded', 'refunded'])
      .gte('created_at', since60Days)
      .order('created_at', { ascending: false })

    ordersLast60 = (orders ?? []) as OrderSummary[]

    // Fetch event titles referenced by these orders for activity subtitles
    const eventIds = [...new Set(ordersLast60.map((o) => o.event_id))]
    if (eventIds.length > 0) {
      const { data: eventsForActivity } = await supabase
        .from('events')
        .select('id, title')
        .in('id', eventIds)
      for (const e of eventsForActivity ?? []) {
        eventTitleMap.set(e.id, e.title)
      }
    }
  }

  // ── Compute KPIs ─────────────────────────────────────────────────────────
  const confirmedOrders = ordersLast60.filter((o) => o.status === 'confirmed')

  const ordersLast30 = confirmedOrders.filter((o) => new Date(o.created_at).getTime() >= now - 30 * DAY_MS)
  const ordersPrior30 = confirmedOrders.filter(
    (o) =>
      new Date(o.created_at).getTime() < now - 30 * DAY_MS &&
      new Date(o.created_at).getTime() >= now - 60 * DAY_MS,
  )

  const ticketsSold30 = ordersLast30.length
  const ticketsSoldPrior = ordersPrior30.length

  const revenueCents30 = ordersLast30.reduce((sum, o) => sum + (o.total_cents ?? 0), 0)
  const revenuePriorCents = ordersPrior30.reduce((sum, o) => sum + (o.total_cents ?? 0), 0)

  const ticketsDelta = pctChange(ticketsSold30, ticketsSoldPrior)
  const revenueDelta = pctChange(revenueCents30, revenuePriorCents)

  const ticketsSparkline = bucketByDay(
    ordersLast30.map((o) => ({ at: o.created_at, value: 1 })),
    30,
  )
  const revenueSparkline = bucketByDay(
    ordersLast30.map((o) => ({ at: o.created_at, value: o.total_cents ?? 0 })),
    30,
  )

  const currency = ordersLast30[0]?.currency ?? 'AUD'
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Tickets sold (30d)"
          value={ticketsSold30.toLocaleString('en-AU')}
          delta={ticketsDelta !== null ? { value: ticketsDelta } : null}
          sparkline={ticketsSparkline}
          emptyHint={isOrganiser ? 'Sales will appear here' : 'No organiser data'}
        />
        <KpiCard
          label="Revenue (30d)"
          value={revenueFormatted}
          delta={revenueDelta !== null ? { value: revenueDelta } : null}
          sparkline={revenueSparkline}
          emptyHint={isOrganiser ? 'Revenue will appear here' : 'No organiser data'}
        />
        <KpiCard
          label="Upcoming events"
          value={upcomingCount.toLocaleString('en-AU')}
          emptyHint="None scheduled yet"
        />
        <KpiCard
          label="Total events"
          value={(totalEventsCount ?? 0).toLocaleString('en-AU')}
          emptyHint="Create your first event"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <UpcomingEventsPanel events={upcomingEvents} />
          <RecentActivityPanel activity={recentActivity} />
        </div>
        <div className="space-y-6">
          {showChecklist && <GetStartedChecklist status={checklistStatus} />}
          <QuickActionsPanel />
        </div>
      </div>
    </div>
  )
}
