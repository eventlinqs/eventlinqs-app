import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { readCentre } from '@/lib/comms/centre'
import type { Figures } from '@/lib/comms/centre-math'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Communications centre | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * THE GROWTH AND COMMUNICATIONS CENTRE (Law 24; Lawal's master communications directive of 18 November 2026,
 * section 7: "one Growth & Communications Centre ... separate sections for: Organiser Acquisition. Event Permissions.
 * Listing Communications. Social Media Marketing. Organiser Retention. Ticketing Conversion. System Operations.").
 *
 * Seven sections, in his order, each with the ten figures he named, counted from the database by the one category every
 * message record carries (src/lib/comms/centre.ts). A figure no record can hold says so; it is never shown as a zero.
 * Nothing on this page sends, approves or changes anything.
 */
const FIGURES: { key: keyof Omit<Figures, 'lastUpdated'>; label: string; none: string }[] = [
  { key: 'total', label: 'Total records', none: '' },
  { key: 'pending', label: 'Pending', none: 'No waiting step' },
  { key: 'approved', label: 'Approved', none: 'No approval step' },
  { key: 'scheduled', label: 'Scheduled', none: 'Not scheduled' },
  { key: 'sent', label: 'Sent or published', none: 'Not sent from here' },
  { key: 'delivered', label: 'Delivered or confirmed', none: 'No provider confirms it' },
  { key: 'failed', label: 'Failed', none: 'Not recorded' },
  { key: 'outcomes', label: 'Replies or outcomes', none: 'Not measured yet' },
  { key: 'withdrawn', label: 'Withdrawn, never sent', none: 'Does not apply' },
]

export default async function AdminCommsCentrePage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.comms.view', session })

  const centre = await readCentre(createAdminClient(), new Date())

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Today</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Growth and Communications Centre</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Every message EventLinqs sends, in its one category, counted from the database. Read {formatPlatformDateTime(centre.readAt)}.
        </p>
      </header>

      <div className="grid gap-6">
        {centre.sections.map((s) => (
          <section key={s.category} data-category={s.category} aria-labelledby={`comms-${s.category}`} className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id={`comms-${s.category}`} className="font-display text-lg font-semibold text-white">
                <span className="mr-2 font-mono text-sm text-[var(--brand-accent)]">{s.category}</span>
                {s.name}
              </h2>
              <p className="text-sm text-white/60" data-last-updated>
                {s.figures.lastUpdated ? `Last updated ${formatPlatformDateTime(s.figures.lastUpdated)}` : 'Nothing recorded yet'}
              </p>
            </div>
            <p data-next-action className="mt-3 text-sm font-semibold text-white">
              Next action: {s.nextAction}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
              {FIGURES.map((f) => {
                const v = s.figures[f.key]
                return (
                  <div key={f.key} data-figure={f.key} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-[0.14em] text-white/50">{f.label}</dt>
                    <dd className={v === null ? 'mt-1 text-sm text-white/50' : 'mt-1 font-display text-2xl font-semibold text-white'}>
                      {v === null ? f.none : v.toLocaleString('en-AU')}
                    </dd>
                  </div>
                )
              })}
            </dl>
            {s.extra.length > 0 ? (
              <ul className="mt-4 space-y-1 text-sm text-white/70">
                {s.extra.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-4 text-xs text-white/40">Read from {s.sources.join('; ')}.</p>
          </section>
        ))}
      </div>
    </div>
  )
}
