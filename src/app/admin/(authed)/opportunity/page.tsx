import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readOpportunity } from '@/lib/growth/opportunity'
import { DIMENSIONS, WINDOW_DAYS, type Dimension } from '@/lib/growth/opportunity-math'

/**
 * THE EVENT OPPORTUNITY SCORE, IN ADMIN (window 6, 27 October 2026; the locked foundation's item 16: "Shown in admin;
 * says 'needs two weeks of numbers' until it has them"). Every published event not yet over, scored 0 to 100 from
 * window 5's five dimensions against its city and category peers (src/lib/growth/opportunity-math.ts), the highest
 * first; each part shown, so the score is never a number without its reasons. Staff only, never indexed.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Opportunity score | EventLinqs Admin',
  robots: { index: false, follow: false },
}

const LABEL: Record<Dimension, string> = {
  relevance: 'Relevance',
  attention: 'Attention',
  engagement: 'Engagement',
  conversion: 'Conversion',
  health: 'Business health',
}

export default async function AdminOpportunityPage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.opportunity.view', session })

  const rows = await readOpportunity(new Date())
  const scored = rows.flatMap((r) => (r.state === 'scored' ? [r] : [])).sort((a, b) => b.score - a.score)
  const waiting = rows.filter((r) => r.state === 'needs_two_weeks')

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Opportunity score</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Each event out of 100: relevance, attention, engagement, conversion and business health over the last {WINDOW_DAYS} days, 20 each,
          against the events of its own city and category. 10 in a part is the middle of its peers.
        </p>
      </header>

      {scored.length === 0 ? (
        <p className="text-sm text-white/60">No event has two weeks of numbers yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#131A2A]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-[0.18em] text-white/50">
              <tr>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Score</th>
                {DIMENSIONS.map((d) => (
                  <th key={d} className="px-4 py-3">
                    {LABEL[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scored.map((r) => (
                <tr key={r.id} className="border-t border-white/[0.06]">
                  <td className="px-4 py-3">
                    <Link href={`/events/${r.slug}`} className="text-white underline-offset-2 hover:underline">
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-semibold text-white">{r.score}</td>
                  {DIMENSIONS.map((d) => (
                    <td key={d} className="px-4 py-3 text-white/70">
                      {r.parts[d]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {waiting.length > 0 ? (
        <p className="mt-6 text-sm text-white/60">
          {waiting.length} {waiting.length === 1 ? 'event needs' : 'events need'} two weeks of numbers before {waiting.length === 1 ? 'it is' : 'they are'} scored.
        </p>
      ) : null}
    </div>
  )
}
