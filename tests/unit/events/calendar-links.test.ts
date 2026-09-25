import { describe, expect, it } from 'vitest'
import {
  buildIcs,
  buildGoogleCalendarUrl,
  icsFileName,
  toIcsUtc,
  type CalendarEvent,
} from '@/lib/events/calendar-links'

/**
 * ADD TO CALENDAR (close-out SEO5 step 2), the two named acceptance tests plus
 * the three defects the move out of the order confirmation found.
 *
 * The two the item names are `ics_carries_correct_timezone_and_times` and
 * `google_calendar_link_carries_correct_times`.
 *
 * "THE CORRECT TIMEZONE" IS CHECKED THE WAY A BUYER WOULD EXPERIENCE IT. The
 * ICS carries UTC instants (RFC 5545 section 3.3.5's UTC form), so asserting
 * the literal string alone would only prove the formatter round-trips itself.
 * Instead the emitted instants are converted BACK through the event's own IANA
 * zone with Intl, and the assertion is that they land on the wall-clock time the
 * organiser typed. That is what "carries the correct timezone" has to mean for
 * an event at 7pm in Melbourne read on a phone in Perth.
 */

/** The wall clock an event's own zone shows for an instant. */
function localWallClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso))
}

/** Turn `20261010T080000Z` back into an ISO instant. */
function fromIcsUtc(value: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value)
  if (!m) throw new Error(`not an ICS UTC value: ${value}`)
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.000Z`
}

function line(ics: string, property: string): string {
  const found = ics.split('\r\n').find(l => l.startsWith(`${property}:`))
  if (!found) throw new Error(`no ${property} in the ICS`)
  return found.slice(property.length + 1)
}

/**
 * A REAL AUSTRALIAN SUMMER EVENING, chosen because it is the case a naive
 * formatter gets wrong. 10 October 2026 is inside Melbourne's daylight saving,
 * so the offset is +11, not the +10 a reader assumes from "Australia/Melbourne".
 */
const MELBOURNE_EVENT: CalendarEvent = {
  id: 'e4f2c0a1-lane-c',
  title: 'Lane C proof night',
  startDate: '2026-10-10T08:00:00.000Z', // 7:00 pm AEDT
  endDate: '2026-10-10T12:30:00.000Z', // 11:30 pm AEDT
  timezone: 'Australia/Melbourne',
  location: 'The Corner Hotel, Melbourne',
  url: 'https://eventlinqs.com.au/events/lane-c-proof-night',
}

describe('ics_carries_correct_timezone_and_times', () => {
  it('emits DTSTART and DTEND that land on the organiser local wall clock', () => {
    const ics = buildIcs(MELBOURNE_EVENT, new Date('2026-09-14T00:00:00.000Z'))

    expect(localWallClock(fromIcsUtc(line(ics, 'DTSTART')), 'Australia/Melbourne')).toBe(
      '10/10/2026, 19:00',
    )
    expect(localWallClock(fromIcsUtc(line(ics, 'DTEND')), 'Australia/Melbourne')).toBe(
      '10/10/2026, 23:30',
    )
  })

  it('reads as the same instant in another Australian zone, which is the point of UTC', () => {
    const ics = buildIcs(MELBOURNE_EVENT)
    // 7pm AEDT is 4pm AWST. A calendar client in Perth must show 16:00, and it
    // will, because the file carries an instant rather than a local time with
    // no VTIMEZONE to resolve it.
    expect(localWallClock(fromIcsUtc(line(ics, 'DTSTART')), 'Australia/Perth')).toBe(
      '10/10/2026, 16:00',
    )
  })

  it('carries the UID and DTSTAMP RFC 5545 requires, which the shipped builder did not', () => {
    const ics = buildIcs(MELBOURNE_EVENT, new Date('2026-09-14T01:02:03.000Z'))
    // A VEVENT with no UID is the one a client cannot recognise as the same
    // event twice, so a re-import after a date change adds a second entry.
    expect(line(ics, 'UID')).toBe('e4f2c0a1-lane-c@eventlinqs.com.au')
    expect(line(ics, 'DTSTAMP')).toBe('20260914T010203Z')
  })

  it('escapes the characters that would truncate a title or an address', () => {
    const ics = buildIcs({
      ...MELBOURNE_EVENT,
      title: 'Drinks, dancing; and a DJ',
      location: 'Level 2, 100 Smith St\nFitzroy',
    })
    expect(line(ics, 'SUMMARY')).toBe('Drinks\\, dancing\\; and a DJ')
    expect(line(ics, 'LOCATION')).toBe('Level 2\\, 100 Smith St\\nFitzroy')
  })

  it('names the local time in the description, so the organiser framing survives', () => {
    const ics = buildIcs(MELBOURNE_EVENT)
    expect(line(ics, 'DESCRIPTION')).toContain('Starts ')
    expect(line(ics, 'DESCRIPTION')).toContain(MELBOURNE_EVENT.url)
  })

  it('delimits every content line with CRLF, per RFC 5545 section 3.1', () => {
    const ics = buildIcs(MELBOURNE_EVENT)
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.includes('\n\n')).toBe(false)
  })

  it('refuses a value that is not a date rather than inventing one', () => {
    // The shipped formatter was `iso.replace(...) + 'Z'`, which handed
    // `2026-10-10T12:00:00+11:00` produced `20261010T120000+1100Z`: not a date,
    // and nothing anywhere would have noticed.
    expect(() => toIcsUtc('not a date at all')).toThrow(/not a date/)
    expect(toIcsUtc('2026-10-10T12:00:00+11:00')).toBe('20261010T010000Z')
  })

  it('gives an end two hours out when the record somehow has none', () => {
    const ics = buildIcs({ ...MELBOURNE_EVENT, endDate: null })
    expect(line(ics, 'DTEND')).toBe('20261010T100000Z')
  })
})

describe('google_calendar_link_carries_correct_times', () => {
  it('sends the start and end as one UTC pair', () => {
    const url = new URL(buildGoogleCalendarUrl(MELBOURNE_EVENT))
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
    expect(url.searchParams.get('dates')).toBe('20261010T080000Z/20261010T123000Z')
  })

  it('the pair converts back to the organiser wall clock', () => {
    const dates = new URL(buildGoogleCalendarUrl(MELBOURNE_EVENT)).searchParams.get('dates') ?? ''
    const [start, end] = dates.split('/')
    expect(localWallClock(fromIcsUtc(start), 'Australia/Melbourne')).toBe('10/10/2026, 19:00')
    expect(localWallClock(fromIcsUtc(end), 'Australia/Melbourne')).toBe('10/10/2026, 23:30')
  })

  it('sends no timezone parameter, because a UTC instant needs none', () => {
    const url = new URL(buildGoogleCalendarUrl(MELBOURNE_EVENT))
    expect(url.searchParams.get('ctz')).toBeNull()
  })

  it('carries the title, the location and the event URL', () => {
    const url = new URL(buildGoogleCalendarUrl(MELBOURNE_EVENT))
    expect(url.searchParams.get('text')).toBe('Lane C proof night')
    expect(url.searchParams.get('location')).toBe('The Corner Hotel, Melbourne')
    expect(url.searchParams.get('details')).toContain(MELBOURNE_EVENT.url)
  })

  it('omits the location rather than sending an empty one', () => {
    const url = new URL(buildGoogleCalendarUrl({ ...MELBOURNE_EVENT, location: null }))
    expect(url.searchParams.has('location')).toBe(false)
  })
})

describe('the downloaded file has a name a person recognises', () => {
  it('slugs the title and keeps the extension', () => {
    expect(icsFileName('Lane C proof night')).toBe('lane-c-proof-night.ics')
  })

  it('never produces a bare extension for a title of only punctuation', () => {
    expect(icsFileName('!!!')).toBe('event.ics')
  })
})
