'use client'

import { AddToCalendar } from '@/components/features/events/add-to-calendar'
import type { CalendarEvent } from '@/lib/events/calendar-links'
import { SHARE } from '@/lib/walk-in/page-copy'
import { RemindMeForm } from './remind-me-form'
import { countOnEvent, useWalkInShare } from './walk-in-client'

/**
 * The panel's three actions, in locked design A's order: Remind me, then Add to
 * calendar and Share side by side. With Remind me switched off (production until
 * Lawal approves the privacy version) the other two stand alone.
 */
export function WalkInPanelActions({
  eventId,
  eventSlug,
  eventTitle,
  eventUrl,
  calendar,
  remindMeOn,
  heading,
  purpose,
}: {
  eventId: string
  eventSlug: string
  eventTitle: string
  eventUrl: string
  calendar: CalendarEvent
  remindMeOn: boolean
  heading: string
  purpose: string
}) {
  const { share, copied } = useWalkInShare({ eventId, eventSlug, eventTitle, eventUrl })
  return (
    <>
      {remindMeOn && (
        <div className="border-t border-ink-100 pt-5">
          <RemindMeForm eventId={eventId} heading={heading} purpose={purpose} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <AddToCalendar event={calendar} appearance="pill" onChosen={() => countOnEvent(eventId, 'calendar_add')} />
        <button
          type="button"
          onClick={share}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-full border-[1.5px] border-ink-900 bg-white px-4 text-sm font-bold text-ink-900 transition-colors hover:bg-[var(--color-ink-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]"
        >
          {copied ? 'Link copied' : SHARE}
        </button>
      </div>
    </>
  )
}

/**
 * Add to calendar on a phone and a tablet, where the panel is not drawn (below
 * lg). Found driving the AMCF page on production at 390 and 768 on 27 October
 * 2026: the page offered it only on a desktop, so a visitor on a phone could
 * not put the event in their calendar at all.
 */
export function WalkInPhoneCalendar({ eventId, calendar }: { eventId: string; calendar: CalendarEvent }) {
  return <AddToCalendar event={calendar} appearance="pill" onChosen={() => countOnEvent(eventId, 'calendar_add')} />
}
