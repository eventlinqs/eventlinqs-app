import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { eventPageState } from '@/lib/events/event-state'
import { TicketsEnded } from '@/components/features/events/tickets-not-on-sale'

/**
 * AN EVENT IS OVER WHEN ITS END HAS PASSED, WHATEVER ITS STATUS SAYS
 * (23 October 2026, the project manager's 01:15 order).
 *
 * The shape below is the production event that exposed it: published, ticketed,
 * Saturday 10 October from noon to 2:30pm in Melbourne, and still offering
 * "Get tickets" on 23 October because the page judged "past" by status alone.
 */
const SHOWCASE = {
  status: 'published',
  start_date: '2026-10-10T01:00:00Z',
  end_date: '2026-10-10T03:30:00Z',
  timezone: 'Australia/Melbourne',
}
const at = (iso: string) => new Date(iso)

describe('eventPageState', () => {
  it('the showcase, twelve days after it ended, is past', () => {
    expect(eventPageState(SHOWCASE, at('2026-10-22T13:57:00Z'))).toBe('past')
  })

  it('the showcase the day before is on, and so is it while it runs', () => {
    expect(eventPageState(SHOWCASE, at('2026-10-09T01:00:00Z'))).toBeNull()
    expect(eventPageState(SHOWCASE, at('2026-10-10T02:00:00Z'))).toBeNull()
  })

  it('its last minute is still on; the minute after is past', () => {
    expect(eventPageState(SHOWCASE, at('2026-10-10T03:30:00Z'))).toBeNull()
    expect(eventPageState(SHOWCASE, at('2026-10-10T03:31:00Z'))).toBe('past')
  })

  it('status completed is past, as it always was', () => {
    expect(eventPageState({ ...SHOWCASE, status: 'completed' }, at('2026-10-09T00:00:00Z'))).toBe('past')
  })

  it('cancelled, postponed and archived keep their own state after the date', () => {
    const later = at('2026-10-22T00:00:00Z')
    expect(eventPageState({ ...SHOWCASE, status: 'cancelled' }, later)).toBe('cancelled')
    expect(eventPageState({ ...SHOWCASE, status: 'postponed' }, later)).toBe('postponed')
    expect(eventPageState({ ...SHOWCASE, status: 'archived' }, later)).toBe('archived')
  })

  it('an event with no end is over at the end of its start day in its own zone, as /events judges it', () => {
    const noEnd = { ...SHOWCASE, end_date: null }
    // The end of 10 October in Melbourne is 13:00 UTC (UTC+11 since 4 October).
    expect(eventPageState(noEnd, at('2026-10-10T12:59:00Z'))).toBeNull()
    expect(eventPageState(noEnd, at('2026-10-10T13:01:00Z'))).toBe('past')
  })
})

describe('the ticket panel of an event that is over', () => {
  it("says so in the banner's own words and offers nothing to choose or buy", () => {
    const html = renderToStaticMarkup(createElement(TicketsEnded))
    expect(html).toContain('This event has ended.')
    expect(html).toContain('Tickets are no longer on sale.')
    expect(html).not.toMatch(/<(button|select|input|a)\b/)
    expect(html).not.toContain('Get tickets')
  })
})
