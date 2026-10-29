import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readTodayQueue } from '@/lib/admin/today'
import { readFounderDashboard } from '@/lib/admin/founder-dashboard'
import { arrangeDashboard } from '@/lib/admin/founder-dashboard-math'
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
 * Under it, THE FOUNDER DASHBOARD (the master mandate of 29 October 2026, section 14): events, organisers, marketing,
 * revenue and conversion, operations, each a handful of figures with where to act and what the system has already
 * done, the sections that need a person first (src/lib/admin/founder-dashboard-math.ts and founder-dashboard.ts). The
 * weekly figures in full stay on /admin/growth.
 */
export default async function AdminTodayPage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.dashboard.view')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.today.view', session })

  const now = new Date()
  const [queue, dashboard] = await Promise.all([readTodayQueue(now), readFounderDashboard(now)])
  const glance = arrangeDashboard(dashboard)
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

      <section data-section="platform-at-a-glance" aria-label="The platform at a glance" className="mt-10">
        <h2 className="font-display text-2xl font-bold tracking-tight">The platform at a glance</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          What needs a person comes first; the rest is what the platform holds and has done this week. Each figure is read now from the record its part
          keeps; one that could not be read says so instead of showing 0.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-6">
          {glance.map((section) => (
            <section key={section.key} data-glance={section.key} aria-label={section.title} className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
              <h3 className="font-display text-lg font-semibold text-white">
                {section.title}
                {section.needsYou > 0 ? (
                  <span className="ml-2 text-sm font-normal text-amber-200">
                    {section.needsYou} {section.needsYou === 1 ? 'needs you' : 'need you'}
                  </span>
                ) : null}
              </h3>
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {section.figures.map((f) => (
                  <li
                    key={f.label}
                    data-figure={f.label}
                    data-attention={f.attention ? 'yes' : 'no'}
                    className={`rounded-lg border p-4 ${f.attention ? 'border-amber-300/60' : 'border-white/[0.06]'}`}
                  >
                    <p className="text-xs text-white/50">{f.label}</p>
                    <p className="mt-1 font-display text-2xl font-semibold text-white">{f.display ?? (f.value === null ? 'Not counted' : count.format(f.value))}</p>
                    {f.note ? <p className="mt-1 text-xs text-white/60">{f.note}</p> : null}
                    {f.href && f.attention ? (
                      <Link
                        href={f.href}
                        className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-accent)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
                      >
                        Open
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
              {section.done.length > 0 ? (
                <p className="mt-4 text-sm text-white/60">Done by the platform: {section.done.join('; ')}.</p>
              ) : null}
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}
