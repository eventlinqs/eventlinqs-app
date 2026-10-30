import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { levelCounts, type CampaignLevel } from '@/lib/campaigns/eligibility'
import { readEligibility, type EligibilityReport, type JudgedEvent } from '@/lib/campaigns/eligibility-read'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Campaign eligibility | EventLinqs Admin',
  robots: { index: false, follow: false },
}

const LEVELS: { key: CampaignLevel | 'none'; label: string; means: string }[] = [
  { key: 'performance', label: 'Performance', means: 'Could carry paid campaigns. Paid controls stay off.' },
  { key: 'featured', label: 'Featured', means: 'Social, guides and partner sharing.' },
  { key: 'discovery', label: 'Discovery', means: 'Listed, in its city and category.' },
  { key: 'none', label: 'No level', means: 'Not promoted until the fault is fixed.' },
]

const SHOWN = 100

function Night({ e }: { e: JudgedEvent }) {
  const held = e.checks.filter((c) => !c.ok)
  return (
    <li className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <Link href={`/events/${e.slug}`} className="inline-flex min-h-[44px] items-center font-medium text-white underline underline-offset-2">
        {e.title}
      </Link>
      <p className="text-xs text-white/60">{e.level ?? 'No level'}</p>
      {held.length > 0 && <p className="mt-1 text-xs text-white/60">{held.map((c) => c.words).join('. ')}.</p>}
    </li>
  )
}

/**
 * WHICH NIGHTS MAY BE PROMOTED, AND WHY (D1, src/lib/campaigns/eligibility.ts): the count at each level and each night's
 * reasons. It reads and says; it changes nothing, spends nothing and publishes nothing.
 */
export default async function AdminEligibilityPage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.eligibility.view', session })

  let report: EligibilityReport | null = null
  try {
    report = await readEligibility()
  } catch {
    report = null
  }
  const judged = report?.events ?? []
  const counts = levelCounts(judged)

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Campaign eligibility</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">Every public night in the next 90 days, judged on nine points. Not every event gets the same promotion.</p>
      </header>

      {report === null ? (
        <p role="alert" className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-6 text-sm text-amber-200">
          The nights could not be read just now. Refresh in a minute.
        </p>
      ) : (
        <>
          {report.venuePhotosUnread && (
            <p role="alert" className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              The venue photographs could not be read, so none counted in this reading.
            </p>
          )}
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {LEVELS.map((l) => (
              <div key={l.key} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <dt className="text-sm font-medium text-white">{l.label}</dt>
                <dd className="mt-1 font-display text-2xl font-bold">{counts[l.key]}</dd>
                <dd className="mt-1 text-xs text-white/60">{l.means}</dd>
              </div>
            ))}
          </dl>
          <h2 className="mb-3 mt-8 font-display text-lg font-semibold">
            The nights{judged.length > SHOWN ? `, the next ${SHOWN} of ${judged.length}` : ''}
          </h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {judged.slice(0, SHOWN).map((e) => (
              <Night key={e.eventId} e={e} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
