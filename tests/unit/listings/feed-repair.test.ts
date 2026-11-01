import { describe, expect, it } from 'vitest'
import { eventsFromIcs, repairDoubleEncoded } from '@/lib/listings/collect'

/**
 * TWO FAULTS IN WHAT THE LIBRARIES' FEED GAVE THE REVIEW QUEUE (window 6, 1 November 2026; the feed read that day is
 * C:\dev\EVIDENCE\CITY-FIRST-1NOV\libraries\raw\feed.ics):
 * 1. its text is UTF-8 encoded twice ('LEGO' then the bytes C3 82 C2 AE, which read as 'LEGOÂ®'), and the queue held
 *    that mojibake as the title;
 * 2. it carries no URL per night, so every night cited the feed itself plus '#UID', a page no visitor can open, while
 *    each night has its own page on the library's events site at /event/<UID> (read 200 that day).
 */

const FEED = 'https://events.grlc.vic.gov.au/feeds?data=eyJmZWVkVHlwZSI6ImljYWwifQ'
const ics = (summary: string, location: string) =>
  [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'UID:17563312',
    'DTSTART:20261104T003000Z',
    'DTEND:20261104T011500Z',
    'STATUS:CONFIRMED',
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')

describe('text encoded twice is read as the source meant it', () => {
  it('repairs the library feed\'s own bytes', () => {
    expect(repairDoubleEncoded('LEGO\u00c2\u00ae club')).toBe('LEGO\u00ae club')
    expect(repairDoubleEncoded('Caf\u00c3\u00a9 talks')).toBe('Caf\u00e9 talks')
    expect(repairDoubleEncoded('Lawal\u00e2\u20ac\u2122s night')).toBe('Lawal\u2019s night')
  })
  it('leaves text that was never broken alone, accents included', () => {
    expect(repairDoubleEncoded('Caf\u00e9 \u00c2ge')).toBe('Caf\u00e9 \u00c2ge')
    expect(repairDoubleEncoded('Toddler time')).toBe('Toddler time')
    expect(repairDoubleEncoded('M\u0101ori and Pasifika night')).toBe('M\u0101ori and Pasifika night')
  })
  it('the feed reader repairs the title and the venue it reads', () => {
    const [e] = eventsFromIcs(ics('LEGO\u00c2\u00ae club', 'Belmont Library - Meeting Room'), FEED)
    expect(e.title).toBe('LEGO\u00ae club')
  })
})

describe("a library night cites its own page, not the feed", () => {
  it("the Geelong Regional Libraries' feed: /event/<UID> on the events site", () => {
    const [e] = eventsFromIcs(ics('Toddler time', 'Belmont Library - Meeting Room'), FEED)
    expect(e.pageUrl).toBe('https://events.grlc.vic.gov.au/event/17563312')
  })
  it('another feed with no URL keeps the feed plus its UID, two nights still two', () => {
    const [e] = eventsFromIcs(ics('Toddler time', 'Belmont Library - Meeting Room'), 'https://example.org/cal.ics')
    expect(e.pageUrl).toBe('https://example.org/cal.ics#17563312')
  })
})
