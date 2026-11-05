import { describe, expect, it } from 'vitest'
import { eventsFromHtml, planCandidates, wallClockToIso, type FoundEvent } from '@/lib/listings/collect'
import { judgeCandidate } from '@/lib/listings/judge'
import { correctionDecision } from '@/lib/listings/headline-hunt'

/*
 * ENGINE P0, THE PERMANENT TIME REGRESSION CASES (the engine directive, Phases 1, 4, 5 and 7; the independent review
 * C:\dev\GROWTH\ENGINE-P0-INDEPENDENT-REVIEW-5NOV.md, its ten missing tests). Every case asserts the exact value stored,
 * never only that something was found.
 */
const ld = (o: Record<string, unknown>) =>
  `<script type="application/ld+json">${JSON.stringify({
    '@type': 'MusicEvent',
    name: 'A Show',
    location: { '@type': 'Place', name: 'A Hall', address: '1 Main Street, Melbourne VIC 3000' },
    offers: { url: 'https://tickets.example.com/a-show', availability: 'InStock' },
    ...o,
  })}</script>`
const read = (o: Record<string, unknown>) => eventsFromHtml(ld(o), 'https://hall.example.com/a-show')
const NOW = new Date('2026-11-01T00:00:00Z')
const judge = (e: FoundEvent) => judgeCandidate({ plan: { kind: 'new', event: e }, sourceVerified: true, known: [] }).reasons

describe('1. a stated offset the venue zone does not have is never trusted', () => {
  it("'2026-11-07T19:30:00+00:00' on a Melbourne night is held as offset_mismatch, never shifted", () => {
    const [e] = read({ startDate: '2026-11-07T19:30:00+00:00' })
    expect(e.timeStatus).toBe('offset_mismatch')
    expect(judge(e)).toContain('offset_mismatch')
  })
  it("an honest '+11:00' in daylight saving time is exact", () => {
    const [e] = read({ startDate: '2026-11-07T19:30:00+11:00' })
    expect(e).toMatchObject({ startsAt: '2026-11-07T08:30:00.000Z', timeStatus: 'exact' })
    expect(judge(e)).toEqual([])
  })
})

describe('2. a startDate with no offset is the venue zone wall clock, whatever the server zone', () => {
  it("'2026-11-07T19:30:00' is 7:30 pm in Melbourne", () => {
    const [e] = read({ startDate: '2026-11-07T19:30:00' })
    expect(e).toMatchObject({ startsAt: '2026-11-07T08:30:00.000Z', timeStatus: 'exact' })
  })
})

describe('3. a date with no time is never given one', () => {
  it("'2026-11-07' is held as no_time, on the right local day", () => {
    const [e] = read({ startDate: '2026-11-07' })
    expect(e.timeStatus).toBe('date_only')
    expect(e.startsAt).toBe(wallClockToIso(2026, 11, 7, 0, 0, 0, 'Australia/Melbourne'))
    expect(judge(e)).toContain('no_time')
  })
})

describe('4. a night per performance', () => {
  it('each subEvent is a night of its own', () => {
    const found = read({
      startDate: '2026-11-12T19:50:00+11:00',
      endDate: '2026-11-14T22:00:00+11:00',
      subEvent: [
        { '@type': 'MusicEvent', startDate: '2026-11-12T19:50:00+11:00' },
        { '@type': 'MusicEvent', startDate: '2026-11-13T19:50:00+11:00' },
      ],
    })
    expect(found.map((e) => e.startsAt).sort()).toEqual(['2026-11-12T08:50:00.000Z', '2026-11-13T08:50:00.000Z'])
  })
  it('one Event spanning days with no performance named is held as multi_day_span', () => {
    const [e] = read({ startDate: '2026-11-12T19:50:00+11:00', endDate: '2026-11-14T22:00:00+11:00' })
    expect(e.timeStatus).toBe('multi_day')
    expect(judge(e)).toContain('multi_day_span')
  })
})

describe('5. postponed and rescheduled are called off for a person', () => {
  it.each(['https://schema.org/EventPostponed', 'https://schema.org/EventRescheduled'])('%s is held', (status) => {
    const [e] = read({ startDate: '2026-11-07T19:30:00+11:00', eventStatus: status })
    expect(e.calledOff).toBe(true)
    expect(judge(e)).toContain('called_off_words')
  })
})

describe('6. two sessions of one show, two hours apart, stay two', () => {
  const session = (startsAt: string): FoundEvent => ({
    title: 'The Christmas Spectacular', startsAt, endsAt: null, venueName: 'Palais Theatre', venueAddress: null,
    pageUrl: 'https://www.palaistheatre.com.au/all-events/the-christmas-spectacular-tickets-ae1616664', imageUrl: null,
    description: null, links: [{ url: 'https://www.ticketmaster.com.au/event/1', availability: 'on_sale', priceFromCents: null }],
  })
  it('both sessions on one page are two plans', () => {
    const plans = planCandidates([session('2026-12-05T03:00:00.000Z'), session('2026-12-05T05:00:00.000Z')], [], NOW)
    expect(plans.map((p) => [p.kind, p.event.startsAt])).toEqual([['new', '2026-12-05T03:00:00.000Z'], ['new', '2026-12-05T05:00:00.000Z']])
  })
  it('the second session is new when only the first is listed', () => {
    const known = [{ eventId: 'e1', venueId: null, venueName: 'Palais Theatre', venueAddress: null, title: 'The Christmas Spectacular', startsAt: '2026-12-05T03:00:00.000Z' }]
    const plans = planCandidates([session('2026-12-05T03:00:00.000Z'), session('2026-12-05T05:00:00.000Z')], known, NOW)
    expect(plans.map((p) => p.kind)).toEqual(['adds_links', 'new'])
  })
})

describe("6a. two sessions on two pages of one source stay two (Geelong Regional Libraries' 'Baby time', 16 November)", () => {
  /* The library states Baby time on Monday 16 November twice: event 17245487 '11:30am - 11:50am' and event 17255956
     '10:30am - 11:00am' (read 5 November 2026). The two hour window merged them and dropped the 10:30. */
  const night = (startsAt: string, id: string): FoundEvent => ({
    title: 'Baby time', startsAt, endsAt: null, venueName: 'Geelong Library and Heritage Centre (The Dome)',
    venueAddress: '51 Little Malop Street, Geelong VIC 3220', pageUrl: `https://events.grlc.vic.gov.au/event/${id}`, imageUrl: null, description: null, links: [],
  })
  const s1030 = night('2026-11-15T23:30:00.000Z', '17255956')
  const s1130 = night('2026-11-16T00:30:00.000Z', '17245487')
  it('both sessions found are two plans', () => {
    expect(planCandidates([s1130, s1030], [], NOW).map((p) => p.event.startsAt).sort()).toEqual(['2026-11-15T23:30:00.000Z', '2026-11-16T00:30:00.000Z'])
  })
  it('with the 11:30 listed, the 11:30 adds its link and the 10:30 is new, never a time change', () => {
    const known = [{ eventId: 'e1130', venueId: null, venueName: s1130.venueName, venueAddress: s1130.venueAddress, title: 'Baby time', startsAt: '2026-11-16T00:30:00.000Z' }]
    const plans = planCandidates([s1130, s1030], known, NOW)
    expect(plans.map((p) => [p.kind, p.event.pageUrl.slice(-8)])).toEqual([['adds_links', '17245487'], ['new', '17255956']])
  })
})

describe('6b. a listed night the source now states at another time is a time change for a person, never a silent confirmation', () => {
  /* Found by the verifier on 5 November 2026: Geelong Regional Libraries' 'Baby time' (Mon 16 Nov) imported at 11:30 from
     event 17245487; the library's page 17255956 states 10:30, an hour apart, inside sameEvent's two hour window, so each
     run 'confirmed' the 11:30 series. LAW 19 section 4: a time that differs from the last verified value is held. */
  it('10:30 found against 11:30 listed is time_changed, and confirms nothing', () => {
    const found: FoundEvent = {
      title: 'Baby time', startsAt: '2026-11-15T23:30:00.000Z', endsAt: null, venueName: 'Geelong Library and Heritage Centre (The Dome)',
      venueAddress: '51 Little Malop Street, Geelong VIC 3220', pageUrl: 'https://events.grlc.vic.gov.au/event/17255956', imageUrl: null, description: null, links: [],
    }
    const known = [{ eventId: 'e1', seriesId: 's1', venueId: null, venueName: 'Geelong Library and Heritage Centre (The Dome)', venueAddress: '51 Little Malop Street, Geelong VIC 3220', title: 'Baby time', startsAt: '2026-11-16T00:30:00.000Z' }]
    const [plan] = planCandidates([found], known, NOW)
    expect(plan).toMatchObject({ kind: 'changes_facts', change: 'time_changed', eventId: 'e1' })
  })
})

describe('7. the correction run: the right night kept, the wrong one moved or held, never a second series', () => {
  it('reads each stored night against what the page states', () => {
    const page = new Set(['2026-11-07T08:30:00.000Z'])
    expect(correctionDecision('2026-11-07T08:30:00.000Z', page, 200)).toEqual({ kind: 'right', to: null })
    expect(correctionDecision('2026-11-07T19:30:00.000Z', page, 200)).toEqual({ kind: 'move', to: '2026-11-07T08:30:00.000Z' })
    expect(correctionDecision('2026-11-07T19:30:00.000Z', new Set(), 200)).toEqual({ kind: 'hold', to: null })
    expect(correctionDecision('2026-11-07T19:30:00.000Z', page, 503)).toEqual({ kind: 'hold', to: null })
  })
})

describe('8. both daylight saving changes in Melbourne', () => {
  it('the first Sunday in October 2026 and the first Sunday in April 2027', () => {
    expect(wallClockToIso(2026, 10, 3, 19, 30, 0, 'Australia/Melbourne')).toBe('2026-10-03T09:30:00.000Z') // AEST, +10
    expect(wallClockToIso(2026, 10, 4, 19, 30, 0, 'Australia/Melbourne')).toBe('2026-10-04T08:30:00.000Z') // AEDT, +11
    expect(wallClockToIso(2027, 4, 3, 19, 30, 0, 'Australia/Melbourne')).toBe('2027-04-03T08:30:00.000Z') // AEDT, +11
    expect(wallClockToIso(2027, 4, 4, 19, 30, 0, 'Australia/Melbourne')).toBe('2027-04-04T09:30:00.000Z') // AEST, +10
  })
  it('a stated offset is judged against the zone on its own date', () => {
    expect(read({ startDate: '2027-04-04T19:30:00+10:00' })[0].timeStatus).toBe('exact')
    expect(read({ startDate: '2027-04-04T19:30:00+11:00' })[0].timeStatus).toBe('offset_mismatch')
  })
})

describe('9. a night whose local date is the day after its UTC date', () => {
  it("'2026-11-08T09:00:00+11:00' is Sunday in Melbourne and Saturday in UTC", () => {
    const [e] = read({ startDate: '2026-11-08T09:00:00+11:00' })
    expect(e.startsAt).toBe('2026-11-07T22:00:00.000Z')
  })
})

describe('10. implausible times for night kinds, unless stated in words', () => {
  it('a concert at 6:30 am read from a schema is held as implausible_time', () => {
    const [e] = read({ name: 'Iron Maiden in concert', startDate: '2026-11-14T06:30:00+11:00' })
    expect(judge(e)).toContain('implausible_time')
  })
  it('the same time stated in the page words is not', () => {
    const [e] = read({ name: 'Iron Maiden in concert', startDate: '2026-11-14T06:30:00+11:00' })
    expect(judge({ ...e, timeFromWords: true })).not.toContain('implausible_time')
  })
  it('a run club at 8 am is not a night kind', () => {
    const [e] = read({ '@type': 'SportsEvent', name: 'Run the Tan: Run Club', startDate: '2026-11-07T08:00:00+11:00' })
    expect(judge(e)).not.toContain('implausible_time')
  })
})
