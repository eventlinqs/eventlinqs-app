'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { publishEvent, pauseEvent, cancelEvent, duplicateEvent, deleteEvent } from './actions'
import type { Event, EventStatus } from '@/types/database'

type EventRow = Event & {
  ticket_tiers: { sold_count: number; total_capacity: number }[]
  has_reserved_seating?: boolean
}

const STATUS_BADGE: Record<EventStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  published: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  postponed: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-purple-100 text-purple-700',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function RowActions({ event, onDone }: { event: EventRow; onDone: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (action: () => Promise<{ error?: string }>) => {
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else onDone()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}

      <Link
        href={`/dashboard/events/${event.id}/edit`}
        className="text-xs text-blue-600 hover:text-blue-800"
      >
        Edit
      </Link>

      <Link
        href={`/events/${event.slug}`}
        target="_blank"
        className="text-xs text-gray-500 hover:text-gray-700"
      >
        View
      </Link>

      <button
        disabled={isPending}
        onClick={() => run(() => duplicateEvent(event.id))}
        className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
      >
        Duplicate
      </button>

      {(event.status === 'draft' || event.status === 'scheduled') && (
        <button
          disabled={isPending}
          onClick={() => run(() => publishEvent(event.id))}
          className="text-xs text-green-600 hover:text-green-800 disabled:opacity-40"
        >
          Publish
        </button>
      )}

      {event.status === 'published' && (
        <button
          disabled={isPending}
          onClick={() => run(() => pauseEvent(event.id))}
          className="text-xs text-amber-600 hover:text-amber-800 disabled:opacity-40"
        >
          Pause
        </button>
      )}

      {(event.status === 'published' || event.status === 'paused' || event.status === 'postponed') && (
        <button
          disabled={isPending}
          onClick={() => {
            if (confirm('Cancel this event? This cannot be undone.')) {
              run(() => cancelEvent(event.id))
            }
          }}
          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-40"
        >
          Cancel
        </button>
      )}

      {event.status === 'draft' && (
        <button
          disabled={isPending}
          onClick={() => {
            if (confirm('Delete this draft? This cannot be undone.')) {
              run(() => deleteEvent(event.id))
            }
          }}
          className="text-xs text-red-600 hover:text-red-800 disabled:opacity-40"
        >
          Delete
        </button>
      )}
    </div>
  )
}

export function EventsTable({ events, seatSoldCountMap = {} }: { events: EventRow[]; seatSoldCountMap?: Record<string, number> }) {
  const router = useRouter()

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 py-20 text-center">
        <p className="text-sm font-medium text-gray-500">No events found</p>
        <Link
          href="/dashboard/events/create"
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Create your first event
        </Link>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left">
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Event</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Sold</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {events.map(event => {
            const soldCount = event.has_reserved_seating
              ? (seatSoldCountMap[event.id] ?? 0)
              : event.ticket_tiers.reduce((sum, t) => sum + t.sold_count, 0)
            const totalCapacity = event.ticket_tiers.reduce((sum, t) => sum + t.total_capacity, 0)

            return (
              <tr
                key={event.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => router.push(`/dashboard/events/${event.id}/edit`)}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{event.title}</p>
                  {event.venue_city && (
                    <p className="text-xs text-gray-400">{event.venue_city}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {formatDate(event.start_date)}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[event.status]}`}>
                    {event.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {totalCapacity > 0 ? `${soldCount} / ${totalCapacity}` : '—'}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <RowActions event={event} onDone={() => router.refresh()} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
