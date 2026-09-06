'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { publishEvent, pauseEvent, cancelEvent, duplicateEvent } from './actions'
import type { Event, EventStatus } from '@/types/database'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import {
  EventLifecycleActions,
  type LifecycleEligibility,
} from '@/components/features/dashboard/event-lifecycle-actions'

type EventRow = Event & {
  ticket_tiers: { sold_count: number; total_capacity: number }[]
  has_reserved_seating?: boolean
}

const STATUS_BADGE: Record<EventStatus, string> = {
  draft: 'bg-ink-100 text-ink-600',
  scheduled: 'bg-gold-100 text-gold-600',
  published: 'bg-green-100 text-green-700',
  paused: 'bg-amber-100 text-amber-700',
  postponed: 'bg-orange-100 text-orange-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-purple-100 text-purple-700',
  archived: 'bg-ink-200 text-ink-700',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric', timeZone: PLATFORM_TIME_ZONE })
}

/**
 * THE ROW'S ACTIONS. Every status has a way out (docs/EVENT-LIFECYCLE.md):
 * the sale controls here (publish, pause, cancel) plus archive, restore and
 * delete from EventLifecycleActions, which is the same component the event
 * overview renders. Before 6 September 2026 a cancelled event kept Edit, View
 * and Duplicate and nothing else, for ever.
 */
function RowActions({
  event,
  eligibility,
  onDone,
}: {
  event: EventRow
  eligibility: LifecycleEligibility | null
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (action: () => Promise<{ error?: string }>) => {
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else onDone()
    })
  }

  const archived = event.status === 'archived'

  return (
    <div className="flex flex-wrap items-center">
      {error && <span className="text-xs text-red-600">{error}</span>}

      <Link
        href={`/dashboard/events/${event.id}/edit`}
        className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs text-[var(--brand-accent-strong)] hover:text-[var(--brand-accent-strong-hover)]"
      >
        Edit
      </Link>

      {/* An archived event's public address answers 404 to everyone but a
          ticket holder, so there is nothing to view until it is restored. */}
      {!archived && (
        <Link
          href={`/events/${event.slug}`}
          target="_blank"
          className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs text-ink-600 hover:text-ink-900"
        >
          View
        </Link>
      )}

      {event.status === 'published' && (
        <Link
          href={`/dashboard/events/${event.id}/launch-kit`}
          className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs font-semibold text-[var(--brand-accent-strong)] hover:text-[var(--brand-accent-strong-hover)]"
        >
          Launch Kit
        </Link>
      )}

      <button
        disabled={isPending}
        onClick={() => run(() => duplicateEvent(event.id))}
        className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs text-ink-600 hover:text-ink-900 disabled:opacity-40"
      >
        Duplicate
      </button>

      {(event.status === 'draft' || event.status === 'scheduled') && (
        <button
          disabled={isPending}
          onClick={() => run(() => publishEvent(event.id))}
          className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs text-green-800 hover:text-green-900 disabled:opacity-40"
        >
          Publish
        </button>
      )}

      {event.status === 'published' && (
        <button
          disabled={isPending}
          onClick={() => run(() => pauseEvent(event.id))}
          className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs text-amber-800 hover:text-amber-900 disabled:opacity-40"
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
          className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs text-red-700 hover:text-red-900 disabled:opacity-40"
        >
          Cancel
        </button>
      )}

      <EventLifecycleActions
        variant="row"
        event={{
          id: event.id,
          title: event.title,
          status: event.status,
          archived_from_status: event.archived_from_status ?? null,
        }}
        eligibility={eligibility}
      />
    </div>
  )
}

export function EventsTable({
  events,
  seatSoldCountMap = {},
  eligibilityById = {},
  emptyTab = 'all',
}: {
  events: EventRow[]
  seatSoldCountMap?: Record<string, number>
  /** Per event: may it be deleted, and if not, why. Absent means not offered. */
  eligibilityById?: Record<string, LifecycleEligibility>
  emptyTab?: string
}) {
  const router = useRouter()

  if (events.length === 0) {
    if (emptyTab === 'archived') {
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white px-6 py-14 text-center">
          <h2 className="font-display text-lg font-semibold text-ink-900">Nothing archived</h2>
          <p className="mt-1 max-w-md text-sm text-ink-600">
            Archiving takes an event off every public page and stops sales without deleting a single
            record. Archived events appear here and can be restored at any time.
          </p>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-ink-100 bg-white px-6 py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-gold-600">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
          </svg>
        </div>
        <h2 className="mt-5 font-display text-lg font-semibold text-ink-900">Host your first event</h2>
        <p className="mt-1 max-w-md text-sm text-ink-600">
          Create an event, set ticket tiers, and publish. Your events appear here once created.
        </p>
        <Link
          href="/dashboard/events/create"
          className="mt-6 inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg"
        >
          Create your first event
        </Link>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-ink-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-100 bg-ink-100 text-left">
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Event</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Date</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Status</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Sold</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {events.map(event => {
            const soldCount = event.has_reserved_seating
              ? (seatSoldCountMap[event.id] ?? 0)
              : event.ticket_tiers.reduce((sum, t) => sum + t.sold_count, 0)
            const totalCapacity = event.ticket_tiers.reduce((sum, t) => sum + t.total_capacity, 0)

            return (
              <tr
                key={event.id}
                className="hover:bg-ink-100 cursor-pointer"
                onClick={() => router.push(`/dashboard/events/${event.id}`)}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-ink-900">{event.title}</p>
                  {event.venue_city && (
                    <p className="text-xs text-ink-400">{event.venue_city}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-600 whitespace-nowrap">
                  {formatDate(event.start_date)}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[event.status]}`}>
                    {event.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-600">
                  {totalCapacity > 0 ? `${soldCount} / ${totalCapacity}` : ':'}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <RowActions
                    event={event}
                    eligibility={eligibilityById[event.id] ?? null}
                    onDone={() => router.refresh()}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
