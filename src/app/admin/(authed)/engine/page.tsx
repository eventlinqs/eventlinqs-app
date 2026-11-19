import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readEngine, type EngineRow } from '@/lib/admin/engine'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { PageHeader, StatusChip, type ChipTone } from '@/components/admin/ui/admin-kit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Engine | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * /admin/engine, ONE ROW PER AUTOMATION (the operating model's amendment 1, A4 and A5; the PM's 01:39 of 19 November 2026).
 * Each row: its business area and what it does, its schedule and next run in Melbourne time, its last production run
 * with its evidence, its last failure and whether it recovered, its switch, and "proving, day N of 3" or "running
 * permanently", read from its own records (src/lib/admin/engine.ts). No row says it runs without a production run
 * behind it. The morning report links here.
 */
function when(iso: string | null): string {
  return iso ? formatPlatformDateTime(iso) : 'not recorded'
}

function provingChip(r: EngineRow): { tone: ChipTone; words: string } {
  if (r.readFailed) return { tone: 'fault', words: 'Could not be read' }
  if (!r.proving) return { tone: 'info', words: 'Read on GitHub' }
  return r.proving.permanent ? { tone: 'ok', words: r.proving.line } : { tone: 'waits', words: r.proving.line }
}

export default async function AdminEnginePage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.dashboard.view')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.engine.view', session })
  const rows = await readEngine(new Date())
  const permanent = rows.filter((r) => r.proving?.permanent).length
  const read = rows.filter((r) => r.proving !== null).length

  return (
    <div>
      <PageHeader
        eyebrow="Engine"
        title="Every automation, from its own records"
        description={`${permanent} of ${read} automations read here have run by themselves three days in a row. Each row is read now from the records its automation keeps.`}
      />
      <section aria-label="Every automation" className="grid grid-cols-1 gap-4">
        {rows.map((r) => {
          const chip = provingChip(r)
          return (
            <article key={r.key} data-engine-row={r.key} className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-accent)]">{r.area}</p>
                  <h2 className="mt-1 font-display text-lg font-semibold text-white">{r.title}</h2>
                </div>
                <span data-proving={r.proving ? (r.proving.permanent ? 'permanent' : `day-${r.proving.day}`) : 'not-read'}>
                  <StatusChip tone={chip.tone}>{chip.words}</StatusChip>
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/70">{r.does}</p>
              <dl className="mt-4 grid grid-cols-1 gap-1 text-sm text-white/70">
                {r.schedules.map((s) => (
                  <div key={s.cron} className="flex flex-wrap gap-x-2">
                    <dt className="font-medium text-white/80">Next run</dt>
                    <dd>{when(s.next)} ({s.where === 'github' ? 'GitHub Actions' : 'Vercel'}, <span className="font-mono">{s.cron}</span> UTC)</dd>
                  </div>
                ))}
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-white/80">Last run</dt>
                  <dd data-last-run>
                    {r.lastRun ? `${when(r.lastRun.at)}, ${r.lastRun.what}` : r.readFailed ? 'not read' : 'none in its records'}
                    {r.lastRun?.evidence ? (
                      /^https?:\/\//.test(r.lastRun.evidence) ? (
                        <>
                          {' '}
                          <a href={r.lastRun.evidence} className="text-[var(--brand-accent)] underline-offset-2 hover:underline" rel="noreferrer" target="_blank">its post</a>
                        </>
                      ) : (
                        <span className="font-mono text-xs text-white/50"> ({r.lastRun.evidence})</span>
                      )
                    ) : null}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-white/80">Last failure</dt>
                  <dd data-last-failure>
                    {r.lastFailure ? `${when(r.lastFailure.at)}, ${r.lastFailure.what}${r.lastFailure.recovered === true ? '; a good run followed' : r.lastFailure.recovered === false ? '; no good run since' : ''}` : r.readFailed ? 'not read' : 'none in its records this week'}
                  </dd>
                </div>
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-white/80">Switch</dt>
                  <dd>{r.switch}</dd>
                </div>
              </dl>
              {r.note ? <p className="mt-3 text-sm text-white/60">{r.note}</p> : null}
              {r.readFailed ? <p className="mt-3 text-sm text-rose-300">Its records could not be read: {r.readFailed}</p> : null}
            </article>
          )
        })}
      </section>
    </div>
  )
}
