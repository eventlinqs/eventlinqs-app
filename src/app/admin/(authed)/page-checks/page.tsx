import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { readPageChecks, readPageCopy } from '@/lib/outreach/page-checks'
import { stopPageCheckAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Page checks | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * THE ENGINE'S PAGE CHECKS (law 43; Lawal, 21 November 2026, 01:05: "The engine reads each organizer's page and saves a
 * copy as evidence. You see each one in the morning report and can stop any"). Every check of the last fourteen days,
 * newest first: the organiser, the address, the page and the time; its saved copy opens below, shown inert (a sandboxed
 * frame runs none of the page's scripts); Stop holds that organiser's letters. The morning report links each check here.
 */
const BUTTON =
  'inline-flex min-h-[44px] items-center rounded-full border border-[var(--admin-line)] px-5 text-sm font-semibold text-[var(--admin-ink)] hover:border-[var(--admin-ink)]'

export default async function AdminPageChecksPage({ searchParams }: { searchParams: Promise<{ said?: string; view?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.page_checks.view', session })
  const { said, view } = await searchParams
  const db = createAdminClient()
  const since = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString()
  const [rows, copy] = await Promise.all([
    readPageChecks(db, since).then((r) => ({ ok: true as const, r }), (e: unknown) => ({ ok: false as const, why: e instanceof Error ? e.message : String(e) })),
    view && /^[0-9a-f-]{36}$/i.test(view) ? readPageCopy(db, view).catch(() => null) : Promise.resolve(null),
  ])
  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Organiser Marketing</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Page checks</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          Each organiser page the engine checked before a first letter: the address is on their own site, the page says nothing
          against messages, and they run events in their city. Open the saved copy, or stop a check to hold their letters.
        </p>
      </header>
      {said === undefined ? null : (
        <p role="status" data-said className="mb-6 max-w-2xl rounded-lg border border-[var(--admin-line)] bg-[var(--admin-tint)] p-4 text-sm text-[var(--admin-ink)]">
          {said}
        </p>
      )}
      {!rows.ok ? (
        <p data-state="unread" className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6 text-sm text-[var(--admin-soft)]">
          The page checks could not be read: {rows.why}
        </p>
      ) : rows.r.length === 0 ? (
        <p data-state="empty" className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6 text-sm text-[var(--admin-soft)]">
          No page checked by the engine in the last fourteen days.
        </p>
      ) : (
        <ul className="space-y-4">
          {rows.r.map((c) => (
            <li key={c.id} data-check={c.id} className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">{c.organiser || 'An organiser'}</h2>
                <span className="text-sm text-[var(--admin-soft)]">{formatPlatformDateTime(c.checkedAt)}</span>
              </div>
              <p className="mt-1 text-sm text-[var(--admin-soft)]">
                {c.address} on{' '}
                <a href={c.pageUrl} rel="noopener noreferrer" target="_blank" className="underline">
                  {c.pageUrl}
                </a>
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a href={`/admin/page-checks?view=${c.id}#copy`} className={BUTTON}>
                  Open the saved copy
                </a>
                {c.stoppedAt ? (
                  <span data-state="stopped" className="text-sm text-[var(--admin-soft)]">
                    Stopped {formatPlatformDateTime(c.stoppedAt)}{c.stoppedReason ? `: ${c.stoppedReason}` : ''}
                  </span>
                ) : (
                  <form action={stopPageCheckAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className={BUTTON}>
                      Stop this check
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {copy === null ? null : (
        <section id="copy" className="mt-10 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-5">
          <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">The saved copy</h2>
          <p className="mt-1 break-all text-xs text-[var(--admin-soft)]">
            {copy.pageUrl}, sha256 {copy.sha256}
          </p>
          <iframe title="The saved copy of the organiser's page" sandbox="" srcDoc={copy.html} className="mt-4 h-[600px] w-full rounded-lg border border-[var(--admin-line)] bg-white" />
        </section>
      )}
    </div>
  )
}
