import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { requireVenueSeatingAccess } from '@/lib/organisations/access'
import { formatEventDate } from '@/lib/dates/event-time'
import { REPORT_AFTER_HOURS } from '@/lib/growth/organiser-report-math'
import { readVenueReport } from '@/lib/venues/venue-report'

export const metadata: Metadata = {
  title: 'Venue report | EventLinqs',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

/**
 * THE VENUE'S OWN REPORT (the DemandOS directive of 30 October 2026, section 3). What EventLinqs can show a venue about
 * its nights, in the four honest levels and never more; which nights and how much of each is
 * src/lib/venues/venue-report-math.ts. Behind the seat map screen's gate: owner, admin or manager of the venue's
 * organisation, anybody else not found. The figures are the kept night reports, so they exist two days after a night.
 */
export default async function VenueReportPage({ params }: Props) {
  const { id: venueId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const access = await requireVenueSeatingAccess(supabase, user.id, venueId)
  if (!access.ok) notFound()

  const venue = await readOrThrow('venue report venue', () =>
    createAdminClient().from('venues').select('name').eq('id', venueId).eq('organisation_id', access.organisationId).is('removed_at', null).maybeSingle(),
  )
  if (!venue) notFound()

  const report = await readVenueReport(venueId, access.organisationId)

  return (
    <div className="max-w-2xl">
      <div className="mb-6 print:hidden">
        <Link href="/dashboard/venues" className="inline-flex min-h-[44px] items-center text-sm text-ink-600 hover:text-ink-900">
          ← Back to venues
        </Link>
      </div>

      <article data-venue-report className="rounded-2xl border border-ink-200 bg-white p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Venue report</p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900">{venue.name}</h1>

        {report.empty ? (
          <p className="mt-6 text-sm leading-relaxed text-ink-700">
            No night here has been reported yet. A report is kept {REPORT_AFTER_HOURS / 24} days after each night ends, and it adds up here.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink-600">
              {report.levels.nights} {report.levels.nights === 1 ? 'night' : 'nights'} reported
            </p>
            <ul className="mt-6 divide-y divide-ink-100 border-y border-ink-100">
              {report.lines.map((line) => (
                <li key={line} className="py-3 text-sm leading-relaxed text-ink-800">
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              These are what was counted. They do not show which bookings would have happened anyway.
            </p>

            <section aria-label="Night by night" className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">Night by night</h2>
              <ul className="mt-3 divide-y divide-ink-100 border-y border-ink-100">
                {report.nights.map((night) => (
                  <li key={night.eventId} data-night={night.eventId} className="py-3">
                    <p className="text-sm font-semibold text-ink-900">
                      {night.own ? (
                        <Link href={`/dashboard/events/${night.eventId}/report`} className="hover:underline">
                          {night.title}
                        </Link>
                      ) : (
                        night.title
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-600">
                      {formatEventDate(night.startDate, night.timezone)}
                      {night.own ? '' : ', run by another organiser'}
                    </p>
                    <p className="mt-1 text-sm text-ink-700">
                      {night.interest.people} opened the listing, {night.bookingIntent.people} went on to book
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}

        {report.unread > 0 && (
          <p className="mt-6 text-sm text-ink-600">
            {report.unread} older {report.unread === 1 ? 'report' : 'reports'} could not be read here and {report.unread === 1 ? 'is' : 'are'} not counted above.
          </p>
        )}
      </article>
    </div>
  )
}
