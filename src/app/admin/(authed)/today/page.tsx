import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readTodayQueue } from '@/lib/admin/today'
import { readAutomation } from '@/lib/admin/automation'
import { needsYou } from '@/lib/admin/automation-math'
import { countOf } from '@/lib/text/plural'
import { dayDate } from '@/lib/dates/admin-dates'
import { readFounderDashboard } from '@/lib/admin/founder-dashboard'
import { readGrowthWeek } from '@/lib/growth/weekly'
import { byException, rhythm, type DashboardFigure } from '@/lib/admin/founder-dashboard-math'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { isOverdue, readCommandCentre } from '@/lib/crm/command-centre'
import { readPlanGates } from '@/lib/growth/plan-gates'
import { gateNames } from '@/lib/growth/plan-gates-math'
import { readSentRecently, readTwentyView } from '@/lib/outreach/twenty-view'
import { SentRecentlySection, TwentySection } from './twenty-section'
import { readThreePosts } from '@/lib/social/three-posts'
import { PostsSection } from './posts-section'
import { approvePieceAction, approveWeekAction } from '../social/actions'
import { PageHeader, PRIMARY, StatCard } from '@/components/admin/ui/admin-kit'
import { AdminToast } from '@/components/admin/ui/admin-toast'
import { TimetableBoard } from '@/components/admin/timetable-board'
import { LessonsPanel } from '@/components/admin/lessons-panel'
import { readTimetable } from '@/lib/ops/timetable-read'
import { readLessons } from '@/lib/ops/lessons'
import { melbourneMinutes } from '@/lib/ops/timetable'
import { readClock, readTimesLine } from '@/lib/admin/read-timing'

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

export default async function AdminTodayPage({ searchParams }: { searchParams: Promise<{ said?: string; tone?: string }> }) {
  // What a press of Sent in the twenty answered (the same words /admin/acquisition shows).
  const { said, tone } = await searchParams
  const session = await requireAdminSession()
  if (!can(session, 'admin.dashboard.view')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.today.view', session })

  const now = new Date()
  const failed = (err: unknown) => ({ ok: false as const, why: err instanceof Error ? err.message : String(err) })
  const melbourneMidnight = now.getTime() - melbourneMinutes(now) * 60_000
  // EVERY READ OF THIS PAGE STARTS AT ONCE (law 41, the speed train of 20 November 2026): seven of them used to wait one
  // after another behind the first five, so the page took the sum of them; now it takes the slowest. Each read that can
  // fail still says so in its own section, never a zero.
  // The six numbers come from the growth page's own rows (src/lib/growth/six-numbers.ts); a failed read names itself.
  // EACH READ TIMED (law 41; src/lib/admin/read-timing.ts): when they settle, one log line names every read slowest first.
  const clock = readClock('/admin/today')
  const { timed } = clock
  // EVERY READ STARTS AT ONCE AND NONE HOLDS THE PAGE (law 41; the PM's 08:30 of 21 November 2026, item 9: the page took
  // 17.1 seconds, the slowest of its reads, before a pixel showed). The reads still start together, as the speed train of
  // 20 November made them; each section now awaits only its own, behind its own Suspense boundary, so the shell paints
  // at once and each section streams in as its read lands. Each read that can fail still says so in its own section.
  const queueP = timed('queue', readTodayQueue(now))
  const dashboardP = timed('dashboard', readFounderDashboard(now))
  const growthP = timed('growth', readGrowthWeek(now)).then((g) => ({ ok: true as const, g }), failed)
  // The Growth OS's tasks, overdue first (src/lib/crm/command-centre.ts): a failed read says so, never an empty queue.
  const centreP = timed('centre', readCommandCentre(createAdminClient(), now))
  // The one count of what waits for approval, the same read /admin/automation shows (the PM's 02:45 fix 1).
  const automationP = timed('automation', readAutomation(now)).then(
    (a) => ({ ok: true as const, needs: needsYou(a.cards) }),
    failed,
  )
  // The master plan's gates (the PM's 09:19 of 12 November 2026, item 3): a failed read says so, never a zero.
  const gatesP = timed('gates', readPlanGates(now)).then((g) => ({ ok: true as const, g }), failed)
  // Tomorrow's twenty (Lawal's 11:11): who, their basis, their draft, Copy and Sent. A failed read says so.
  const twentyP = timed('twenty', readTwentyView(createAdminClient(), now)).then((v) => ({ ok: true as const, v }), failed)
  // What came back on each message sent (Lawal's 11:11, item 2). A failed read says so.
  const sentRecentlyP = timed('sentRecently', readSentRecently(createAdminClient(), now)).then((v) => ({ ok: true as const, v }), failed)
  // The day's timetable (the daily timetable, locked 20 November 2026): a read that fails is named on the board.
  const timetableP = timed('timetable', readTimetable(createAdminClient(), now)).catch((err: unknown) => ({ unread: `the timetable could not be read: ${err instanceof Error ? err.message : String(err)}` }))
  // What the engine learned yesterday, from ops_lessons (Lawal's 06:07 of 20 November 2026): Melbourne's yesterday.
  const learnedP = timed('lessons', readLessons(createAdminClient(), new Date(melbourneMidnight - 24 * 60 * 60_000), new Date(melbourneMidnight))).catch((err: unknown) => ({
    unread: `what the engine learned could not be read: ${err instanceof Error ? err.message : String(err)}`,
  }))
  // This week's three posts (Lawal's 11:11, items 3 and 4). A failed read says so.
  const threePostsP = timed('threePosts', readThreePosts(createAdminClient(), now)).then((v) => ({ ok: true as const, v }), failed)
  // EACH READ TIMED (src/lib/admin/read-timing.ts): when they settle, one log line names every read slowest first. It
  // never holds the page: it is written after the last read lands, whatever the sections are doing.
  void Promise.allSettled([queueP, dashboardP, growthP, centreP, automationP, gatesP, twentyP, sentRecentlyP, timetableP, learnedP, threePostsP]).then(() =>
    console.log(readTimesLine(clock.report())),
  )

  return (
    <div>
      {/* A press that names its tone shows as a toast; the older inline line below stays for the twenty's Sent press. */}
      <AdminToast said={tone ? (said ?? null) : null} tone={tone === 'refused' ? 'refused' : 'ok'} />
      <Suspense fallback={<HeaderShape />}>
        <TodayHeader queueP={queueP} now={now} />
      </Suspense>
      <Suspense fallback={<BlockShape h="h-40" />}>
        <TodayBoards timetableP={timetableP} learnedP={learnedP} />
      </Suspense>
      <Suspense fallback={<CardsShape />}>
        <TodayNumbers queueP={queueP} centreP={centreP} automationP={automationP} />
      </Suspense>
      <Suspense fallback={<BlockShape h="h-64" />}>
        <TodayCentre gatesP={gatesP} centreP={centreP} queueP={queueP} now={now} />
      </Suspense>

      {said === undefined ? null : (
        <p role="status" data-said className="mb-4 max-w-2xl rounded-lg border border-[var(--admin-line)] bg-[var(--admin-tint)] p-4 text-sm text-[var(--admin-ink)]">
          {said}
        </p>
      )}
      <Suspense fallback={<BlockShape h="h-48" />}>
        <TodayTwenty twentyP={twentyP} />
      </Suspense>
      <Suspense fallback={<BlockShape h="h-32" />}>
        <TodaySent sentRecentlyP={sentRecentlyP} />
      </Suspense>
      <Suspense fallback={<BlockShape h="h-48" />}>
        <TodayPosts threePostsP={threePostsP} />
      </Suspense>
      <Suspense fallback={<BlockShape h="h-48" />}>
        <TodayQueue queueP={queueP} />
      </Suspense>
      <Suspense fallback={<BlockShape h="h-64" />}>
        <TodayExceptions dashboardP={dashboardP} />
      </Suspense>
      <Suspense fallback={<BlockShape h="h-64" />}>
        <TodaySix growthP={growthP} />
      </Suspense>
      <Suspense fallback={<BlockShape h="h-48" />}>
        <TodayRhythm dashboardP={dashboardP} />
      </Suspense>
    </div>
  )
}

/* THE SECTIONS, EACH AWAITING ONLY ITS OWN READ (law 41). Their markup is the page's own, moved here unchanged. */
type Reads = {
  queueP: Promise<Awaited<ReturnType<typeof readTodayQueue>>>
}
const NUMBER = () => new Intl.NumberFormat('en-AU')

async function TodayHeader({ queueP, now }: { queueP: Reads['queueP']; now: Date }) {
  const queue = await queueP
  // The one primary action (Lawal's 20:52, item 2): the oldest thing that waits for him, else the automation screen.
  const firstHref = queue.sections.flatMap((s) => s.items).find((i) => i.href)?.href ?? null
  return (
      <PageHeader
        eyebrow="Today"
        title="What needs you"
        description={
          queue.allClear
            ? `Nothing needs you. Every source was read at ${formatPlatformDateTime(now.toISOString())}.`
            : queue.waiting > 0
              ? `${queue.waiting} ${queue.waiting === 1 ? 'thing waits' : 'things wait'} for you, oldest first. Read at ${formatPlatformDateTime(now.toISOString())}.`
              : `Nothing waits in what was read at ${formatPlatformDateTime(now.toISOString())}, but not every source could be read; each is named below.`
        }
        action={
          queue.waiting > 0 && firstHref ? (
            <Link prefetch={false} href={firstHref} className={PRIMARY}>Start with the oldest</Link>
          ) : (
            <Link prefetch={false} href="/admin/automation" className={PRIMARY}>Open automation</Link>
          )
        }
      />
  )
}

async function TodayBoards({ timetableP, learnedP }: { timetableP: Promise<Parameters<typeof TimetableBoard>[0]['read']>; learnedP: Promise<Parameters<typeof LessonsPanel>[0]['learned']> }) {
  const [timetable, learned] = await Promise.all([timetableP, learnedP])
  return (
    <>
      <TimetableBoard read={timetable} />
      <LessonsPanel learned={learned} timetable={timetable} />
    </>
  )
}

async function TodayNumbers({ queueP, centreP, automationP }: { queueP: Reads['queueP']; centreP: Promise<Awaited<ReturnType<typeof readCommandCentre>>>; automationP: Promise<{ ok: true; needs: ReturnType<typeof needsYou> } | { ok: false; why: string }> }) {
  const [queue, centre, automation] = await Promise.all([queueP, centreP, automationP])
  const count = NUMBER()
  return (
    <>
      {/* The numbers that matter, first (Lawal's 20:52, item 2), from the reads below. */}
      {/* One card a row at 320, two from 375, four at desktop (the PM's 07:30 polish (b): two narrow columns at 320). */}
      <section data-section="today-numbers" aria-label="Today in numbers" className="mb-8 grid grid-cols-1 gap-4 min-[375px]:grid-cols-2 lg:grid-cols-4">
        {/* What the number is made of, said on the card (the PM's 02:45 fix 1): each list below with its count. */}
        <StatCard
          label="Waiting for you"
          value={count.format(queue.waiting)}
          sub={queue.allClear ? 'All clear' : queue.sections.filter((x) => x.items.length > 0).map((x) => `${count.format(x.items.length)} ${x.title.toLowerCase()}`).join(', ')}
        />
        {/* What the figure counts, said under it (the PM's 07:30 polish (a)): 'None overdue', or how many are past their day. */}
        <StatCard
          label="Overdue tasks"
          value={centre.state === 'read' ? count.format(centre.overdue) : 'Not read'}
          sub={centre.state === 'read' ? (centre.overdue === 0 ? 'None overdue' : `${countOf(centre.overdue, 'task')} past ${centre.overdue === 1 ? 'its' : 'their'} day`) : 'The task list could not be read'}
        />
        <StatCard
          label="Waiting for approval"
          value={automation.ok ? count.format(automation.needs.approvals) : 'Not read'}
          sub={automation.ok ? (automation.needs.parts.map((x) => countOf(x.n, x.noun)).join(', ') || 'Nothing waits') : 'Automation could not be read just now'}
        />
        <StatCard label="Failed jobs" value={centre.state === 'read' ? count.format(centre.failed) : 'Not read'} sub={centre.state === 'read' && centre.failed > 0 ? 'Each named below until fixed' : 'None open'} />
      </section>

    </>
  )
}

async function TodayCentre({ gatesP, centreP, queueP, now }: { gatesP: Promise<{ ok: true; g: Awaited<ReturnType<typeof readPlanGates>> } | { ok: false; why: string }>; centreP: Promise<Awaited<ReturnType<typeof readCommandCentre>>>; queueP: Reads['queueP']; now: Date }) {
  const [gates, centre, queue] = await Promise.all([gatesP, centreP, queueP])
  const count = NUMBER()
  // Each kept task's link is its queue item's own link, matched by the item's id (the task's source key).
  const hrefOf = new Map(queue.sections.flatMap((s) => s.items.map((i) => [i.id, i.href] as const)))
  return (
    <>
      {/* THE COMMAND CENTRE (the Growth OS directive, section 5): the kept tasks, overdue first, each with its status, owner,
          due date and link; failed jobs stay here until fixed. Approving in one press arrives with Release 2, where an
          approval sends; until then each task opens the page that acts on it. */}
      <section data-section="command-centre" aria-label="Command Centre" className="mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Command Centre</h2>
        {/* THE PLAN'S GATES (Lawal's master plan, 'full-time in six months'; the PM's 09:19 item 3): each with its target,
            its day and what each week still needs, counted by the platform's own rules (src/lib/growth/plan-gates-math.ts). */}
        <div data-section="plan-gates" className="mt-3">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--admin-soft)]">The plan&apos;s gates</h3>
          {gates.ok ? (
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {gates.g.map((s, _i, all) => (
                <li key={s.gate.key} data-gate={s.gate.key} className="rounded-lg border border-[var(--admin-line)] p-3">
                  {/* Two gates of one measure are named by their order and day (the PM's 05:37 fix 5). */}
                  {gateNames(all.map((x) => x.gate)).get(s.gate.key) ? (
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-accent-strong)]">{gateNames(all.map((x) => x.gate)).get(s.gate.key)}</p>
                  ) : null}
                  <p className="text-sm font-semibold text-[var(--admin-ink)]">{s.gate.label}</p>
                  <p className="mt-1 font-display text-xl font-bold text-[var(--admin-ink)]">
                    {count.format(s.value)} <span className="text-sm font-normal text-[var(--admin-soft)]">of {count.format(s.gate.target)}{s.gate.due ? ` by ${dayDate(s.gate.due)}` : ' a day'}</span>
                  </p>
                  <p className={`mt-1 text-xs ${s.met ? 'text-emerald-800' : s.late ? 'text-amber-800' : 'text-[var(--admin-soft)]'}`}>
                    {s.met ? 'Met' : s.late ? `Past its day by ${countOf(-(s.daysLeft ?? 0), 'day')}` : s.perWeek !== null ? `${s.perWeek} more a week, ${countOf(s.daysLeft ?? 0, 'day')} left` : `${s.gate.target - s.value} more today`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-amber-800">The plan&apos;s gates could not be read just now ({gates.why}).</p>
          )}
        </div>
        {centre.state === 'not_landed' ? (
          <p className="mt-2 text-sm text-amber-800">The task list is not on this database yet: its migration (20261111230001) waits for Lawal to apply it.</p>
        ) : centre.state === 'failed' ? (
          <p className="mt-2 text-sm text-amber-800">The task list could not be read just now ({centre.reason}). Nothing in it is lost.</p>
        ) : (
          <>
            {/* No approval count here: the task list copies the posts and plays waiting for approval and lags them, so
                'Waiting for approval' above is the one figure (16 November 2026, ADMIN 2: the strip's own approval 0
                stood beside 'Waiting for approval 8'). */}
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-[var(--admin-muted)]">Overdue</dt><dd className="font-display text-xl font-bold text-[var(--admin-ink)]">{centre.overdue}</dd></div>
              <div><dt className="text-[var(--admin-muted)]">Failed</dt><dd className="font-display text-xl font-bold text-[var(--admin-ink)]">{centre.failed}</dd></div>
              <div><dt className="text-[var(--admin-muted)]">Done in the last day</dt><dd className="font-display text-xl font-bold text-[var(--admin-ink)]">{centre.doneLastDay}</dd></div>
            </dl>
            {centre.open.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--admin-soft)]">No task is open.</p>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--admin-line)]">
                {centre.open.map((t) => {
                  const href = hrefOf.get(t.source_key) ?? null
                  return (
                    <li key={t.id} data-task={t.source_key} className="py-3">
                      <p className="text-sm font-semibold text-[var(--admin-ink)]">{t.title}</p>
                      <p className="mt-1 text-xs text-[var(--admin-soft)]">
                        {t.status === 'waiting_approval' ? 'Waiting for approval' : t.status === 'failed' ? 'Failed' : 'Open'}
                        {', '}
                        {t.due_on ? (isOverdue(t, now) ? `Overdue since ${t.due_on}` : `Due ${t.due_on}`) : 'No due date'}
                        {', '}
                        Owner: {t.owner_id ? 'a staff member' : 'Lawal'}
                      </p>
                      {t.failure_reason ? <p className="mt-1 text-sm text-amber-800">{t.failure_reason}</p> : t.next_action ? <p className="mt-1 text-sm text-[var(--admin-soft)]">{t.next_action}</p> : null}
                      {href ? (
                        <Link prefetch={false} href={href} className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-accent-strong)] underline-offset-4 hover:underline">
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

    </>
  )
}

async function TodayTwenty({ twentyP }: { twentyP: Promise<Parameters<typeof TwentySection>[0]['view']> }) {
  return <TwentySection view={await twentyP} />
}

async function TodaySent({ sentRecentlyP }: { sentRecentlyP: Promise<Parameters<typeof SentRecentlySection>[0]['view']> }) {
  return <SentRecentlySection view={await sentRecentlyP} />
}

async function TodayPosts({ threePostsP }: { threePostsP: Promise<Parameters<typeof PostsSection>[0]['view']> }) {
  return <PostsSection view={await threePostsP} />
}

async function TodayQueue({ queueP }: { queueP: Reads['queueP'] }) {
  const queue = await queueP
  return (
    <>
      {queue.sections.map((section) => (
        <section key={section.key} data-section={section.key} aria-label={section.title} className="mb-6 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
          <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">
            {section.title}
            <span className="ml-2 text-sm font-normal text-[var(--admin-muted)]">{section.items.length}</span>
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
            <ul className="mt-4 divide-y divide-[var(--admin-line)]">
              {section.items.map((item) => (
                <li key={item.id} data-item={item.id} className="py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <p className="text-sm font-semibold text-[var(--admin-ink)]">{item.what}</p>
                    <p className="shrink-0 text-xs text-[var(--admin-muted)]">Since {formatPlatformDateTime(item.since)}</p>
                  </div>
                  <p className="mt-1 text-sm text-[var(--admin-soft)]">{item.why}</p>
                  {item.href ? (
                    <Link prefetch={false}
                      href={item.href}
                      className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-accent-strong)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
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
            <p className="mt-3 text-sm text-[var(--admin-soft)]">Nothing here.</p>
          ) : null}

          {section.unread.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {section.unread.map((line) => (
                <li key={line} className="text-sm text-amber-800">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

    </>
  )
}

async function TodayExceptions({ dashboardP }: { dashboardP: Promise<Awaited<ReturnType<typeof readFounderDashboard>>> }) {
  const exceptions = byException(await dashboardP)
  const count = NUMBER()
  return (
    <>
      <section data-section="by-exception" aria-label="By exception" className="mt-10">
        <h2 className="font-display text-2xl font-bold tracking-tight">By exception</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          What failed and what waits for you first, then what is scheduled, what made measurable value and what the platform has done. Only what is counted and above
          zero is listed; a figure that could not be read is named at the end, never shown as 0.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ExceptionBlock title="Needs attention next" kind="next" figures={exceptions.next ? [exceptions.next] : []} empty="Nothing failed and nothing waits." count={count} />
          <ExceptionBlock title="Failed" kind="failed" figures={exceptions.failed} empty="Nothing failed." count={count} />
          <ExceptionBlock title="Needs your approval" kind="approve" figures={exceptions.needsApproval} empty="Nothing waits for your approval." count={count} />
          <ExceptionBlock title="Scheduled" kind="scheduled" figures={exceptions.scheduled} empty="Nothing is scheduled." count={count} />
          <ExceptionBlock title="Made measurable value" kind="value" figures={exceptions.value} empty="No counted value in these windows yet." count={count} />
          <section data-exception="completed" aria-label="Completed by the platform" className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
            <h3 className="font-display text-base font-semibold text-[var(--admin-ink)]">Completed by the platform</h3>
            {exceptions.completed.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {exceptions.completed.map((line) => (
                  <li key={line} className="text-sm text-[var(--admin-ink)]">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-[var(--admin-soft)]">Nothing recorded as done this week yet.</p>
            )}
          </section>
        </div>
        {exceptions.notCounted.length > 0 ? (
          <p data-exception="not-counted" className="mt-4 text-sm text-amber-800">
            Not counted: {exceptions.notCounted.map((f) => `${f.label}${f.note ? ` (${f.note})` : ''}`).join('; ')}.
          </p>
        ) : null}
      </section>

    </>
  )
}

async function TodaySix({ growthP }: { growthP: Promise<{ ok: true; g: Awaited<ReturnType<typeof readGrowthWeek>> } | { ok: false; why: string }> }) {
  const growth = await growthP
  const count = NUMBER()
  return (
    <>
      <section data-section="six-numbers" aria-label="The six numbers, week on week" className="mt-10">
        <h2 className="font-display text-2xl font-bold tracking-tight">The six numbers, week on week</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          Internal only. Each is last week beside the week before, marked real or estimated, with the rows it is counted from. A press out to another seller is never a
          sale, and contribution is what was kept, never what was sold.
        </p>
        {growth.ok ? (
          <ul className="mt-6 space-y-3">
            {growth.g.six.last.map((f, i) => {
              const before = growth.g.six.before[i]
              return (
                <li key={f.key} data-six={f.key} className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <h3 className="font-display text-base font-semibold text-[var(--admin-ink)]">{f.label}</h3>
                    <span className={`shrink-0 text-xs font-semibold uppercase tracking-[0.12em] ${f.basis === 'real' ? 'text-emerald-800' : 'text-amber-800'}`}>{f.basis}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--admin-ink)]">
                    <span className="font-semibold">{f.display ?? (f.value === null ? 'Not counted' : count.format(f.value))}</span>
                    <span className="text-[var(--admin-soft)]"> last week; </span>
                    <span>{before ? (before.display ?? (before.value === null ? 'not counted' : count.format(before.value))) : 'not counted'}</span>
                    <span className="text-[var(--admin-soft)]"> the week before</span>
                  </p>
                  <p className="mt-2 text-xs text-[var(--admin-muted)]">Counted from {f.source}.</p>
                </li>
              )
            })}
          </ul>
        ) : (
          <p data-six="not-read" className="mt-4 text-sm text-amber-800">
            Not counted: the growth rows could not be read ({growth.why}). No figure is shown as 0.
          </p>
        )}
      </section>

    </>
  )
}

async function TodayRhythm({ dashboardP }: { dashboardP: Promise<Awaited<ReturnType<typeof readFounderDashboard>>> }) {
  const cadence = rhythm(await dashboardP)
  const count = NUMBER()
  return (
    <>
      <section data-section="rhythm" aria-label="Daily, weekly and monthly" className="mt-10">
        <h2 className="font-display text-2xl font-bold tracking-tight">Daily, weekly, monthly</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          Every figure once, in the rhythm it is read: daily for accuracy, responses, failures and what is about to post; weekly for approvals, acquisition, supply
          and conversion; monthly for retention, contribution, costs and readiness to grow.
        </p>
        <RhythmGroup title="Daily" cadence="daily" figures={cadence.daily} open count={count} />
        <RhythmGroup title="Weekly" cadence="weekly" figures={cadence.weekly} open={false} count={count} />
        <RhythmGroup title="Monthly" cadence="monthly" figures={cadence.monthly} open={false} count={count} />
      </section>
    </>
  )
}

/* THE SHAPES WHILE A SECTION READS (the admin's own loading tokens, src/app/admin/(authed)/loading.tsx): the size of what
   replaces them, no spinner, no words that claim anything. */
function HeaderShape() {
  return (
    <header aria-busy="true" className="mb-8 flex flex-col gap-4 border-b border-[var(--admin-line)] pb-6">
      <div className="min-w-0">
        <span className="block h-3 w-20 animate-pulse rounded bg-[var(--admin-tint-strong)]" />
        <span className="mt-3 block h-8 w-64 max-w-full animate-pulse rounded bg-[var(--admin-tint-strong)]" />
        <span className="mt-3 block h-4 w-96 max-w-full animate-pulse rounded bg-[var(--admin-tint-strong)]" />
      </div>
    </header>
  )
}

function CardsShape() {
  return (
    <div aria-busy="true" className="mb-8 grid grid-cols-1 gap-4 min-[375px]:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
          <span className="block h-3 w-24 animate-pulse rounded bg-[var(--admin-tint-strong)]" />
          <span className="mt-3 block h-7 w-20 animate-pulse rounded bg-[var(--admin-tint-strong)]" />
          <span className="mt-3 block h-3 w-40 max-w-full animate-pulse rounded bg-[var(--admin-tint-strong)]" />
        </div>
      ))}
    </div>
  )
}

function BlockShape({ h }: { h: string }) {
  return <div aria-busy="true" className={`mb-8 ${h} animate-pulse rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)]`} />
}

function figureValue(f: DashboardFigure, count: Intl.NumberFormat): string {
  return f.display ?? (f.value === null ? 'Not counted' : count.format(f.value))
}

function ExceptionBlock({ title, kind, figures, empty, count }: { title: string; kind: string; figures: readonly DashboardFigure[]; empty: string; count: Intl.NumberFormat }) {
  return (
    <section data-exception={kind} aria-label={title} className={`rounded-xl border bg-[var(--admin-paper)] p-5 ${kind === 'next' && figures.length > 0 ? 'border-amber-300/60' : 'border-[var(--admin-line)]'}`}>
      <h3 className="font-display text-base font-semibold text-[var(--admin-ink)]">{title}</h3>
      {figures.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--admin-line)]">
          {figures.map((f) => (
            <li key={f.label} data-figure={f.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
              <span className="text-sm text-[var(--admin-ink)]">{f.label}</span>
              <span className="font-display text-lg font-semibold text-[var(--admin-ink)]">{figureValue(f, count)}</span>
              {f.note ? <span className="w-full text-xs text-[var(--admin-soft)]">{f.note}</span> : null}
              {f.href ? (
                <Link prefetch={false}
                  href={f.href}
                  className="inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-accent-strong)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
                >
                  Open
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[var(--admin-soft)]">{empty}</p>
      )}
    </section>
  )
}

function RhythmGroup({ title, cadence, figures, open, count }: { title: string; cadence: string; figures: readonly DashboardFigure[]; open: boolean; count: Intl.NumberFormat }) {
  return (
    <details data-cadence={cadence} open={open} className="mt-4 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
      <summary className="flex min-h-[44px] cursor-pointer items-center font-display text-lg font-semibold text-[var(--admin-ink)]">
        {title}
        <span className="ml-2 text-sm font-normal text-[var(--admin-muted)]">{figures.length}</span>
      </summary>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {figures.map((f) => (
          <li key={f.label} data-figure={f.label} className="rounded-lg border border-[var(--admin-line)] p-4">
            <p className="text-xs text-[var(--admin-muted)]">{f.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-[var(--admin-ink)]">{figureValue(f, count)}</p>
            {f.note ? <p className="mt-1 text-xs text-[var(--admin-soft)]">{f.note}</p> : null}
          </li>
        ))}
      </ul>
    </details>
  )
}
