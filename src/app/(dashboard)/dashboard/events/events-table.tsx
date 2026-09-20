'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { publishEvent, pauseEvent, cancelEvent, duplicateEvent, type ActionResult } from './actions'
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
  scheduled: 'bg-gold-100 text-gold-800',
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
  isPending,
  run,
  onRefusal,
}: {
  event: EventRow
  eligibility: LifecycleEligibility | null
  isPending: boolean
  run: (action: () => Promise<ActionResult>) => void
  onRefusal: (refusal: ActionResult) => void
}) {
  const archived = event.status === 'archived'

  return (
    <div className="flex flex-wrap items-center">
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
        onRefusal={onRefusal}
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

/**
 * THE REFUSAL PANEL. Inherited from the event form rather than invented here.
 *
 * src/components/features/events/event-form.tsx has carried this exact shape
 * since 28 August 2026, and its own comment says why each half exists:
 * `role="alert"` so a refusal is ANNOUNCED and not only rendered, and the
 * gate's own `nextAction` rendered as a link, because "the caller used to throw
 * it away, so 'Connect Stripe' was advice with no door".
 *
 * The events LIST never inherited either half. It rendered
 * `<span className="text-xs text-red-600">{error}</span>` inside the ACTIONS
 * column and dropped `nextAction` on the floor. Measured on 21 September 2026
 * against the served build, at 390: the sentence got 69px of a 356px list, 19
 * per cent, and stood 256px tall; the event's own title sat at x -58, off the
 * left edge of the phone. The organiser was handed a wall of red that did not
 * say which event it was about and offered nothing to press.
 */
function PublishRefusal({ refusal }: { refusal: ActionResult }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      {refusal.error}
      {refusal.nextAction && (
        <Link
          href={refusal.nextAction.href}
          className="ml-2 font-semibold underline underline-offset-2"
        >
          {refusal.nextAction.label}
        </Link>
      )}
    </div>
  )
}

/**
 * ONE EVENT, AS A TABLE ROW ON A DESKTOP AND AS A CARD ON A PHONE, FROM ONE DOM.
 *
 * ==========================================================================
 * WHY THE STATE MOVED UP HERE
 * ==========================================================================
 *
 * The refusal used to live inside `RowActions`, which renders inside a `<td>`,
 * so a 172-character sentence was laid out in the ACTIONS column. There is no
 * arrangement of that cell that makes a sentence readable; the panel has to
 * span the row. A `<td colSpan>` can only do that from a row of its own, and a
 * row of its own can only be rendered by whoever owns the state. So the
 * transition and the refusal live here, and `RowActions` became presentational.
 *
 * ==========================================================================
 * AND WHY IT IS ONE DOM RATHER THAN A TABLE PLUS A CARD LIST
 * ==========================================================================
 *
 * The obvious shape is `hidden lg:block` over a table and `lg:hidden` over a
 * list of cards. It mounts every row TWICE, which means two `useTransition`s
 * and two refusals per event, and a refusal shown on the copy nobody is looking
 * at is the same defect this is fixing. The stacked-card presentation is a
 * LAYOUT change and CSS is where a layout change belongs: below `md` the table
 * parts become blocks, the header is hidden, and the row becomes a bordered
 * card. One row, one state, one truth.
 *
 * The three meta cells stay on one line as `inline-block` rather than becoming
 * three stacked rows, and Sold carries a label there because "0 / 10" without
 * its column heading is a number with no noun.
 *
 * ==========================================================================
 * THE BREAKPOINT IS `lg` AND NOT `md`, AND THAT WAS A MEASUREMENT
 * ==========================================================================
 *
 * `md` was the first answer and the driven screenshot refused it. This list
 * lives behind a 240px fixed sidebar, so a 768px tablet leaves 478px of
 * content: the same width as a large phone. The table rendered there with the
 * title wrapped over FOUR lines, "0 / 10" broken across two, and the six
 * actions stacked VERTICALLY down the ACTIONS column at 44px each, so one row
 * stood about 300px tall. It fitted, and it was unreadable.
 *
 * The drive now measures that directly rather than trusting a breakpoint: the
 * actions may occupy at most two lines, counted as distinct `top` values among
 * their boxes. Six controls on six lines is a column, not a row.
 */
function EventRowView({
  event,
  soldCount,
  totalCapacity,
  eligibility,
  onNavigate,
  onDone,
}: {
  event: EventRow
  soldCount: number | undefined
  totalCapacity: number
  eligibility: LifecycleEligibility | null
  onNavigate: () => void
  onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [refusal, setRefusal] = useState<ActionResult | null>(null)

  const run = (action: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await action()
      if (result.error) setRefusal(result)
      else {
        setRefusal(null)
        onDone()
      }
    })
  }

  // The card's border is drawn by the event row, and a refusal joins the bottom
  // of it rather than floating away as a second card.
  // `mt-3` on the ROW rather than `space-y-3` on the body: a refusal is a
  // second <tr> and `space-y` would put 12px between it and the card it
  // belongs to, breaking the border it shares.
  const cardBase =
    'max-lg:block max-lg:border max-lg:border-ink-200 max-lg:bg-white max-lg:px-4 max-lg:py-3'
  const cardShape = refusal?.error
    ? 'max-lg:rounded-t-2xl max-lg:border-b-0'
    : 'max-lg:rounded-2xl'

  return (
    <>
      <tr
        className={`hover:bg-ink-100 cursor-pointer max-lg:mt-3 ${cardBase} ${cardShape}`}
        onClick={onNavigate}
      >
        <td className="px-4 py-3 max-lg:block max-lg:px-0 max-lg:py-0">
          <p className="font-medium text-ink-900">{event.title}</p>
          {event.venue_city && <p className="text-xs text-ink-400">{event.venue_city}</p>}
        </td>
        <td className="px-4 py-3 text-ink-600 whitespace-nowrap max-lg:inline-block max-lg:px-0 max-lg:pb-0 max-lg:pr-4 max-lg:pt-2">
          {formatDate(event.start_date)}
        </td>
        <td className="px-4 py-3 max-lg:inline-block max-lg:px-0 max-lg:pb-0 max-lg:pr-4 max-lg:pt-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[event.status]}`}>
            {event.status}
          </span>
        </td>
        <td className="px-4 py-3 text-ink-600 max-lg:inline-block max-lg:px-0 max-lg:pb-0 max-lg:pt-2">
          {totalCapacity > 0
            ? soldCount === undefined
              ? <span className="text-ink-400">Unknown</span>
              : (
                <>
                  {soldCount} / {totalCapacity}
                  <span className="ml-1 text-xs text-ink-400 lg:hidden">sold</span>
                </>
              )
            : '-'}
        </td>
        <td
          className="px-4 py-3 max-lg:mt-3 max-lg:block max-lg:border-t max-lg:border-ink-100 max-lg:px-0 max-lg:pb-0"
          onClick={e => e.stopPropagation()}
        >
          <RowActions event={event} eligibility={eligibility} isPending={isPending} run={run} onRefusal={setRefusal} />
        </td>
      </tr>

      {refusal?.error && (
        <tr className={`${cardBase} max-lg:rounded-b-2xl max-lg:border-t-0 max-lg:pt-0`}>
          <td colSpan={5} className="px-4 pb-3 max-lg:block max-lg:px-0">
            <PublishRefusal refusal={refusal} />
          </td>
        </tr>
      )}
    </>
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
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 text-gold-800">
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
    /*
     * THE CONTAINER IS A CARD ON A DESKTOP AND NOTHING AT ALL ON A PHONE.
     *
     * `overflow-x-auto` is kept for md and up, where a wide table with many
     * columns can legitimately scroll. Below md there is nothing to scroll,
     * because the table is not a table there, and leaving the scroller in place
     * would keep the defect this rebuild exists to remove: a list 447px wide
     * inside a 356px box, with the event's own title off the left edge of the
     * phone (measured, 21 September 2026).
     *
     * The border and the white surface move to the individual cards below md,
     * so the cards read as cards rather than as rows inside a frame.
     */
    <div className="rounded-2xl border border-ink-200 bg-white max-lg:rounded-none max-lg:border-0 max-lg:bg-transparent lg:overflow-x-auto">
      <table className="w-full text-sm max-lg:block">
        <thead className="max-lg:hidden">
          <tr className="border-b border-ink-100 bg-ink-100 text-left">
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Event</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Date</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Status</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Sold</th>
            <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100 max-lg:block max-lg:divide-y-0">
          {events.map(event => {
            /*
             * A RESERVED-SEATING EVENT WITH NO ENTRY IN THE MAP HAS NOT SOLD
             * NOTHING. IT HAS NOT BEEN COUNTED.
             *
             * This was `?? 0`, which collapsed the two. The count comes from
             * one RPC over every reserved-seating event at once, so when that
             * call fails the map is empty and every such row would have read
             * "0 / 2000" to an organiser whose show is sold out. Absent is now
             * carried through as undefined and rendered as Unknown.
             */
            const soldCount = event.has_reserved_seating
              ? seatSoldCountMap[event.id]
              : event.ticket_tiers.reduce((sum, t) => sum + t.sold_count, 0)
            const totalCapacity = event.ticket_tiers.reduce((sum, t) => sum + t.total_capacity, 0)

            return (
              <EventRowView
                key={event.id}
                event={event}
                soldCount={soldCount}
                totalCapacity={totalCapacity}
                eligibility={eligibilityById[event.id] ?? null}
                onNavigate={() => router.push(`/dashboard/events/${event.id}`)}
                onDone={() => router.refresh()}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
