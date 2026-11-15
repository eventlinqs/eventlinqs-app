import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { queryAuditLog, recordAuditEvent } from '@/lib/admin/audit'
import { readAutomation, type AutomationCard } from '@/lib/admin/automation'
import { needsYou, TARGETS } from '@/lib/admin/automation-math'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { AuditLine, PageHeader, Panel, PRIMARY, SECONDARY, StatCard, StatusChip, type ChipTone } from '@/components/admin/ui/admin-kit'
import { PendingButton } from '@/components/admin/ui/pending-button'
import { AdminToast } from '@/components/admin/ui/admin-toast'
import { setSenderModeAction, setSocialAutoPublishAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Automation | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * /admin/automation, LAWAL'S HOME SCREEN AS EMPLOYEE ONE (his 13:41 and 13:55 of 15 November 2026), REDESIGNED ON HIS
 * 20:52 (item 2: "a workflow-organized admin page ... I should click a button and obviously know what's happened"): a
 * clear header with one primary action, the three numbers as cards against their targets, "Needs you today" first, then
 * one card per recurring task with its status chip, what it does, its schedule, its last run, its figures, its one
 * switch (pending while pressed, its result as a toast) and the last change to that switch from the audit log. The reads
 * are src/lib/admin/automation.ts, the rules automation-math.ts.
 */
const STATE: Record<AutomationCard['state'], { words: string; tone: ChipTone }> = {
  runs: { words: 'Runs by itself', tone: 'ok' },
  waits: { words: 'Waits for you', tone: 'waits' },
  off: { words: 'Off', tone: 'off' },
}

function when(iso: string | null): string {
  return iso ? formatPlatformDateTime(iso) : 'not recorded'
}

/** The last change to each switch, in words, from the admin audit log. */
async function lastChanges(): Promise<{ social: string | null; sender: string | null }> {
  const out = { social: null as string | null, sender: null as string | null }
  try {
    const { rows } = await queryAuditLog({ actions: ['admin.automation.social_auto_publish', 'admin.automation.sender_mode'], limit: 20 })
    for (const r of rows) {
      const who = r.actor_email_snapshot ?? 'a person'
      const refused = typeof r.metadata?.refused === 'string' && r.metadata.refused ? ' (refused by the database)' : ''
      if (r.action === 'admin.automation.social_auto_publish' && !out.social) {
        out.social = `Last changed ${when(r.created_at)} by ${who}: publishing ${r.metadata?.enabled ? 'on' : 'off'}${refused}.`
      }
      if (r.action === 'admin.automation.sender_mode' && !out.sender) {
        out.sender = `Last changed ${when(r.created_at)} by ${who}: sender ${String(r.metadata?.mode ?? 'changed')}${refused}.`
      }
    }
  } catch {
    // The audit log is read for its words only; a page never fails on it.
  }
  return out
}

function SwitchControl({ card, audit }: { card: AutomationCard; audit: { social: string | null; sender: string | null } }) {
  const sw = card.switch
  if (sw.kind === 'flag') {
    return (
      <form action={setSocialAutoPublishAction} className="mt-5 border-t border-white/[0.06] pt-4">
        <input type="hidden" name="on" value={sw.on ? 'false' : 'true'} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/75">Publishing by itself is <strong className="text-white">{sw.on ? 'on' : 'off'}</strong>.</p>
          <PendingButton pending={sw.on ? 'Stopping' : 'Switching on'} className={sw.on ? SECONDARY : PRIMARY}>
            {sw.on ? 'Stop publishing' : 'Switch publishing on'}
          </PendingButton>
        </div>
        <AuditLine line={audit.social} />
      </form>
    )
  }
  if (sw.kind === 'sender') {
    const live = sw.mode === 'live'
    return (
      <form action={setSenderModeAction} className="mt-5 border-t border-white/[0.06] pt-4">
        <input type="hidden" name="mode" value={live ? 'hold' : 'live'} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/75">
            The sender is <strong className="text-white">{sw.mode === 'live' ? 'live' : sw.mode === 'test' ? 'in test' : 'on hold'}</strong>; SPF, DKIM and DMARC{' '}
            {sw.dnsOk ? 'pass' : 'do not pass yet'}
            {sw.dnsCheckedAt ? `, checked ${when(sw.dnsCheckedAt)}` : ''}.
          </p>
          <PendingButton pending={live ? 'Stopping' : 'Switching on'} className={live ? SECONDARY : PRIMARY}>
            {live ? 'Stop sending' : 'Send by itself'}
          </PendingButton>
        </div>
        <AuditLine line={audit.sender} />
      </form>
    )
  }
  return <p className="mt-5 border-t border-white/[0.06] pt-4 text-sm text-white/60">{sw.note}</p>
}

export default async function AdminAutomationPage({ searchParams }: { searchParams: Promise<{ said?: string; tone?: string }> }) {
  const { said, tone } = await searchParams
  const session = await requireAdminSession()
  if (!can(session, 'admin.dashboard.view')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.automation.view', session })
  const [{ numbers, cards }, audit] = await Promise.all([readAutomation(new Date()), lastChanges()])
  const needs = cards.filter((c) => c.waitsFor || c.readFailed)
  const running = cards.filter((c) => c.state === 'runs').length
  const message = said === 'invalid' ? 'That press was not understood; nothing was changed.' : said ?? null

  return (
    <div>
      <AdminToast said={message} tone={tone === 'ok' ? 'ok' : said ? 'refused' : 'ok'} />
      <PageHeader
        eyebrow="Automation"
        title="EventLinqs, running by itself"
        description={`${running} of ${cards.length} recurring tasks run by themselves. What needs you is first; when the machine is healthy that list is empty.`}
        action={
          needs.length > 0 ? (
            <a href="#needs-you" className={PRIMARY}>Review what needs you ({needs.length})</a>
          ) : (
            <Link href="/admin/today" className={PRIMARY}>Open today</Link>
          )
        }
      />

      <section data-section="three-numbers" aria-label="The three numbers" className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {'failed' in numbers ? (
          <p className="text-sm text-white/70">The numbers could not be read: {numbers.failed}</p>
        ) : (
          <>
            <StatCard label="Organisers selling this month" value={numbers.organisersSelling} progress={numbers.organisersSelling / TARGETS.organisersSelling} sub={`Target ${TARGETS.organisersSelling} by ${TARGETS.by}`} />
            <StatCard label="Paid tickets this month" value={numbers.paidTicketsThisMonth.toLocaleString('en-AU')} progress={numbers.paidTicketsThisMonth / TARGETS.paidTickets} sub={`Last month ${numbers.paidTicketsLastMonth.toLocaleString('en-AU')}; target ${TARGETS.paidTickets.toLocaleString('en-AU')} by ${TARGETS.by}`} />
            <StatCard label="Month on month growth" value={numbers.growthPercent === null ? 'No base yet' : `${numbers.growthPercent}%`} progress={numbers.growthPercent === null ? null : numbers.growthPercent / TARGETS.growthPercent} sub={`Target ${TARGETS.growthPercent}% a month`} />
          </>
        )}
      </section>

      <div id="needs-you" data-section="needs-you" className="mb-8 scroll-mt-6">
        <Panel title="Needs you today" count={needsYou(cards).tasks}>
          {needs.length === 0 ? (
            <p className="flex items-center gap-3 text-sm text-white/75"><StatusChip tone="ok">All clear</StatusChip> Every task ran by itself.</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {needs.map((c) => (
                <li key={c.key} data-needs={c.key} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-white">{c.title}</span>
                      <StatusChip tone={c.readFailed ? 'fault' : 'waits'}>{c.readFailed ? 'Could not be read' : 'Waits for you'}</StatusChip>
                    </div>
                    <p className="mt-1 text-sm text-white/70">{c.readFailed ? `Its figures could not be read: ${c.readFailed}` : c.waitsFor}</p>
                  </div>
                  {c.link ? <Link href={c.link.href} className={SECONDARY}>{c.link.label}</Link> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <section aria-label="Every task" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {cards.map((c) => (
          <article key={c.key} data-card={c.key} className="flex flex-col rounded-xl border border-white/[0.08] bg-[#131A2A] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-white">{c.title}</h2>
              <span data-state={c.state}><StatusChip tone={STATE[c.state].tone}>{STATE[c.state].words}</StatusChip></span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{c.does}</p>
            <dl className="mt-4 grid grid-cols-1 gap-1 text-xs text-white/60">
              {c.schedules.map((s) => (
                <div key={`${s.path} ${s.cron}`} className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-white/70">Next run</dt>
                  <dd>{when(s.next)} ({s.where === 'github' ? 'GitHub Actions' : 'Vercel'}, <span className="font-mono">{s.cron}</span> UTC)</dd>
                </div>
              ))}
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-white/70">Last run</dt>
                <dd>{c.lastRun ? `${when(c.lastRun.at)}, ${c.lastRun.what}` : 'not recorded by this task'}</dd>
              </div>
            </dl>
            {c.readFailed ? (
              <p className="mt-4 text-sm text-rose-300">Its figures could not be read: {c.readFailed}</p>
            ) : [...c.queue, ...c.results].length > 0 ? (
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[...c.queue, ...c.results].map((f) => (
                  <div key={f.label} className="rounded-lg bg-white/[0.04] px-3 py-2">
                    <dt className="text-[11px] text-white/55">{f.label}</dt>
                    <dd className="font-display text-lg font-bold text-white">{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <div className="mt-auto">
              <SwitchControl card={c} audit={audit} />
              {c.link ? (
                <Link href={c.link.href} className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-[var(--brand-accent)] underline-offset-2 hover:underline">{c.link.label}</Link>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
