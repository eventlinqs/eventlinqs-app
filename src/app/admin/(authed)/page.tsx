import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { recordAuditEvent } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/auth'
import { aggregateGmv, ANALYTICS_CURRENCY, type GmvOrderRow } from '@/lib/admin/analytics'
import { formatMoneyDisplay } from '@/lib/money/format'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Admin dashboard.
 *
 * Glanceable numeric tiles. Each tile fetches only its own data via
 * Suspense so a slow tile cannot block the others. Tables that have
 * not yet shipped (refund_requests, stripe_disputes, payouts) render
 * a "Pending Session 1" tile - this is intentional per scope §3.4.
 *
 * No charts in A1; charts arrive in A4.
 */
export default async function AdminDashboardPage() {
  const session = await requireAdminSession()
  await recordAuditEvent({ action: 'admin.dashboard.view', session })

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">
          Today
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Operations dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Real-time numeric view of the platform. Charts and trends arrive in Phase A4.
        </p>
      </header>

      <section aria-label="Gross merchandise value">
        <h2 className="mb-4 font-display text-sm uppercase tracking-widest text-white/50">
          GMV
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Suspense fallback={<TileSkeleton label="GMV today" />}>
            <GmvTile label="GMV today" sinceMsAgo={dayMs()} />
          </Suspense>
          <Suspense fallback={<TileSkeleton label="GMV this week" />}>
            <GmvTile label="GMV this week" sinceMsAgo={7 * dayMs()} />
          </Suspense>
          <Suspense fallback={<TileSkeleton label="GMV this month" />}>
            <GmvTile label="GMV this month" sinceMsAgo={30 * dayMs()} />
          </Suspense>
        </div>
      </section>

      <section aria-label="Operations queues" className="mt-10">
        <h2 className="mb-4 font-display text-sm uppercase tracking-widest text-white/50">
          Queues
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Suspense fallback={<TileSkeleton label="New organisers today" />}>
            <NewOrganisersTile />
          </Suspense>
          <Suspense fallback={<TileSkeleton label="KYC queue" />}>
            <KycQueueTile />
          </Suspense>
          <PendingTile label="Pending refunds"   reason="Refund table arrives in M6 Phase 5" />
          <PendingTile label="Active disputes"   reason="Dispute table arrives in M6 Phase 6" />
        </div>
      </section>

      <section aria-label="System health" className="mt-10">
        <h2 className="mb-4 font-display text-sm uppercase tracking-widest text-white/50">
          System health
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <PendingTile label="Stripe API latency"     reason="Wired by Session 2 (observability)" status="pending" />
          <PendingTile label="Supabase response time" reason="Wired by Session 2 (observability)" status="pending" />
          <PendingTile label="Redis health"           reason="Wired by Session 2 (observability)" status="pending" />
        </div>
      </section>
    </div>
  )
}

function dayMs() {
  return 24 * 60 * 60 * 1000
}

function TileSkeleton({ label }: { label: string }) {
  return <AdminStatTile label={label} value={<span className="inline-block h-8 w-24 animate-pulse rounded bg-white/10" />} />
}

function PendingTile({ label, reason, status = 'pending' }: { label: string; reason: string; status?: 'pending' | 'warn' }) {
  return <AdminStatTile label={label} value="-" hint={reason} status={status} />
}

async function GmvTile({ label, sinceMsAgo }: { label: string; sinceMsAgo: number }) {
  const since = new Date(Date.now() - sinceMsAgo).toISOString()
  try {
    const client = createAdminClient()
    // PAY-02: value GMV net of refunds, using the same audited aggregator as
    // /admin/analytics. The previous query read a non-existent `total_amount_cents`
    // column (so the tile silently failed) and, had it worked, would have counted
    // every confirmed order at FULL value while ignoring refunds entirely. We now
    // pull the paid statuses (confirmed, partially_refunded, refunded) on the
    // real `total_cents` column and subtract completed refunds for those orders,
    // so a fully refunded order nets to zero and a partial refund nets to the
    // retained amount.
    const { data: orderRows, error } = await client
      .from('orders')
      .select('id, total_cents, platform_fee_cents, status, currency')
      .in('status', ['confirmed', 'partially_refunded', 'refunded'])
      .eq('currency', ANALYTICS_CURRENCY)
      .gte('created_at', since)
      .returns<(GmvOrderRow & { id: string; currency: string })[]>()
    if (error) throw error
    const orders = orderRows ?? []

    let refunds: { amount_cents: number; status: string }[] = []
    if (orders.length > 0) {
      const { data: refundRows, error: refundErr } = await client
        .from('refunds')
        .select('amount_cents, status')
        .eq('status', 'completed')
        .in('order_id', orders.map(o => o.id))
        .returns<{ amount_cents: number; status: string }[]>()
      if (refundErr) throw refundErr
      refunds = refundRows ?? []
    }

    const { netGmvCents } = aggregateGmv(orders, refunds)
    // Exact-cents display (item 9 fix): never round revenue to whole dollars.
    const formatted = formatMoneyDisplay(netGmvCents, 'AUD')
    return <AdminStatTile label={label} value={formatted} hint="AUD, net of refunds; multi-currency view in A4" />
  } catch {
    return <AdminStatTile label={label} value="-" hint="orders table query failed" status="warn" />
  }
}

async function NewOrganisersTile() {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  try {
    const client = createAdminClient()
    const { count, error } = await client
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString())
    if (error) throw error
    return <AdminStatTile label="New organisers today" value={count ?? 0} />
  } catch {
    return <AdminStatTile label="New organisers today" value="-" hint="organisations table query failed" status="warn" />
  }
}

async function KycQueueTile() {
  try {
    const client = createAdminClient()
    const { count, error } = await client
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .in('payout_status', ['on_hold', 'restricted'])
    if (error) throw error
    return <AdminStatTile label="KYC queue depth" value={count ?? 0} hint="organisations on_hold or restricted" status={count && count > 0 ? 'warn' : 'ok'} />
  } catch {
    return <AdminStatTile label="KYC queue depth" value="-" hint="organisations table query failed" status="warn" />
  }
}
