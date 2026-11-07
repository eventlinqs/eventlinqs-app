import { describe, expect, it } from 'vitest'
import { statedByGates, statedInDatedList } from '@/lib/listings/stated-words'

/*
 * THE CONTROLLER's 17:05 BAR: 'the source does not say' is never written while a person reading the page can tell. Two
 * pages the sweep called 'the page states the date and no start time the readers can find' (6 November 18:26), read
 * through the polite reader on 7 November (C:\dev\EVIDENCE\ENGINE-P0\readers-62\), each stating the start a person reads:
 *   redhotsummertour.com.au/event/ballarat-vic/780/overview: '07 NOVEMBER 2026', '12:30pm ═ GATES', then each act's set to
 *   '8:15pm - 9:30pm ═ AUSTRALIAN CRAWL' (ours: Saturday 7 November, 12:30 to 21:30);
 *   sovereignhill.com.au/events/pecha-kucha-series-2/: 'Friday 13 November: 12 COLLABORATION', 'Friday 13 March: 09
 *   ESSENCE', ..., and once '6:00pm-8:00pm AEDT' (ours: Friday 13 November, 18:00 to 20:00).
 */
const ZONE = 'Australia/Melbourne'
const RHST = `<main><p>07 NOVEMBER 2026</p><p>BBQ Dinner served at 5:30pm</p><p>12:30pm \u2550 GATES</p>
<p>1:10pm - 1:40pm \u2550 ELLA HOOPER</p><p>2:05pm - 2:45pm \u2550 ESKIMO JOE</p><p>8:15pm - 9:30pm \u2550 AUSTRALIAN CRAWL</p></main>`
const PK = `<main><h1>Pecha Kucha Series</h1><p>Friday 13 November: 12 COLLABORATION</p><p>Friday 13 March: 09 ESSENCE</p>
<p>Friday 8 May: 10 OBSESSION</p><p>Friday 14 August: 11 COLLISION</p><p>Book tickets</p><p>6:00pm-8:00pm AEDT</p><p>$10.00</p>
<p>Regular Hours: Tuesday-Sunday, 10am to 5pm</p></main>`

describe('a festival day starts at its gates', () => {
  it('reads the gates time on the page that states the night\'s date', () => {
    // Saturday 7 November 2026, 12:30 pm in Melbourne
    expect(statedByGates(RHST, '2026-11-07T01:30:00Z', ZONE)).toBe(true)
  })
  it("a page's one doors time is its opening too (Fine Lines & Wine: 'Doors open from 6:00pm with drawing starting from 6:30pm')", () => {
    const tipsy = `<main><h1>Fine Lines &amp; Wine, 18th November @ Archive Wine Bar</h1><p>A$35.00</p>${'<p>Bring a friend.</p>'.repeat(40)}
<p>Doors open from 6:00pm with drawing starting from 6:30pm.</p></main>`
    // Wednesday 18 November 2026, 6 pm in Melbourne
    expect(statedByGates(tipsy, '2026-11-18T07:00:00Z', ZONE)).toBe(true)
    expect(statedByGates(tipsy, '2026-11-18T07:30:00Z', ZONE)).toBe(false)
  })
  it('two doors times (an early and a late show) name no opening', () => {
    const two = '<main><p>Thursday 19 November 2026</p><p>Early Doors Open: 6:00 pm</p><p>Late Doors Open: 9:20 pm</p></main>'
    expect(statedByGates(two, '2026-11-19T07:00:00Z', ZONE)).toBe(false)
  })
  it('a set time is never the start, and another date is never vouched for', () => {
    expect(statedByGates(RHST, '2026-11-07T02:10:00Z', ZONE)).toBe(false)
    expect(statedByGates(RHST, '2026-11-08T01:30:00Z', ZONE)).toBe(false)
  })
})

describe('a night listed by date beside its title, with the page\'s one session time', () => {
  it('reads Pecha Kucha 12 on Friday 13 November at 6 pm', () => {
    expect(statedInDatedList(PK, 'Pecha Kucha Series: 12 Collaboration', '2026-11-13T07:00:00Z', ZONE)).toBe(true)
  })
  it('never vouches a date the list does not give that title, nor another time', () => {
    expect(statedInDatedList(PK, 'Pecha Kucha Series: 12 Collaboration', '2026-11-20T07:00:00Z', ZONE)).toBe(false)
    expect(statedInDatedList(PK, 'Pecha Kucha Series: 12 Collaboration', '2026-11-13T08:00:00Z', ZONE)).toBe(false)
  })
  it('a page that states two session times names no start (the opening hours are not a session)', () => {
    const two = PK.replace('<p>6:00pm-8:00pm AEDT</p>', '<p>6:00pm-8:00pm AEDT</p><p>7:30pm-9:00pm AEDT</p>')
    expect(statedInDatedList(two, 'Pecha Kucha Series: 12 Collaboration', '2026-11-13T07:00:00Z', ZONE)).toBe(false)
  })
})
