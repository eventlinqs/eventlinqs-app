'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { produceMatchRunAction, type ProduceMatchResult } from './actions'

interface MatchRunFormProps {
  /**
   * The date arrives ALREADY RENDERED, in the event's own zone, because a
   * client component cannot know an event's zone and the stored instant is
   * UTC. See the note beside the call site in page.tsx.
   */
  events: { id: string; title: string; dateLabel: string }[]
  selectedEventId: string
  defaultCap: number
  matcherEnabled: boolean
}

/**
 * Pick the event, set the cap, produce the run.
 *
 * Every outcome is on screen: pending while it runs, the count when it lands,
 * and the refusal in words when the switch is off, the event is not published,
 * or the weights do not sum to one. Changing the event navigates, so the page
 * below always describes the event named in the address bar rather than a
 * different one the form remembers.
 */
export function MatchRunForm({ events, selectedEventId, defaultCap, matcherEnabled }: MatchRunFormProps) {
  const router = useRouter()
  const [eventId, setEventId] = useState(selectedEventId)
  const [state, action, pending] = useActionState<ProduceMatchResult | null, FormData>(
    produceMatchRunAction,
    null,
  )

  return (
    <form action={action} className="mt-5 space-y-4">
      {/*
        THE EVENT THE PAGE IS ABOUT IS WHAT THE BUTTON ACTS ON.

        Driving this at 390 found the defect that makes the hidden field
        necessary. The picker lists the soonest events that are not yet over
        (src/lib/matching/events.ts), an address can name ANY published event,
        and when the two disagree the select rendered "Choose an event" and
        submitted nothing: the button answered "Pick an event first" while the
        page underneath it described that very event by name. So the id travels
        as a hidden field from the address, and the select below is a navigator
        rather than the source of truth.

        THAT SENTENCE USED TO BE FALSE and it is worth keeping the correction
        rather than quietly editing it. The read behind this picker had no bound
        on time, so "soonest" was in fact the forty OLDEST events the platform
        had ever published: on TEST, 101 of 276 were already over and the list
        began in June.
      */}
      <input type="hidden" name="event_id" value={eventId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="event_nav" className="block text-[11px] uppercase tracking-[0.16em] text-white/50">
            Published event
          </label>
          <select
            id="event_nav"
            value={eventId}
            onChange={e => {
              setEventId(e.target.value)
              router.push(e.target.value ? `/admin/matches?event=${e.target.value}` : '/admin/matches')
            }}
            className="mt-2 h-11 w-full rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white focus:border-[var(--brand-accent)] focus:outline-none"
          >
            <option value="">Choose an event</option>
            {events.map(event => (
              <option key={event.id} value={event.id}>
                {event.title} ({event.dateLabel})
              </option>
            ))}
          </select>
        </div>

        <div className="w-40">
          <label htmlFor="cap" className="block text-[11px] uppercase tracking-[0.16em] text-white/50">
            Cap
          </label>
          <input
            id="cap"
            name="cap"
            type="number"
            min={1}
            step={1}
            defaultValue={defaultCap || undefined}
            className="mt-2 h-11 w-full rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white focus:border-[var(--brand-accent)] focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={pending || !matcherEnabled || !eventId}
          className="inline-flex h-11 items-center rounded-lg bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[#0A1628] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Matching' : 'Produce a match'}
        </button>
      </div>

      {!matcherEnabled && (
        <p role="status" className="text-sm text-amber-200">
          The matcher is switched off, so no new run can be produced. The runs already stored are
          still here and still readable.
        </p>
      )}

      {state && (
        <p role="status" className={state.ok ? 'text-sm text-emerald-200' : 'text-sm text-rose-200'}>
          {state.message}
        </p>
      )}
    </form>
  )
}
