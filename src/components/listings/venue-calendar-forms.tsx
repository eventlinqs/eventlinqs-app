'use client'

import { createContext, useActionState, useContext, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { giveVenueCalendarAction, stopVenueCalendarAction, type VenueCalendarState } from '@/app/actions/venue-calendar'
import { VENUE_CALENDAR_YES_WORDS } from '@/lib/venues/venue-calendar'

/**
 * A claimed venue gives EventLinqs its own calendar, or stops it (D3 (3)), each answer in its own words. Classes are
 * the venue media forms' own (venue-media-forms.tsx), so nothing here is new to the design system.
 *
 * The answer is held by VenueCalendarAnswers, around the whole section, not by the form: on success the action
 * refreshes the page, which lists the live calendar in place of the give form (or drops a stopped one with its stop
 * form), so an answer held in the form unmounted with it and was never seen or announced (WCAG 2.2, 4.1.3). The
 * section's status line is always in the page, so a change to it is read out. A refusal stays beside its own form.
 */

const input = 'mt-1 h-11 w-full rounded-lg border border-ink-200 px-3 text-sm text-ink-900'
const button = 'inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-60'
const quiet = 'inline-flex h-11 items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100 disabled:opacity-60'

const DONE = {
  give: 'Thank you. We read your calendar every day from now; new nights at your venue appear on EventLinqs, and anything else waits for our team.',
  stop: 'Stopped. We no longer read this calendar; the nights already listed stay listed.',
} as const

type Kind = keyof typeof DONE
type Answered = { kind: Kind; answer: NonNullable<VenueCalendarState> } | null

async function answerVenueCalendar(_: Answered, formData: FormData): Promise<Answered> {
  const kind: Kind = formData.has('sourceId') ? 'stop' : 'give'
  const answer = kind === 'stop' ? await stopVenueCalendarAction(null, formData) : await giveVenueCalendarAction(null, formData)
  return answer ? { kind, answer } : null
}

const Answers = createContext<{ answered: Answered; action: (formData: FormData) => void } | null>(null)

export function VenueCalendarAnswers({ children }: { children: ReactNode }) {
  const [answered, action] = useActionState<Answered, FormData>(answerVenueCalendar, null)
  const done = answered?.answer.state === 'done' ? DONE[answered.kind] : ''
  return (
    <Answers.Provider value={{ answered, action }}>
      {/* Never display none: an empty line has no height, and a live region that is always present is read out. */}
      <p role="status" className={done ? 'mt-2 text-sm text-ink-600' : 'text-sm text-ink-600'}>
        {done}
      </p>
      {children}
    </Answers.Provider>
  )
}

function useAnswers() {
  const held = useContext(Answers)
  if (!held) throw new Error('A venue calendar form is drawn inside VenueCalendarAnswers, which holds its answer.')
  return held
}

function Refusal({ kind }: { kind: Kind }) {
  const { answered } = useAnswers()
  if (answered?.kind !== kind || answered.answer.state !== 'refused') return null
  return <p className="mt-2 text-sm text-ink-600">{answered.answer.reason}</p>
}

function Submit({ className, idle, busy }: { className: string; idle: string; busy: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? busy : idle}
    </button>
  )
}

export function GiveVenueCalendarForm({ venues, categories }: { venues: { id: string; name: string }[]; categories: { id: string; name: string }[] }) {
  const { action } = useAnswers()
  return (
    <form action={action} className="text-left">
      {venues.length === 1 ? (
        <input type="hidden" name="venueId" value={venues[0].id} />
      ) : (
        <label className="block text-sm font-medium text-ink-900">
          Venue
          <select name="venueId" required className={input} defaultValue="">
            <option value="" disabled>
              Choose your venue
            </option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="mt-3 block text-sm font-medium text-ink-900">
        Your calendar&apos;s iCal address
        <input name="feedUrl" type="url" required inputMode="url" placeholder="https://" className={input} />
      </label>
      <label className="mt-3 block text-sm font-medium text-ink-900">
        The kind of nights it holds
        <select name="categoryId" required className={input} defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-4 space-y-2">
        <label className="flex min-h-[44px] items-start gap-2 text-sm text-ink-600">
          <input type="checkbox" name="yes" required className="mt-1 h-5 w-5" />
          <span>&ldquo;{VENUE_CALENDAR_YES_WORDS}&rdquo;</span>
        </label>
        <label className="flex min-h-[44px] items-start gap-2 text-sm text-ink-600">
          <input type="checkbox" name="authority" required className="mt-1 h-5 w-5" />
          <span>I can give this permission for the venue, and this is the venue&apos;s own calendar.</span>
        </label>
      </div>
      <Submit className={`${button} mt-3`} idle="Give us your calendar" busy="Saving" />
      <Refusal kind="give" />
    </form>
  )
}

export function StopVenueCalendarForm({ sourceId }: { sourceId: string }) {
  const { action } = useAnswers()
  return (
    <form action={action}>
      <input type="hidden" name="sourceId" value={sourceId} />
      <Submit className={quiet} idle="Stop reading this calendar" busy="Stopping" />
      <Refusal kind="stop" />
    </form>
  )
}
