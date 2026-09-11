import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { countPendingRefunds } from '@/lib/admin/refunds'
import { countOpenDisputes } from '@/lib/admin/disputes'
import {
  adminPushSubscriptions,
  countUndelivered,
  readPlatformNotificationFeed,
} from '@/lib/notifications/platform-send'
import { KIND_LABEL, factsFor, formatMoment } from '@/lib/notifications/platform-policy'
import { BackupAlerts } from './backup-alerts'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Notifications | EventLinqs Admin',
  robots: { index: false, follow: false },
}

async function kycCount(): Promise<number> {
  const db = createAdminClient()
  const { count, error } = await db
    .from('organisations')
    .select('id', { count: 'exact', head: true })
    .in('payout_status', ['on_hold', 'restricted'])
  if (error) throw error
  return count ?? 0
}

interface Alert {
  label: string
  count: number | null
  description: string
  href: string
}

function AlertCard({ label, count, description, href }: Alert) {
  const needsAttention = count != null && count > 0
  const unreachable = count == null
  return (
    <Link
      href={href}
      className="block rounded-xl border border-white/[0.08] bg-[#131A2A] p-5 outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">{label}</p>
        <span
          aria-hidden
          className={`mt-1.5 h-2 w-2 rounded-full ${unreachable ? 'bg-rose-500' : needsAttention ? 'bg-amber-400' : 'bg-emerald-400'}`}
        />
      </div>
      <p className="mt-3 font-display text-3xl font-bold text-white">{unreachable ? '-' : count}</p>
      <p className="mt-2 text-xs text-white/50">{unreachable ? 'unreachable, retry' : description}</p>
    </Link>
  )
}

export default async function AdminNotificationsPage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.dashboard.view')) redirect('/admin')

  await recordAuditEvent({ action: 'admin.notifications.view', session })

  const [disputes, refunds, kyc] = await Promise.all([
    countOpenDisputes(),
    countPendingRefunds().catch(() => null),
    kycCount().catch(() => null),
  ])

  const alerts: Alert[] = [
    {
      label: 'Open disputes',
      count: disputes.ok ? disputes.count : null,
      description: 'chargebacks awaiting a response',
      href: '/admin/disputes',
    },
    {
      label: 'Pending refunds',
      count: refunds,
      description: 'pending, processing, or failed',
      href: '/admin/refunds',
    },
    {
      label: 'KYC review',
      count: kyc,
      description: 'organisers on hold or restricted',
      href: '/admin/kyc',
    },
  ]

  const totalOpen = alerts.reduce((s, a) => s + (a.count && a.count > 0 ? a.count : 0), 0)

  // UX3.4: the same five happenings the owner is emailed about, as a readable
  // feed, so the platform can be caught up on without searching an inbox.
  const db = createAdminClient()
  const [feed, undelivered, armedDevices] = await Promise.all([
    readPlatformNotificationFeed(db, 50).catch(() => null),
    countUndelivered(db).catch(() => null),
    adminPushSubscriptions(db)
      .then(s => s.length)
      .catch(() => 0),
  ])

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Operations inbox</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          {totalOpen > 0
            ? 'Items that need an operator. Open a queue to action them.'
            : 'All clear. Nothing needs an operator right now. New alerts appear here as they arise.'}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {alerts.map(a => (
          <AlertCard key={a.label} {...a} />
        ))}
      </div>

      {undelivered != null && undelivered > 0 && (
        <div
          role="status"
          className="mt-8 rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 text-sm text-rose-100"
        >
          <p className="font-display text-base font-semibold">
            {undelivered} notification{undelivered === 1 ? '' : 's'} could not be delivered on any
            channel.
          </p>
          <p className="mt-2 text-rose-100/80">
            Email failed and the backup push channel could not be used. They are listed below with
            the reason. Nothing is lost: the record is here whether or not the message arrived.
          </p>
        </div>
      )}

      <div className="mt-8">
        <BackupAlerts armed={armedDevices} />
      </div>

      <section className="mt-8">
        <h2 className="font-display text-sm uppercase tracking-widest text-white/60">
          What happened on the platform
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-white/50">
          Every new organiser, every Stripe onboarding, every event published and every paid order,
          in the order it happened. Each one is emailed as well; this is the record.
        </p>

        {feed == null ? (
          <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 text-sm text-rose-200">
            The notification feed is unreachable. The records are still being written; only this view
            is failing. Retry, and if it persists check the platform_notifications table.
          </p>
        ) : feed.length === 0 ? (
          <p className="mt-4 rounded-xl border border-white/[0.08] bg-[#131A2A] p-5 text-sm text-white/50">
            Nothing yet. The next organiser to sign up, connect Stripe, publish an event or take a
            payment appears here within a minute, and lands in your inbox at the same time.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">
            {feed.map(row => {
              const failed = row.delivery_state === 'failed'
              return (
                <li
                  key={row.id}
                  className={`rounded-xl border p-5 ${
                    failed
                      ? 'border-rose-500/40 bg-rose-500/[0.06]'
                      : 'border-white/[0.08] bg-[#131A2A]'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                      {KIND_LABEL[row.kind]}
                    </p>
                    <p className="text-xs text-white/40">{formatMoment(row.occurred_at)}</p>
                  </div>
                  <Link
                    href={row.admin_path}
                    className="mt-2 block font-display text-lg font-semibold text-white outline-none hover:text-[var(--brand-accent)] focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
                  >
                    {row.summary}
                  </Link>
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {factsFor(row).map(([label, value]) => (
                      <div key={label} className="flex gap-2">
                        <dt className="text-white/40">{label}</dt>
                        <dd className="text-white/80">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className={`mt-3 text-xs ${failed ? 'text-rose-200' : 'text-white/40'}`}>
                    {row.delivery_state === 'sent' && `Emailed${row.channel === 'digest' ? ' in a digest' : ''}`}
                    {row.delivery_state === 'escalated' && 'Email failed, pushed to an armed device'}
                    {row.delivery_state === 'pending' && 'Queued, sending within a minute'}
                    {row.delivery_state === 'held_for_digest' && 'Held for the daily digest'}
                    {failed && `Undelivered: ${row.last_error ?? 'no reason recorded'}`}
                  </p>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <div className="mt-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
        <h2 className="font-display text-sm uppercase tracking-widest text-white/60">Activity</h2>
        <p className="mt-2 text-sm text-white/50">
          Every admin action is recorded. Review the full history in the{' '}
          <Link href="/admin/audit" className="text-[var(--brand-accent)] hover:underline">
            audit log
          </Link>
          .
        </p>
      </div>
    </div>
  )
}
