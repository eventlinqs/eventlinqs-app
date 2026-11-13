import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readTodayQueue } from '@/lib/admin/today'
import { readFounderDashboard } from '@/lib/admin/founder-dashboard'
import { readGrowthWeek } from '@/lib/growth/weekly'
import { byException, rhythm, type DashboardFigure } from '@/lib/admin/founder-dashboard-math'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { isOverdue, readCommandCentre } from '@/lib/crm/command-centre'
import { readPlanGates } from '@/lib/growth/plan-gates'
import { readSentRecently, readTwentyView } from '@/lib/outreach/twenty-view'
import { SentRecentlySection, TwentySection } from './twenty-section'
import { readThreePosts } from '@/lib/social/three-posts'
import { PostsSection } from './posts-section'
import { approvePieceAction, approveWeekAction } from '../social/actions'

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
/** One press approval (order 4, Release 1 item 3): the Command Centre's own gold press, 44px, as the posts section's. */
const APPROVE =
  'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#131A2A]'

export default async function AdminTodayPage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  // What a press of Sent in the twenty answered (the same words /admin/acquisition shows).
  const { said } = await searchParams
  const session = await requireAdminSession()
  if (!can(session, 'admin.dashboard.view')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.today.view', session })

  const now = new Date()
  // The six numbers come from the growth page's own rows (src/lib/growth/six-numbers.ts); a failed read names itself.
  const [queue, dashboard, growth, centre] = await Promise.all([
    readTodayQueue(now),
    readFounderDashboard(now),
    readGrowthWeek(now).then(
      (g) => ({ ok: true as const, g }),
      (err: unknown) => ({ ok: false as const, why: err instanceof Error ? err.message : String(err) }),
    ),
    // The Growth OS's tasks, overdue first (src/lib/crm/command-centre.ts): a failed read says so, never an empty queue.
    readCommandCentre(createAdminClient(), now),
  ])
  // The master plan's gates (the PM's 09:19 of 12 November 2026, item 3): a failed read says so, never a zero.
  const gates = await readPlanGates(now).then(
    (g) => ({ ok: true as const, g }),
    (err: unknown) => ({ ok: false as const, why: err instanceof Error ? err.message : String(err) }),
  )
  // Tomorrow's twenty (Lawal's 11:11): who, their basis, their draft, Copy and Sent. A failed read says so.
  const twenty = await readTwentyView(createAdminClient(), now).then(
    (v) => ({ ok: true as const, v }),
    (err: unknown) => ({ ok: false as const, why: err instanceof Error ? err.message : String(err) }),
  )
  // What came back on each message sent (Lawal's 11:11, item 2). A failed read says so.
  const sentRecently = await readSentRecently(createAdminClient(), now).then(
    (v) => ({ ok: true as const, v }),
    (err: unknown) => ({ ok: false as const, why: err instanceof Error ? err.message : String(err) }),
  )
  // This week's three posts (Lawal's 11:11, items 3 and 4). A failed read says so.
  const threePosts = await readThreePosts(createAdminClient(), now).then(
    (v) => ({ ok: true as const, v }),
    (err: unknown) => ({ ok: false as const, why: err instanceof Error ? err.message : String(err) }),
  )
  const exceptions = byException(dashboard)
  // Each kept task's link is its queue item's own link, matched by the item's id (the task's source key).
  const hrefOf = new Map(queue.sections.flatMap((s) => s.items.map((i) => [i.id, i.href] as const)))
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

      {/* THE COMMAND CENTRE (the Growth OS directive, section 5): the kept tasks, overdue first, each with its status, owner,
          due date and link; failed jobs stay here until fixed. Approving in one press arrives with Release 2, where an
          approval sends; until then each task opens the page that acts on it. */}
      <section data-section="command-centre" aria-label="Command Centre" className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-white">Command Centre</h2>
        {/* THE PLAN'S GATES (Lawal's master plan, 'full-time in six months'; the PM's 09:19 item 3): each with its target,
            its day and what each week still needs, counted by the platform's own rules (src/lib/growth/plan-gates-math.ts). */}
        <div data-section="plan-gates" className="mt-3">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-white/60">The plan&apos;s gates</h3>
          {gates.ok ? (
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {gates.g.map((s) => (
                <li key={s.gate.key} data-gate={s.gate.key} className="rounded-lg border border-white/[0.08] p-3">
                  <p className="text-sm font-semibold text-white">{s.gate.label}</p>
                  <p className="mt-1 font-display text-xl font-bold text-white">
                    {count.format(s.value)} <span className="text-sm font-normal text-white/60">of {count.format(s.gate.target)}{s.gate.due ? ` by ${s.gate.due}` : ' a day'}</span>
                  </p>
                  <p className={`mt-1 text-xs ${s.met ? 'text-emerald-300' : s.late ? 'text-amber-200' : 'text-white/60'}`}>
                    {s.met ? 'Met' : s.late ? `Past its day by ${-(s.daysLeft ?? 0)} days` : s.perWeek !== null ? `${s.perWeek} more a week, ${s.daysLeft} days left` : `${s.gate.target - s.value} more today`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-amber-200">The plan&apos;s gates could not be read just now ({gates.why}).</p>
          )}
        </div>
        {centre.state === 'not_landed' ? (
          <p className="mt-2 text-sm text-amber-200">The task list is not on this database yet: its migration (20261111230001) waits for Lawal to apply it.</p>
        ) : centre.state === 'failed' ? (
          <p className="mt-2 text-sm text-amber-200">The task list could not be read just now ({centre.reason}). Nothing in it is lost.</p>
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-white/50">Overdue</dt><dd className="font-display text-xl font-bold text-white">{centre.overdue}</dd></div>
              <div><dt className="text-white/50">Waiting for approval</dt><dd className="font-display text-xl font-bold text-white">{centre.waitingApproval}</dd></div>
              <div><dt className="text-white/50">Failed</dt><dd className="font-display text-xl font-bold text-white">{centre.failed}</dd></div>
              <div><dt className="text-white/50">Done in the last day</dt><dd className="font-display text-xl font-bold text-white">{centre.doneLastDay}</dd></div>
            </dl>
            {centre.open.length === 0 ? (
              <p className="mt-3 text-sm text-white/60">No task is open.</p>
            ) : (
              <ul className="mt-4 divide-y divide-white/[0.06]">
                {centre.open.map((t) => {
                  const href = hrefOf.get(t.source_key) ?? null
                  return (
                    <li key={t.id} data-task={t.source_key} className="py-3">
                      <p className="text-sm font-semibold text-white">{t.title}</p>
                      <p className="mt-1 text-xs text-white/60">
                        {t.status === 'waiting_approval' ? 'Waiting for approval' : t.status === 'failed' ? 'Failed' : 'Open'}
                        {', '}
                        {t.due_on ? (isOverdue(t, now) ? `Overdue since ${t.due_on}` : `Due ${t.due_on}`) : 'No due date'}
                        {', '}
                        Owner: {t.owner_id ? 'a staff member' : 'Lawal'}
                      </p>
                      {t.failure_reason ? <p className="mt-1 text-sm text-amber-200">{t.failure_reason}</p> : t.next_action ? <p className="mt-1 text-sm text-white/60">{t.next_action}</p> : null}
                      {href ? (
                        <Link href={href} className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-accent)] underline-offset-4 hover:underline">
                          Open
                        </Link>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </section>

      {said === undefined ? null : (
        <p role="status" data-said className="mb-4 max-w-2xl rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-white">
          {said}
        </p>
      )}
      <TwentySection view={twenty} />
      <SentRecentlySection view={sentRecently} />
      <PostsSection view={threePosts} />

      {queue.sections.map((section) => (
        <section key={section.key} data-section={section.key} aria-label={section.title} className="mb-6 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
          <h2 className="font-display text-lg font-semibold text-white">
            {section.title}
            <span className="ml-2 text-sm font-normal text-white/50">{section.items.length}</span>
          </h2>
          {section.key === 'pieces' && section.items.length > 1 ? (
            // Every piece waiting, in one press (order 4, Release 1 item 3): the studio's own week approval, each piece through
            // its checks; a piece that fails one stays here and the message says why.
            <form action={approveWeekAction} className="mt-3">
              <input type="hidden" name="from" value="today" />
              <button type="submit" data-approve-all className={APPROVE}>
                Approve all {section.items.length}
              </button>
            </form>
          ) : null}

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
                  {item.approvePiece ? (
                    <form action={approvePieceAction} className="mt-2">
                      <input type="hidden" name="piece" value={item.approvePiece} />
                      <input type="hidden" name="from" value="today" />
                      <button type="submit" data-approve={item.approvePiece} className={APPROVE}>
                        Approve
                      </button>
                    </form>
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

      <section data-section="six-numbers" aria-label="The six numbers, week on week" className="mt-10">
        <h2 className="font-display text-2xl font-bold tracking-tight">The six numbers, week on week</h2>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Internal only. Each is last week beside the week before, marked real or estimated, with the rows it is counted from. A press out to another seller is never a
          sale, and contribution is what was kept, never what was sold.
        </p>
        {growth.ok ? (
          <ul className="mt-6 space-y-3">
            {growth.g.six.last.map((f, i) => {
              const before = growth.g.six.before[i]
              return (
                <li key={f.key} data-six={f.key} className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <h3 className="font-display text-base font-semibold text-white">{f.label}</h3>
                    <span className={`shrink-0 text-xs font-semibold uppercase tracking-[0.12em] ${f.basis === 'real' ? 'text-emerald-300' : 'text-amber-200'}`}>{f.basis}</span>
                  </div>
                  <p className="mt-2 text-sm text-white">
                    <span className="font-semibold">{f.display ?? (f.value === null ? 'Not counted' : count.format(f.value))}</span>
                    <span className="text-white/60"> last week; </span>
                    <span>{before ? (before.display ?? (before.value === null ? 'not counted' : count.format(before.value))) : 'not counted'}</span>
                    <span className="text-white/60"> the week before</span>
                  </p>
                  <p className="mt-2 text-xs text-white/50">Counted from {f.source}.</p>
                </li>
              )
            })}
          </ul>
        ) : (
          <p data-six="not-read" className="mt-4 text-sm text-amber-200">
            Not counted: the growth rows could not be read ({growth.why}). No figure is shown as 0.
          </p>
        )}
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
