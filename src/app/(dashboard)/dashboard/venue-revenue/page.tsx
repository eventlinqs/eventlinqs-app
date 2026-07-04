import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { readVenueDashboardForUser } from '@/lib/venues/dashboard'
import { formatMoneyDisplay } from '@/lib/money/format'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Venue revenue | EventLinqs',
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'enrolled') {
    return <span className="inline-flex rounded-full bg-gold-100 px-2.5 py-0.5 text-xs font-semibold text-gold-800">Earning</span>
  }
  if (status === 'suspended') {
    return <span className="inline-flex rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-semibold text-ink-600">Paused</span>
  }
  return <span className="inline-flex rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-400">Not enrolled</span>
}

/**
 * Venue-facing dashboard for the Venue Revenue Sharing Program. A venue operator
 * (organisation owner / manager) sees each of their venues' enrolment status,
 * what they have earned and been paid, and the events that earned it. Read-only:
 * enrolment and payouts are run by EventLinqs.
 */
export default async function VenueRevenueDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { ratePercentage, venues } = await readVenueDashboardForUser(user.id)
  const rateLabel = ratePercentage != null ? `${ratePercentage}%` : 'a share'
  const anyEnrolled = venues.some((v) => v.status === 'enrolled')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-gold-800">Venue revenue sharing</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-900">Your venue earnings</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-600">
          When you are enrolled, your venue earns {rateLabel} of the EventLinqs platform fee on every
          paid ticket for an event held at your venue. It comes out of our fee, never the organiser
          payout or the ticket price, and you are paid after each event. Enrolment is arranged with
          the EventLinqs team.
        </p>
      </header>

      {venues.length === 0 ? (
        <div className="rounded-2xl border border-ink-100 bg-white p-10 text-center">
          <h2 className="font-display text-lg font-semibold text-ink-900">No venues yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
            Add a venue to your organisation, then talk to the EventLinqs team about enrolling it in
            revenue sharing. Once enrolled, every ticket sold for an event at your venue earns you a
            share automatically.
          </p>
          <Link
            href="/dashboard/venues"
            className="mt-5 inline-flex items-center rounded-lg bg-ink-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-900"
          >
            Manage your venues
          </Link>
        </div>
      ) : (
        <>
          {!anyEnrolled && (
            <div className="mb-6 rounded-xl border border-gold-400/40 bg-gold-100 px-5 py-4 text-sm text-ink-800">
              None of your venues are enrolled yet. Enrolment is free and pays you {rateLabel} of the
              platform fee on every paid ticket. Contact the EventLinqs team to enrol.
            </div>
          )}

          <div className="space-y-5">
            {venues.map((v) => (
              <section key={v.id} className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="font-display text-xl font-semibold text-ink-900">{v.name}</h2>
                      <StatusBadge status={v.status} />
                    </div>
                    <p className="mt-1 text-sm text-ink-400">
                      {v.city ?? 'Venue'}
                      {v.enrolledAt ? ` | enrolled ${new Date(v.enrolledAt).toLocaleDateString('en-AU')}` : ''}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-right">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-ink-400">Earned</p>
                      <p className="mt-0.5 font-display text-lg font-semibold text-ink-900">{formatMoneyDisplay(v.earnedNetCents, v.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-ink-400">Paid</p>
                      <p className="mt-0.5 font-display text-lg font-semibold text-ink-900">{formatMoneyDisplay(v.paidCents, v.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-ink-400">Owed</p>
                      <p className="mt-0.5 font-display text-lg font-semibold text-gold-800">{formatMoneyDisplay(v.payableCents, v.currency)}</p>
                    </div>
                  </div>
                </div>

                {v.events.length > 0 && (
                  <div className="mt-5 overflow-x-auto rounded-xl border border-ink-100">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-ink-100 text-left text-ink-400">
                          <th scope="col" className="px-4 py-2.5 font-medium">Event</th>
                          <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                          <th scope="col" className="px-4 py-2.5 font-medium text-right">Paid</th>
                          <th scope="col" className="px-4 py-2.5 font-medium text-right">Owed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {v.events.map((e) => (
                          <tr key={e.eventId} className="border-b border-ink-100 last:border-0">
                            <td className="px-4 py-2.5 text-ink-800">{e.title ?? 'Event'}</td>
                            <td className="px-4 py-2.5 text-ink-400">{e.endDate ? new Date(e.endDate).toLocaleDateString('en-AU') : 'TBC'}</td>
                            <td className="px-4 py-2.5 text-right text-ink-700">{formatMoneyDisplay(e.paidCents, v.currency)}</td>
                            <td className="px-4 py-2.5 text-right font-medium text-ink-900">{formatMoneyDisplay(e.payableCents, v.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
