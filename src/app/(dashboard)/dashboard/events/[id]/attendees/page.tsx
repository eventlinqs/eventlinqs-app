import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getOrganiserEvent, fetchEventAttendees } from '@/lib/reporting/attendees'
import { AttendeeTable } from '@/components/dashboard/attendee-table'
import { fetchDoorReview } from '@/lib/reporting/door-review'
import { DoorReviewPanel } from '@/components/dashboard/door-review-panel'

export const metadata: Metadata = {
  title: 'Attendees | EventLinqs',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ id: string }> }

export default async function AttendeesPage({ params }: Props) {
  const { id } = await params

  const event = await getOrganiserEvent(id)
  if (!event) notFound()

  const [attendees, doorReview] = await Promise.all([fetchEventAttendees(id), fetchDoorReview(id)])
  const checkedIn = attendees.filter(a => a.checkedIn).length
  const notCheckedIn = attendees.length - checkedIn
  const ticketTypes = [...new Set(attendees.map(a => a.ticketType))].sort((a, b) => a.localeCompare(b))

  const exportBase = `/dashboard/events/${id}/attendees/export`

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={`/dashboard/events/${id}`} className="text-sm text-ink-600 hover:text-ink-900">
          ← Back to event
        </Link>
        <h1 className="text-2xl font-bold text-ink-900">Attendees</h1>
        {/*
          HIDDEN UNTIL THE TITLE FITS BESIDE IT. This row is `flex-wrap`, so at
          390 the event title wraps to a second line and the separator stayed
          behind on the first, leaving "Attendees ·" with nothing after it.
        */}
        <span className="hidden text-sm text-ink-400 sm:inline">·</span>
        <span className="text-sm text-ink-600">{event.title}</span>
      </div>

      {/* Export actions */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <a
          href={`${exportBase}?format=csv`}
          className="inline-flex min-h-[44px] items-center rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-gold-600"
        >
          Export CSV
        </a>
        <a
          href={`${exportBase}?format=xlsx`}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-100"
        >
          Export Excel
        </a>
        <a
          href={`${exportBase}?format=pdf`}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:bg-ink-100"
        >
          Print door list (PDF)
        </a>
        <Link
          href={`/dashboard/events/${id}/orders`}
          className="inline-flex min-h-[44px] items-center px-2 py-2 text-sm font-medium text-gold-800 underline hover:text-gold-700"
        >
          Orders report
        </Link>
      </div>

      {/*
        Summary tiles.

        GROUPED, and carrying their raw value in `data-stat-value`. The grouping
        is for a reader: an organiser past a thousand attendees was shown "1000"
        here with no separator and no sign that it was a ceiling rather than a
        count. The raw attribute is for the drive, which has to compare against
        a number the database counted rather than against a formatted string.
      */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-ink-200 bg-white p-5" data-stat="attendees" data-stat-value={attendees.length}>
          <p className="text-xs uppercase tracking-wider text-ink-600">Attendees</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{attendees.length.toLocaleString('en-AU')}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5" data-stat="checked-in" data-stat-value={checkedIn}>
          <p className="text-xs uppercase tracking-wider text-ink-600">Checked in</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{checkedIn.toLocaleString('en-AU')}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5" data-stat="not-checked-in" data-stat-value={notCheckedIn}>
          <p className="text-xs uppercase tracking-wider text-ink-600">Not checked in</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{notCheckedIn.toLocaleString('en-AU')}</p>
        </div>
      </div>

      {/* Data-ownership statement */}
      <div className="mb-6 rounded-xl border border-gold-100 bg-gold-100/60 p-5">
        <h2 className="text-sm font-semibold text-ink-900">You own your audience</h2>
        <p className="mt-1 text-sm text-ink-700">
          Every name and email on this list belongs to you, the organiser. EventLinqs will never
          market another organiser&apos;s event to your buyers, sell your list, or share it across
          organisers. Export your data any time as CSV, Excel, or a printable door list, and take it
          with you.
        </p>
        <p className="mt-2 text-sm text-ink-700">
          When you send marketing email, send only to attendees marked <strong>Opted in</strong>:
          that is the express consent Australian law (the Spam Act) requires, and a purchase alone is
          not consent. The export carries each opted-in attendee&apos;s unsubscribe link, which you
          must include in your emails and honour.
        </p>
      </div>

      {/* Door review (Scope v5 3.12): scans a door admitted offline that the server could not admit at sync */}
      <DoorReviewPanel eventId={id} rows={doorReview} timeZone={event.timezone} />

      <AttendeeTable attendees={attendees} ticketTypes={ticketTypes} />
    </div>
  )
}
