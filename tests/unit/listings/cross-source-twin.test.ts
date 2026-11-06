import { describe, expect, it } from 'vitest'
import { crossSourceTwin, judgeCandidate } from '@/lib/listings/judge'
import type { FoundEvent, KnownEvent } from '@/lib/listings/collect'

/*
 * ONE EVENT FROM TWO SOURCES WAITS FOR A PERSON (class N of C:\dev\GROWTH\ENGINE-ACCURACY-7NOV.md; the CONTROLLER's 03:31 (e)
 * of 7 November 2026). The City of Greater Geelong's feed listed 'Boost Mobile AUSX Open Geelong' on Saturday 7 November at
 * 1:00 pm at the venue 'AUSX Open' (the event's own name); Kardinia Park's own page then gave 'AUSX Open Geelong' at GMHBA
 * Stadium at 6:00 pm, and the hunt's rule published it beside the first: Saturday listed twice, with two starts. The judge
 * asked about alike titles only at the SAME venue, and the hunt's duplicate check only of the SAME folded title, so a sponsor's
 * name and a second venue name walked past both. A new night is now held (similar_listing) when ANOTHER source already lists
 * the same title on the same day in the same city, at any venue; one source's own sessions at its branches (a library's
 * 'Toddler Time' at Belmont and at Corio) are left as before.
 */
// The council's rows came from a hand import (import-2026-10-27-wi3-ticketed-43.csv), its listing check naming the page on
// www.geelongcity.vic.gov.au; Kardinia Park's from the hunt's read of www.kardiniapark.vic.gov.au (production, 7 November).
const council: KnownEvent = {
  eventId: 'ausx-council', venueId: null, venueName: 'AUSX Open', venueAddress: null,
  title: 'Boost Mobile AUSX Open Geelong', startsAt: '2026-11-07T02:00:00.000Z', endsAt: null,
  citySlug: 'geelong', seriesId: 'series-council', sourceHosts: ['geelongcity.vic.gov.au'],
}
const kardinia = (over: Partial<FoundEvent> = {}): FoundEvent => ({
  title: 'AUSX Open Geelong', startsAt: '2026-11-07T07:00:00.000Z', endsAt: null, venueName: 'GMHBA Stadium',
  venueAddress: '354 Moorabool St, South Geelong VIC 3220', pageUrl: 'https://www.kardiniapark.vic.gov.au/event/ausx-open-geelong/',
  imageUrl: null, description: null, links: [{ url: 'https://ausxsupercross.com.au/events/ausx-open/', availability: 'on_sale', priceFromCents: null }],
  ...over,
})
const judge = (e: FoundEvent, known: KnownEvent[], sourceHost = 'kardiniapark.vic.gov.au') =>
  judgeCandidate({ plan: { kind: 'new', event: e }, sourceVerified: true, known, sourceHost, citySlug: 'geelong' })

describe('one event from two sources', () => {
  it("the AUSX pair: Kardinia Park's night waits for a person beside the council's listing that day", () => {
    expect(crossSourceTwin(kardinia(), [council], 'kardiniapark.vic.gov.au', 'geelong')).toBe('ausx-council')
    expect(judge(kardinia(), [council]).reasons).toContain('similar_listing')
  })

  it('the same title from another source at another venue that day is held too', () => {
    expect(judge(kardinia({ title: 'Boost Mobile AUSX Open Geelong' }), [council]).reasons).toContain('similar_listing')
  })

  it("one source's own sessions at its branches the same day are left as before", () => {
    const belmont: KnownEvent = { ...council, eventId: 'belmont', title: 'Toddler Time', venueName: 'Belmont Library', sourceHosts: ['grl.example.org'] }
    const corio = kardinia({ title: 'Toddler Time', venueName: 'Corio Library', venueAddress: 'Cox Road, Norlane VIC 3214' })
    expect(crossSourceTwin(corio, [belmont], 'grl.example.org', 'geelong')).toBeNull()
    expect(judge(corio, [belmont], 'grl.example.org')).toEqual({ confidence: 'high', reasons: [] })
  })

  it('another day, another city, or another event is not a twin', () => {
    expect(crossSourceTwin(kardinia({ startsAt: '2026-11-14T07:00:00.000Z' }), [council], 'kardiniapark.vic.gov.au', 'geelong')).toBeNull()
    expect(crossSourceTwin(kardinia(), [{ ...council, citySlug: 'ballarat' }], 'kardiniapark.vic.gov.au', 'geelong')).toBeNull()
    expect(crossSourceTwin(kardinia({ title: 'Geelong Cats Members Day' }), [council], 'kardiniapark.vic.gov.au', 'geelong')).toBeNull()
  })

  /*
   * The rule put through production's 881 upcoming nights (read only, 7 November 05:15) called two pairs one event: the AUSX
   * pair, and this one, two venues' own New Year's Eve dinners sharing only 'New Year's Eve' (3 of 5 words, over the judge's
   * 0.5 share). Across sites the titles must be the same, or the shorter one, at least three words, wholly inside the longer.
   */
  it("two venues' own nights sharing a generic phrase are not one event", () => {
    const sailors: KnownEvent = { ...council, eventId: 'sailors', title: "Sailors' Rest New Year's Eve", venueName: "Sailors' Rest", startsAt: '2026-12-31T07:00:00.000Z', sourceHosts: ['sailorsrestgeelong.com.au'] }
    const novotel = kardinia({ title: "New Year's Eve Buffet Dinner", venueName: 'Novotel Geelong', startsAt: '2026-12-31T07:00:00.000Z' })
    expect(crossSourceTwin(novotel, [sailors], 'novotelgeelong.com.au', 'geelong')).toBeNull()
  })

  it('a two word title is a twin only when it is the same title', () => {
    const tao: KnownEvent = { ...council, eventId: 'tao', title: 'Drum Tao', venueName: 'Costa Hall' }
    expect(crossSourceTwin(kardinia({ title: 'Drum Tao', startsAt: '2026-11-07T08:30:00.000Z' }), [tao], 'kardiniapark.vic.gov.au', 'geelong')).toBe('tao')
    expect(crossSourceTwin(kardinia({ title: 'Live Music', startsAt: '2026-11-07T08:30:00.000Z' }), [{ ...tao, title: 'Saturday Live Music at Hop Temple' }], 'kardiniapark.vic.gov.au', 'geelong')).toBeNull()
  })

  it('a known night whose source is not on record is left as before, never guessed', () => {
    expect(crossSourceTwin(kardinia(), [{ ...council, sourceHosts: [] }], 'kardiniapark.vic.gov.au', 'geelong')).toBeNull()
    expect(crossSourceTwin(kardinia(), [{ ...council, sourceHosts: undefined }], 'kardiniapark.vic.gov.au', 'geelong')).toBeNull()
  })

  it('a judge given no source is the judge it was', () => {
    expect(judgeCandidate({ plan: { kind: 'new', event: kardinia() }, sourceVerified: true, known: [council] })).toEqual({ confidence: 'high', reasons: [] })
  })
})
