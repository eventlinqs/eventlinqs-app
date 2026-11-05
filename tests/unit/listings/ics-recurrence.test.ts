import { describe, expect, it } from 'vitest'
import { eventsFromIcs, icsZone } from '@/lib/listings/collect'

/*
 * THE INDEPENDENT REVIEW'S MISSING TEST (9) AND ITS RISKS 10 AND 11 (C:\dev\GROWTH\ENGINE-P0-INDEPENDENT-REVIEW-5NOV.md; the
 * CONTROLLER's 16:05 of 5 November 2026: the ten missing tests join the permanent regression suite):
 *   risk 10: a Windows TZID made Intl throw inside wallClockToIso, which answered null, and the event was dropped in
 *            silence. Windows names map to IANA zones by CLDR's windowsZones.xml, territory 001
 *            (https://github.com/unicode-org/cldr/blob/main/common/supplemental/windowsZones.xml, read 6 November 2026);
 *            a TZID nothing resolves is read in the feed's zone and HELD (offset_mismatch), never dropped.
 *   risk 11: an RRULE was read at its first date only, EXDATE ignored, a RECURRENCE-ID override taken as an extra event.
 *            RFC 5545 (https://www.rfc-editor.org/rfc/rfc5545, read 6 November 2026): 'The "DTSTART" property defines the
 *            first instance in the recurrence set'; the set excludes 'any start DATE-TIME values specified by "EXDATE"';
 *            RECURRENCE-ID 'is used in conjunction with the "UID" and "SEQUENCE" properties to identify a specific
 *            instance'; UNTIL 'bounds the recurrence rule in an inclusive manner'; '+1MO ... represents the first Monday
 *            within the month'.
 */
const FEED = 'https://library.example.vic.gov.au/events.ics'
const NOW = new Date('2026-11-01T00:00:00Z')
const ics = (...events: string[]) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//bp proof//EN', ...events, 'END:VCALENDAR'].join('\r\n')
const vevent = (...lines: string[]) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')
const read = (...events: string[]) => eventsFromIcs(ics(...events), FEED, NOW)
const starts = (found: ReturnType<typeof read>) => found.map((e) => e.startsAt)
const AT = 'LOCATION:Bendigo Library\\, 251 Hargreaves St\\, Bendigo VIC 3550'

describe('a TZID is read as the zone it names (risk 10)', () => {
  it('maps the Windows names Outlook writes, by CLDR', () => {
    expect(icsZone('AUS Eastern Standard Time')).toBe('Australia/Sydney')
    expect(icsZone('E. Australia Standard Time')).toBe('Australia/Brisbane')
    expect(icsZone('Cen. Australia Standard Time')).toBe('Australia/Adelaide')
    expect(icsZone('W. Australia Standard Time')).toBe('Australia/Perth')
    expect(icsZone('Tasmania Standard Time')).toBe('Australia/Hobart')
    expect(icsZone('Australia/Melbourne')).toBe('Australia/Melbourne')
    expect(icsZone('/mozilla.org/20050126_1/Australia/Melbourne')).toBe('Australia/Melbourne')
    expect(icsZone(undefined)).toBe('Australia/Melbourne')
    expect(icsZone('Mars Standard Time')).toBeNull()
  })
  it("reads 'AUS Eastern Standard Time' 7:30 pm as 7:30 pm in Victoria, never dropped", () => {
    const found = read(vevent('UID:w', 'SUMMARY:Bp Quiz', 'DTSTART;TZID=AUS Eastern Standard Time:20261107T193000', AT))
    expect(starts(found)).toEqual(['2026-11-07T08:30:00.000Z'])
    expect(found[0].timeStatus ?? 'exact').toBe('exact')
  })
  it('holds a TZID nothing resolves, read in the feed zone, instead of dropping it', () => {
    const found = read(vevent('UID:x', 'SUMMARY:Bp Quiz', 'DTSTART;TZID=Mars Standard Time:20261107T193000', AT))
    expect(starts(found)).toEqual(['2026-11-07T08:30:00.000Z'])
    expect(found[0].timeStatus).toBe('offset_mismatch')
  })
})

describe('a repeating event is every instance within the horizon (risk 11)', () => {
  it('a weekly session with COUNT is each of its dates, DTSTART counted first', () => {
    const found = read(vevent('UID:r', 'SUMMARY:Bp Baby Rhyme Time', 'DTSTART;TZID=Australia/Melbourne:20261103T103000', 'DTEND;TZID=Australia/Melbourne:20261103T110000', 'RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=TU', AT))
    expect(starts(found)).toEqual(['2026-11-02T23:30:00.000Z', '2026-11-09T23:30:00.000Z', '2026-11-16T23:30:00.000Z', '2026-11-23T23:30:00.000Z'])
    expect(found.map((e) => e.endsAt)).toEqual(['2026-11-03T00:00:00.000Z', '2026-11-10T00:00:00.000Z', '2026-11-17T00:00:00.000Z', '2026-11-24T00:00:00.000Z'])
  })
  it('leaves out an EXDATE', () => {
    const found = read(vevent('UID:r', 'SUMMARY:Bp Baby Rhyme Time', 'DTSTART;TZID=Australia/Melbourne:20261103T103000', 'RRULE:FREQ=WEEKLY;COUNT=4', 'EXDATE;TZID=Australia/Melbourne:20261110T103000', AT))
    expect(starts(found)).toEqual(['2026-11-02T23:30:00.000Z', '2026-11-16T23:30:00.000Z', '2026-11-23T23:30:00.000Z'])
  })
  it('a RECURRENCE-ID override replaces its instance, never adds one; a cancelled override removes it', () => {
    const found = read(
      vevent('UID:r', 'SUMMARY:Bp Baby Rhyme Time', 'DTSTART;TZID=Australia/Melbourne:20261103T103000', 'RRULE:FREQ=WEEKLY;COUNT=4', AT),
      vevent('UID:r', 'RECURRENCE-ID;TZID=Australia/Melbourne:20261117T103000', 'SUMMARY:Bp Baby Rhyme Time', 'DTSTART;TZID=Australia/Melbourne:20261117T113000', AT),
      vevent('UID:r', 'RECURRENCE-ID;TZID=Australia/Melbourne:20261124T103000', 'SUMMARY:Bp Baby Rhyme Time', 'STATUS:CANCELLED', 'DTSTART;TZID=Australia/Melbourne:20261124T103000', AT),
    )
    expect(starts(found).sort()).toEqual(['2026-11-02T23:30:00.000Z', '2026-11-09T23:30:00.000Z', '2026-11-17T00:30:00.000Z'])
  })
  it('a monthly market on the first Saturday (BYDAY=1SA)', () => {
    const found = read(vevent('UID:m', 'SUMMARY:Bp Farmers Market', 'DTSTART;TZID=Australia/Melbourne:20261107T090000', 'RRULE:FREQ=MONTHLY;BYDAY=1SA;COUNT=3', AT))
    expect(starts(found)).toEqual(['2026-11-06T22:00:00.000Z', '2026-12-04T22:00:00.000Z', '2027-01-01T22:00:00.000Z'])
  })
  it('keeps the wall clock across the change to standard time (Sunday 4 April 2027)', () => {
    const found = eventsFromIcs(ics(vevent('UID:d', 'SUMMARY:Bp Trivia', 'DTSTART;TZID=Australia/Melbourne:20270327T190000', 'RRULE:FREQ=WEEKLY;COUNT=2', AT)), FEED, new Date('2027-03-20T00:00:00Z'))
    expect(starts(found)).toEqual(['2027-03-27T08:00:00.000Z', '2027-04-03T08:00:00.000Z'])
    const after = eventsFromIcs(ics(vevent('UID:d', 'SUMMARY:Bp Trivia', 'DTSTART;TZID=Australia/Melbourne:20270403T190000', 'RRULE:FREQ=WEEKLY;COUNT=2', AT)), FEED, new Date('2027-03-20T00:00:00Z'))
    expect(starts(after)).toEqual(['2027-04-03T08:00:00.000Z', '2027-04-10T09:00:00.000Z'])
  })
  it('UNTIL is inclusive', () => {
    const found = read(vevent('UID:u', 'SUMMARY:Bp Holiday Program', 'DTSTART;TZID=Australia/Melbourne:20261103T103000', 'RRULE:FREQ=DAILY;UNTIL=20261105T103000', AT))
    expect(starts(found)).toHaveLength(3)
  })
  it('a rule with no end stops at the collection horizon', () => {
    const found = read(vevent('UID:h', 'SUMMARY:Bp Toddler Time', 'DTSTART;TZID=Australia/Melbourne:20261104T103000', 'RRULE:FREQ=WEEKLY', AT))
    expect(found.length).toBeGreaterThan(4)
    expect(found.length).toBeLessThan(200)
    expect(found.every((e) => Date.parse(e.startsAt) >= NOW.getTime())).toBe(true)
  })
  it('a rule it does not read (YEARLY) stays its first date, as before', () => {
    const found = read(vevent('UID:y', 'SUMMARY:Bp Show', 'DTSTART;TZID=Australia/Melbourne:20261107T193000', 'RRULE:FREQ=YEARLY;COUNT=3', AT))
    expect(starts(found)).toEqual(['2026-11-07T08:30:00.000Z'])
  })
})
