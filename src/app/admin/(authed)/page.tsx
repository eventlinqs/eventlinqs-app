import { Suspense, type ReactNode } from 'react'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { countPendingRefunds } from '@/lib/admin/refunds'
import { countOpenDisputes } from '@/lib/admin/disputes'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { recordAuditEvent } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/auth'
import { aggregateGmv, ANALYTICS_CURRENCY, type GmvOrderRow } from '@/lib/admin/analytics'
import { formatMoneyDisplay } from '@/lib/money/format'
import { checkStripeHealth, checkSupabaseHealth, checkRedisHealth, type HealthResult } from '@/lib/admin/health'
import { captureException } from '@/lib/observability/sentry'
import { PLATFORM_READ_ACTION, readLoggedReadsWithin, readsSentence, totalReads, type ReadTotals } from '@/lib/connect/bookedproof/platform-log'
import { melbourneDay, melbourneDayBounds } from '@/lib/listings/discovery-day'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Admin dashboard.
 *
 * Glanceable numeric tiles. Each tile fetches only its own data via
 * Suspense so a slow tile cannot block the others. Every tile reads live
 * data: GMV (net of refunds), the operations queues (new organisers, KYC,
 * pending refunds, active disputes), and live system-health probes (Stripe,
 * Supabase, Redis). The refunds and disputes tiles link to their queues.
 */
export default async function AdminDashboardPage() {
  const session = await requireAdminSession()
  await recordAuditEvent({ action: 'admin.dashboard.view', session })

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">
          Today
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Operations dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          Live numeric view of the platform: value, operations queues, and system health. Trend charts live in Analytics.
        </p>
      </header>

      <section aria-label="Gross merchandise value">
        <h2 className="mb-4 font-display text-sm uppercase tracking-widest text-[var(--admin-muted)]">
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
        <h2 className="mb-4 font-display text-sm uppercase tracking-widest text-[var(--admin-muted)]">
          Queues
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Suspense fallback={<TileSkeleton label="New organisers today" />}>
            <NewOrganisersTile />
          </Suspense>
          <Suspense fallback={<TileSkeleton label="KYC queue" />}>
            <KycQueueTile />
          </Suspense>
          <Suspense fallback={<TileSkeleton label="Pending refunds" />}>
            <RefundsTile />
          </Suspense>
          <Suspense fallback={<TileSkeleton label="Active disputes" />}>
            <DisputesTile />
          </Suspense>
        </div>
      </section>

      <section aria-label="Bookedproof" className="mt-10">
        <h2 className="mb-4 font-display text-sm uppercase tracking-widest text-[var(--admin-muted)]">
          Bookedproof
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Suspense fallback={<TileSkeleton label="Bookedproof read today" />}>
            <BookedproofReadsTile label="Bookedproof read today" sinceMsAgo={dayMs()} when="today" />
          </Suspense>
          <Suspense fallback={<TileSkeleton label="Bookedproof read this week" />}>
            <BookedproofReadsTile label="Bookedproof read this week" sinceMsAgo={7 * dayMs()} when="this week" />
          </Suspense>
        </div>
      </section>

      <section aria-label="System health" className="mt-10">
        <h2 className="mb-4 font-display text-sm uppercase tracking-widest text-[var(--admin-muted)]">
          System health
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Suspense fallback={<TileSkeleton label="Stripe API latency" />}>
            <HealthTile label="Stripe API latency" check={checkStripeHealth} />
          </Suspense>
          <Suspense fallback={<TileSkeleton label="Supabase response time" />}>
            <HealthTile label="Supabase response time" check={checkSupabaseHealth} />
          </Suspense>
          <Suspense fallback={<TileSkeleton label="Redis health" />}>
            <HealthTile label="Redis health" check={checkRedisHealth} />
          </Suspense>
        </div>
      </section>
    </div>
  )
}

function dayMs() {
  return 24 * 60 * 60 * 1000
}

/**
 * EVERY FIGURE OPENS THE LIST BEHIND IT (the PM's 13:22 of 21 November 2026, on Lawal's 13:20: "I can see one organizer
 * today ... It's unclickable"). The whole tile is the link; scripts/guards/test-accounts-left-out.mjs, clause 3, holds it.
 */
function TileLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link prefetch={false}
      href={href}
      className="block rounded-xl outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
    >
      {children}
    </Link>
  )
}

function TileSkeleton({ label }: { label: string }) {
  return <AdminStatTile label={label} value={<span className="inline-block h-8 w-24 animate-pulse rounded bg-[var(--admin-tint-strong)]" />} />
}

async function RefundsTile() {
  let count: number | null = null
  try {
    count = await countPendingRefunds()
  } catch {
    count = null
  }
  if (count == null) {
    return <TileLink href="/admin/refunds"><AdminStatTile label="Pending refunds" value="-" hint="refunds table query failed" status="warn" /></TileLink>
  }
  return (
    <TileLink href="/admin/refunds">
      <AdminStatTile
        label="Pending refunds"
        value={count}
        hint="pending, processing or failed, click to manage"
        status={count > 0 ? 'warn' : 'ok'}
      />
    </TileLink>
  )
}

async function DisputesTile() {
  const res = await countOpenDisputes()
  if (!res.ok) {
    return <TileLink href="/admin/disputes"><AdminStatTile label="Active disputes" value="-" hint="Stripe disputes unreachable" status="warn" /></TileLink>
  }
  return (
    <TileLink href="/admin/disputes">
      <AdminStatTile
        label="Active disputes"
        value={res.count}
        hint="open chargebacks needing a response, click to manage"
        status={res.count > 0 ? 'warn' : 'ok'}
      />
    </TileLink>
  )
}

async function HealthTile({ label, check }: { label: string; check: () => Promise<HealthResult> }) {
  const r = await check()
  const value = r.ok ? (r.latencyMs != null ? `${r.latencyMs} ms` : 'OK') : 'Down'
  const hint = r.ok
    ? `${r.detail}, ${r.status === 'warn' ? 'elevated latency' : 'healthy'}`
    : `unreachable: ${r.detail}`
  return <TileLink href="/admin/health"><AdminStatTile label={label} value={value} hint={hint} status={r.status} /></TileLink>
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
      // A test account's order is never GMV (the PM's 13:22 of 21 November 2026; migration 20261121140001).
      .eq('is_test', false)
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
    return <TileLink href="/admin/orders"><AdminStatTile label={label} value={formatted} hint="AUD, net of refunds; multi-currency view in A4" /></TileLink>
  } catch (error) {
    captureException(error, { where: 'app/admin/(authed)/page:202' })
    return <TileLink href="/admin/orders"><AdminStatTile label={label} value="-" hint="orders table query failed" status="warn" /></TileLink>
  }
}

/**
 * WHAT BOOKEDPROOF READ, IN PLAIN WORDS (trial gate T3, the project manager's
 * 22:45 (3) of 26 October 2026): every page its read only connection took,
 * summed from the audit log, as one sentence, linking to each logged read.
 */
async function BookedproofReadsTile({ label, sinceMsAgo, when }: { label: string; sinceMsAgo: number; when: string }) {
  let totals: ReadTotals | null = null
  try {
    totals = totalReads(await readLoggedReadsWithin(sinceMsAgo))
  } catch (error) {
    captureException(error, { where: 'app/admin/(authed)/page:BookedproofReadsTile' })
  }
  if (!totals) return <TileLink href={`/admin/audit?action=${PLATFORM_READ_ACTION}`}><AdminStatTile label={label} value="-" hint="the audit log could not be read" status="warn" /></TileLink>
  const rows = totals.organisations + totals.events + totals.buyers + totals.ledger
  return (
    <TileLink href={`/admin/audit?action=${PLATFORM_READ_ACTION}`}>
      <AdminStatTile label={label} value={rows.toLocaleString('en-AU')} hint={readsSentence(totals, when)} status="ok" />
    </TileLink>
  )
}

/**
 * New organisers today: the Melbourne day (it read UTC midnight, 11:00 in Melbourne), TEST accounts left out, opening
 * /admin/organisers?created=today, the same rows by the same rule (src/lib/admin/organisers.ts, createdToday).
 */
async function NewOrganisersTile() {
  const { from, to } = melbourneDayBounds(melbourneDay(new Date()))
  try {
    const client = createAdminClient()
    const { count, error } = await client
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', from)
      .lt('created_at', to)
      .eq('is_test', false)
    if (error) throw error
    return <TileLink href="/admin/organisers?created=today"><AdminStatTile label="New organisers today" value={count ?? 0} hint="Melbourne day, test accounts left out" /></TileLink>
  } catch (error) {
    captureException(error, { where: 'app/admin/(authed)/page:219' })
    return <TileLink href="/admin/organisers?created=today"><AdminStatTile label="New organisers today" value="-" hint="organisations table query failed" status="warn" /></TileLink>
  }
}

async function KycQueueTile() {
  try {
    const client = createAdminClient()
    const { count, error } = await client
      .from('organisations')
      .select('id', { count: 'exact', head: true })
      .in('payout_status', ['on_hold', 'restricted'])
      .eq('is_test', false)
    if (error) throw error
    return <TileLink href="/admin/kyc"><AdminStatTile label="KYC queue depth" value={count ?? 0} hint="organisations on_hold or restricted" status={count && count > 0 ? 'warn' : 'ok'} /></TileLink>
  } catch (error) {
    captureException(error, { where: 'app/admin/(authed)/page:234' })
    return <TileLink href="/admin/kyc"><AdminStatTile label="KYC queue depth" value="-" hint="organisations table query failed" status="warn" /></TileLink>
  }
}
