import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readAutomation, type AutomationCard } from '@/lib/admin/automation'
import { TARGETS } from '@/lib/admin/automation-math'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { setSenderModeAction, setSocialAutoPublishAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Automation | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * /admin/automation, LAWAL'S HOME SCREEN AS EMPLOYEE ONE (his 13:41 and 13:55 of 15 November 2026, relayed by the PM at
 * 13:55 and 14:10): the three test numbers on top; "Needs you today", empty when the machine is healthy; then one card
 * per recurring task with what it does, its schedule and next run, its last run where the task records one, today's
 * queue, its results and its one switch. The reads are src/lib/admin/automation.ts, the rules automation-math.ts.
 */
const STATE_WORDS = { runs: 'Runs', waits: 'Waits for you', off: 'Off' } as const
const STATE_CLASS = {
  runs: 'border-emerald-300/60 text-emerald-300',
  waits: 'border-[var(--brand-accent)]/40 text-[var(--brand-accent)]',
  off: 'border-white/20 text-white/60',
} as const
const PRESS =
  'inline-flex min-h-[44px] items-center rounded-full px-5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]'

function when(iso: string | null): string {
  return iso ? formatPlatformDateTime(iso) : 'not recorded'
}

function SwitchControl({ card }: { card: AutomationCard }) {
  const sw = card.switch
  if (sw.kind === 'flag') {
    return (
      <form action={setSocialAutoPublishAction} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="on" value={sw.on ? 'false' : 'true'} />
        <p className="text-sm text-white/70">Publishing by itself is <strong className="text-white">{sw.on ? 'on' : 'off'}</strong>.</p>
        <button type="submit" className={`${PRESS} ${sw.on ? 'border border-white/20 text-white' : 'bg-[var(--brand-accent)] text-[var(--color-navy-950)]'}`}>
          {sw.on ? 'Stop publishing' : 'Switch publishing on'}
        </button>
      </form>
    )
  }
  if (sw.kind === 'sender') {
    const live = sw.mode === 'live'
    return (
      <form action={setSenderModeAction} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="mode" value={live ? 'hold' : 'live'} />
        <p className="text-sm text-white/70">
          The sender is <strong className="text-white">{sw.mode === 'live' ? 'live' : sw.mode === 'test' ? 'in test' : 'on hold'}</strong>; SPF, DKIM and DMARC {sw.dnsOk ? 'pass' : 'do not pass'}
          {sw.dnsCheckedAt ? `, checked ${when(sw.dnsCheckedAt)}` : ''}.
        </p>
        <button type="submit" className={`${PRESS} ${live ? 'border border-white/20 text-white' : 'bg-[var(--brand-accent)] text-[var(--color-navy-950)]'}`}>
          {live ? 'Stop sending' : 'Send by itself'}
        </button>
      </form>
    )
  }
  return <p className="mt-4 text-sm text-white/60">{sw.note}</p>
}

export default async function AdminAutomationPage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  const { said } = await searchParams
  const session = await requireAdminSession()
  if (!can(session, 'admin.dashboard.view')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.automation.view', session })
  const { numbers, cards } = await readAutomation(new Date())
  const needs = cards.filter((c) => c.waitsFor || c.readFailed)

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Automation</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">EventLinqs, running by itself</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Every recurring task, what it did and when it runs next. The list under the numbers is empty when the machine is healthy.
        </p>
        {said ? <p role="status" className="mt-3 text-sm text-[var(--brand-accent)]">{said === 'invalid' ? 'That press was not understood.' : said}</p> : null}
      </header>

      <section data-section="three-numbers" aria-label="The three numbers" className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {'failed' in numbers ? (
          <p className="text-sm text-white/70">The numbers could not be read: {numbers.failed}</p>
        ) : (
          <>
            <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
              <p className="text-xs uppercase tracking-wider text-white/50">Organisers selling this month</p>
              <p className="mt-1 font-display text-3xl font-bold text-white">{numbers.organisersSelling}</p>
              <p className="mt-1 text-xs text-white/50">Target {TARGETS.organisersSelling} by {TARGETS.by}</p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
              <p className="text-xs uppercase tracking-wider text-white/50">Paid tickets this month</p>
              <p className="mt-1 font-display text-3xl font-bold text-white">{numbers.paidTicketsThisMonth}</p>
              <p className="mt-1 text-xs text-white/50">Last month {numbers.paidTicketsLastMonth}; target {TARGETS.paidTickets.toLocaleString('en-AU')} by {TARGETS.by}</p>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
              <p className="text-xs uppercase tracking-wider text-white/50">Month on month growth</p>
              <p className="mt-1 font-display text-3xl font-bold text-white">{numbers.growthPercent === null ? 'No base yet' : `${numbers.growthPercent}%`}</p>
              <p className="mt-1 text-xs text-white/50">Target {TARGETS.growthPercent}% a month</p>
            </div>
          </>
        )}
      </section>

      <section data-section="needs-you" aria-label="Needs you today" className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 sm:p-6">
        <h2 className="font-display text-lg font-semibold text-white">Needs you today</h2>
        {needs.length === 0 ? (
          <p className="mt-2 text-sm text-white/70">Nothing. Every task ran by itself.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {needs.map((c) => (
              <li key={c.key} data-needs={c.key} className="text-sm text-white/80">
                <span className="font-semibold text-white">{c.title}:</span> {c.readFailed ? `its figures could not be read (${c.readFailed})` : c.waitsFor}
                {c.link ? (
                  <Link href={c.link.href} className="ml-2 text-[var(--brand-accent)] underline-offset-2 hover:underline">{c.link.label}</Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Every task" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {cards.map((c) => (
          <article key={c.key} data-card={c.key} className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-white">{c.title}</h2>
              <span data-state={c.state} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${STATE_CLASS[c.state]}`}>{STATE_WORDS[c.state]}</span>
            </div>
            <p className="mt-2 text-sm text-white/70">{c.does}</p>
            {c.schedules.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-white/60">
                {c.schedules.map((s) => (
                  <li key={`${s.path} ${s.cron}`}>
                    <span className="font-mono">{s.cron}</span> UTC ({s.where === 'github' ? 'GitHub Actions' : 'Vercel'}): next {when(s.next)}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-xs text-white/60">Last run: {c.lastRun ? `${when(c.lastRun.at)}, ${c.lastRun.what}` : 'not recorded by this task'}</p>
            {c.readFailed ? (
              <p className="mt-3 text-sm text-[var(--brand-accent)]">Its figures could not be read: {c.readFailed}</p>
            ) : (
              <dl className="mt-3 grid grid-cols-2 gap-2">
                {[...c.queue, ...c.results].map((f) => (
                  <div key={f.label} className="rounded-lg border border-white/[0.06] p-2">
                    <dt className="text-[11px] text-white/50">{f.label}</dt>
                    <dd className="font-display text-lg font-bold text-white">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <SwitchControl card={c} />
            {c.link ? (
              <Link href={c.link.href} className="mt-3 inline-flex min-h-[44px] items-center text-sm text-[var(--brand-accent)] underline-offset-2 hover:underline">{c.link.label}</Link>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  )
}
