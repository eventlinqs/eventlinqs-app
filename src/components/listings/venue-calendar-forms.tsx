'use client'

import { giveVenueCalendarAction, stopVenueCalendarAction } from '@/app/actions/venue-calendar'
import { VENUE_CALENDAR_YES_WORDS } from '@/lib/venues/venue-calendar'
import { createSectionAnswers, SubmitButton } from '@/components/ui/section-answers'

/**
 * A claimed venue gives EventLinqs its own calendar, or stops it (D3 (3)), each answer in its own words. Classes are
 * the venue media forms' own (venue-media-forms.tsx), so nothing here is new to the design system. The answer is held
 * by VenueCalendarAnswers around the section (src/components/ui/section-answers.tsx says why): giving a calendar moves
 * the venue out of the give form, and stopping one drops it from the list with its stop form.
 */

const input = 'mt-1 h-11 w-full rounded-lg border border-ink-200 px-3 text-sm text-ink-900'
const button = 'inline-flex h-11 items-center rounded-lg bg-gold-400 px-5 text-sm font-semibold text-ink-900 transition-colors hover:bg-gold-500 disabled:opacity-60'
const quiet = 'inline-flex h-11 items-center rounded-lg border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-ink-100 disabled:opacity-60'

const { Answers, useAnswerFor } = createSectionAnswers({
  give: {
    act: giveVenueCalendarAction,
    done: 'Thank you. We read your calendar every day from now; new nights at your venue appear on EventLinqs, and anything else waits for our team.',
  },
  stop: { act: stopVenueCalendarAction, done: 'Stopped. We no longer read this calendar; the nights already listed stay listed.' },
})

export const VenueCalendarAnswers = Answers

export function GiveVenueCalendarForm({ venues, categories }: { venues: { id: string; name: string }[]; categories: { id: string; name: string }[] }) {
  const { action, field, line } = useAnswerFor('give')
  return (
    <form action={action} className="text-left">
      {field}
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
      <SubmitButton className={`${button} mt-3`} busy="Saving">
        Give us your calendar
      </SubmitButton>
      {line}
    </form>
  )
}

export function StopVenueCalendarForm({ sourceId }: { sourceId: string }) {
  const { action, field, line } = useAnswerFor('stop', sourceId)
  return (
    <form action={action}>
      {field}
      <input type="hidden" name="sourceId" value={sourceId} />
      <SubmitButton className={quiet} busy="Stopping">
        Stop reading this calendar
      </SubmitButton>
      {line}
    </form>
  )
}
