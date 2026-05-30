import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getOrganiserEvent, fetchEventAttendees } from '@/lib/reporting/attendees'
import { AttendeeTable } from '@/components/dashboard/attendee-table'

export const metadata: Metadata = {
  title: 'Attendees | EventLinqs',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ id: string }> }

export default async function AttendeesPage({ params }: Props) {
  const { id } = await params

  const event = await getOrganiserEvent(id)
  if (!event) notFound()

  const attendees = await fetchEventAttendees(id)
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
        <span className="text-sm text-ink-400">·</span>
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

      {/* Summary tiles */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-600">Attendees</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{attendees.length}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-600">Checked in</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{checkedIn}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-5">
          <p className="text-xs uppercase tracking-wider text-ink-600">Not checked in</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{notCheckedIn}</p>
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
      </div>

      <AttendeeTable attendees={attendees} ticketTypes={ticketTypes} />
    </div>
  )
}
