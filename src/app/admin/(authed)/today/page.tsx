import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readTodayQueue } from '@/lib/admin/today'
import { readFounderDashboard } from '@/lib/admin/founder-dashboard'
import { byException, rhythm, type DashboardFigure } from '@/lib/admin/founder-dashboard-math'
import { formatPlatformDateTime } from '@/lib/dates/event-time'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Today | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * /admin/today, LAWAL'S ONE QUEUE (the engine plan of 28 October 2026, part H; the project manager's 20:17): only what
 * waits for a person. Plays to approve, sends paused with the reason, replies the system could not read, and
 * exceptions, first; the rules are in src/lib/admin/today-math.ts and the sources in src/lib/admin/today.ts.
 *
 * Under it, THE FOUNDER DASHBOARD BY EXCEPTION (the supreme specification of 30 October 2026, section 28): what needs
 * attention next, what failed, what waits for approval, what is scheduled, what made measurable value and what the
 * platform completed; then every figure once in its rhythm, daily, weekly and monthly (section 29), with section 16's
 * measures. The rules are in src/lib/admin/founder-dashboard-math.ts (byException, rhythm) and the figures in
 * founder-dashboard.ts. The weekly figures in full stay on /admin/growth.
 */
export default async function AdminTodayPage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.dashboard.view')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.today.view', session })

  const now = new Date()
  const [queue, dashboard] = await Promise.all([readTodayQueue(now), readFounderDashboard(now)])
  const exceptions = byException(dashboard)
  const cadence = rhythm(dashboard)
  const count = new Intl.NumberFormat('en-AU')

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Today</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">What needs you</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          {queue.allClear
            ? `Nothing needs you. Every source was read at ${formatPlatformDateTime(now.toISOString())}.`
            : queue.waiting > 0
              ? `${queue.waiting} ${queue.waiting === 1 ? 'thing waits' : 'things wait'} for you, oldest first. Read at ${formatPlatformDateTime(now.toISOString())}.`
              : `Nothing waits in what was read at ${formatPlatformDateTime(now.toISOString())}, but not every source could be read; each is named below.`}
        </p>
      </header>

      {queue.sections.map((section) => (
        <section key={section.key} data-section={section.key} aria-label={section.title} className="mb-6 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
          <h2 className="font-display text-lg font-semibold text-white">
            {section.title}
            <span className="ml-2 text-sm font-normal text-white/50">{section.items.length}</span>
          </h2>

          {section.items.length > 0 ? (
            <ul className="mt-4 divide-y divide-white/[0.06]">
              {section.items.map((item) => (
                <li key={item.id} data-item={item.id} className="py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <p className="text-sm font-semibold text-white">{item.what}</p>
                    <p className="shrink-0 text-xs text-white/50">Since {formatPlatformDateTime(item.since)}</p>
                  </div>
                  <p className="mt-1 text-sm text-white/60">{item.why}</p>
                  {item.href ? (
                    <Link
                      href={item.href}
                      className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
                    >
                      Open
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : section.unread.length === 0 ? (
            <p className="mt-3 text-sm text-white/60">Nothing here.</p>
          ) : null}

          {section.unread.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {section.unread.map((line) => (
                <li key={line} className="text-sm text-amber-200">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      <section data-section="by-exception" aria-label="By exception" className="mt-10">
        <h2 className="font-display text-2xl font-bold tracking-tight">By exception</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          What failed and what waits for you first, then what is scheduled, what made measurable value and what the platform has done. Only what is counted and above
          zero is listed; a figure that could not be read is named at the end, never shown as 0.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ExceptionBlock title="Needs attention next" kind="next" figures={exceptions.next ? [exceptions.next] : []} empty="Nothing failed and nothing waits." count={count} />
          <ExceptionBlock title="Failed" kind="failed" figures={exceptions.failed} empty="Nothing failed." count={count} />
          <ExceptionBlock title="Needs your approval" kind="approve" figures={exceptions.needsApproval} empty="Nothing waits for your approval." count={count} />
          <ExceptionBlock title="Scheduled" kind="scheduled" figures={exceptions.scheduled} empty="Nothing is scheduled." count={count} />
          <ExceptionBlock title="Made measurable value" kind="value" figures={exceptions.value} empty="No counted value in these windows yet." count={count} />
          <section data-exception="completed" aria-label="Completed by the platform" className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
            <h3 className="font-display text-base font-semibold text-white">Completed by the platform</h3>
            {exceptions.completed.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {exceptions.completed.map((line) => (
                  <li key={line} className="text-sm text-white/80">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-white/60">Nothing recorded as done this week yet.</p>
            )}
          </section>
        </div>
        {exceptions.notCounted.length > 0 ? (
          <p data-exception="not-counted" className="mt-4 text-sm text-amber-200">
            Not counted: {exceptions.notCounted.map((f) => `${f.label}${f.note ? ` (${f.note})` : ''}`).join('; ')}.
          </p>
        ) : null}
      </section>

      <section data-section="rhythm" aria-label="Daily, weekly and monthly" className="mt-10">
        <h2 className="font-display text-2xl font-bold tracking-tight">Daily, weekly, monthly</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Every figure once, in the rhythm it is read: daily for accuracy, responses, failures and what is about to post; weekly for approvals, acquisition, supply
          and conversion; monthly for retention, contribution, costs and readiness to grow.
        </p>
        <RhythmGroup title="Daily" cadence="daily" figures={cadence.daily} open count={count} />
        <RhythmGroup title="Weekly" cadence="weekly" figures={cadence.weekly} open={false} count={count} />
        <RhythmGroup title="Monthly" cadence="monthly" figures={cadence.monthly} open={false} count={count} />
      </section>
    </div>
  )
}

function figureValue(f: DashboardFigure, count: Intl.NumberFormat): string {
  return f.display ?? (f.value === null ? 'Not counted' : count.format(f.value))
}

function ExceptionBlock({ title, kind, figures, empty, count }: { title: string; kind: string; figures: readonly DashboardFigure[]; empty: string; count: Intl.NumberFormat }) {
  return (
    <section data-exception={kind} aria-label={title} className={`rounded-xl border bg-[#131A2A] p-5 ${kind === 'next' && figures.length > 0 ? 'border-amber-300/60' : 'border-white/[0.08]'}`}>
      <h3 className="font-display text-base font-semibold text-white">{title}</h3>
      {figures.length > 0 ? (
        <ul className="mt-3 divide-y divide-white/[0.06]">
          {figures.map((f) => (
            <li key={f.label} data-figure={f.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
              <span className="text-sm text-white/80">{f.label}</span>
              <span className="font-display text-lg font-semibold text-white">{figureValue(f, count)}</span>
              {f.note ? <span className="w-full text-xs text-white/60">{f.note}</span> : null}
              {f.href ? (
                <Link
                  href={f.href}
                  className="inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
                >
                  Open
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-white/60">{empty}</p>
      )}
    </section>
  )
}

function RhythmGroup({ title, cadence, figures, open, count }: { title: string; cadence: string; figures: readonly DashboardFigure[]; open: boolean; count: Intl.NumberFormat }) {
  return (
    <details data-cadence={cadence} open={open} className="mt-4 rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
      <summary className="flex min-h-[44px] cursor-pointer items-center font-display text-lg font-semibold text-white">
        {title}
        <span className="ml-2 text-sm font-normal text-white/50">{figures.length}</span>
      </summary>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {figures.map((f) => (
          <li key={f.label} data-figure={f.label} className="rounded-lg border border-white/[0.06] p-4">
            <p className="text-xs text-white/50">{f.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-white">{figureValue(f, count)}</p>
            {f.note ? <p className="mt-1 text-xs text-white/60">{f.note}</p> : null}
          </li>
        ))}
      </ul>
    </details>
  )
}
