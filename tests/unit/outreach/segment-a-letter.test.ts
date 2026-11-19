import { describe, expect, it } from 'vitest'
import { renderTemplate, ruleFailures } from '@/lib/outreach/rules'
import { readVoicePolicy, voiceProblems } from '@/lib/outreach/voice-gate'
import { touchVoiceMessage } from '@/lib/outreach/touch-voice'
import {
  OPENERS_PROVED,
  addressFitsName,
  greetingOf,
  SEGMENT_A_DAY10,
  SEGMENT_A_DAY4,
  SEGMENT_A_FIRST,
  SEGMENT_A_LETTERS,
  isSegmentANight,
  melbourneDayOf,
  segmentAFields,
  type SegmentAFacts,
} from '@/lib/outreach/segment-a-letter'

/*
 * SEGMENT A, THE ENGINE'S LETTER (the PM's 02:00 of 18 November 2026, item 2; C:/dev/EVIDENCE/EL-18NOV/outreach/
 * SEGMENT-A-LETTER-PM-0200.md under EL-COMMS-STANDARD-LOCKED-17NOV.md). The words are the PM's, with the departures the
 * production read of 18 November required, each a case here: SENT is never stated (not proved to count people); one
 * event and one person take the singular; no booking page means no booking words; a market is an event, not a show;
 * an all capitals title is written in title case; 'a new Australian platform', by Lawal's positioning ruling of
 * 7 September 2026 (scripts/guards/positioning-lock.mjs).
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const UNSUB = 'https://www.eventlinqs.com.au/unsubscribe/outreach?t=00000000-0000-0000-0000-000000000000'
const PHOTO = 'https://www.eventlinqs.com.au/photos/00000000-0000-0000-0000-000000000000/00000000000000000000000000000000'
const IAN: SegmentAFacts = {
  organiserName: "Her Majesty's Theatre Ballarat",
  personName: null,
  night: {
    title: 'Ian Moss and Troy Cassar-Daley: Together Alone Tour',
    slug: 'ian-moss-and-troy-cassar-daley-together-alone-tour-her-majesty-s-theatre-ballarat-2026-11-28',
    startDate: '2026-11-28T08:30:00Z',
    timezone: 'Australia/Melbourne',
    categorySlug: 'music',
    summary: 'Ian Moss and Troy Cassar-Daley play their songs together, live in concert.',
    venueName: "Her Majesty's Theatre Ballarat",
    hasPhoto: true,
    hasBooking: true,
  },
  listedNow: 13,
  listedWithBooking: 13,
  openers: 6,
  photoLink: PHOTO,
  origin: ORIGIN,
}
const CONSENT = { basis: 'conspicuous_publication', publishedOnUrl: 'https://hermaj.com/contact', noMarketingStatementChecked: true }

function judged(letter: typeof SEGMENT_A_FIRST, facts: SegmentAFacts, landsOn = '2026-11-19', extra: Record<string, string> = {}) {
  const rendered = renderTemplate(letter, { ...segmentAFields(facts), ...extra }, UNSUB)
  const voice = voiceProblems(
    {
      ...touchVoiceMessage({ channel: 'email', purpose: 'cadence', step: letter.step, address: 'hermaj@hermaj.com', subject: rendered.subject, body: rendered.body, personName: facts.personName, organiserName: facts.organiserName, firstTouchId: letter.step === 1 ? null : 'first-touch' }),
      consent: CONSENT,
      eventDate: melbourneDayOf(facts.night.startDate),
      landsOn,
    },
    readVoicePolicy(),
  )
  return { rendered, voice }
}

describe('the first letter', () => {
  it("is the PM's text for Her Majesty's Theatre, word for word, and every CRM rule and the gateway pass", () => {
    const { rendered, voice } = judged(SEGMENT_A_FIRST, IAN)
    expect(rendered.subject).toBe('Helping more people find Ian Moss and Troy Cassar-Daley: Together Alone Tour on 28 November')
    expect(rendered.content).toBe(
      [
        "Hi Her Majesty's Theatre Ballarat team,",
        "I hope you're well.",
        'Your events are already listed on EventLinqs at no cost to you, each with a button straight to your own booking page.',
        "We'd love to help more people discover Ian Moss and Troy Cassar-Daley: Together Alone Tour on Saturday 28 November: https://www.eventlinqs.com.au/events/ian-moss-and-troy-cassar-daley-together-alone-tour-her-majesty-s-theatre-ballarat-2026-11-28",
        "Send us one image of your next show you're happy for us to use, and we'll add it for you. Your tickets stay exactly where they are.",
        `Could you reply with one image, or add it here? ${PHOTO}`,
      ].join('\n\n'),
    )
    expect(rendered.heldBecause).toEqual([])
    expect(ruleFailures(rendered)).toEqual([])
    // Version 2, today-v2 (Lawal's APPROVE PERM of 18 November 2026): every CRM rule and the gateway pass.
    expect(voice, rendered.body).toEqual([])
  })
  it('never states people sent on to a booking page, and never calls EventLinqs a ticketing platform', () => {
    const { rendered } = judged(SEGMENT_A_FIRST, IAN)
    expect(rendered.body).not.toMatch(/gone on to your booking page|sent to your booking page/)
    expect(rendered.body).not.toMatch(/ticketing platform/i)
  })
  it('one listed event takes the singular', () => {
    expect(segmentAFields({ ...IAN, listedNow: 1, listedWithBooking: 1 })['listed line']).toBe('Your event is already listed on EventLinqs at no cost to you, with a button straight to your own booking page.')
  })
  // The PM's 02:38 of 18 November 2026, items 2 and 3: a count goes in a letter only once it is proved to count people,
  // and below 5 never; the page view record cannot tell our own real browser visits from the public, so it is not proved.
  it('no count of people is stated while the openers are not proved to be people', () => {
    expect(OPENERS_PROVED).toBe(false)
    expect(segmentAFields({ ...IAN, openers: 76 })['listed line']).not.toMatch(/people|person/)
    expect(segmentAFields({ ...IAN, nightOpeners: 23 })['night line']).not.toMatch(/people|person/)
  })
  it('no booking page on any listed event: no booking words anywhere', () => {
    const free = { ...IAN, listedWithBooking: 0, night: { ...IAN.night, hasBooking: false, categorySlug: 'food-drink', title: 'Bendigo Community Farmers Market' } }
    const f = segmentAFields(free)
    expect(f['listed line']).toBe('Your events are already listed on EventLinqs at no cost to you.')
    expect(f['image line']).toBe("Send us one image of your next event you're happy for us to use, and we'll add it for you.")
    const { rendered, voice } = judged(SEGMENT_A_FIRST, free)
    expect(rendered.body).not.toMatch(/booking page|tickets stay/)
    // Version 2, today-v2 (Lawal's APPROVE PERM of 18 November 2026): every CRM rule and the gateway pass.
    expect(voice, rendered.body).toEqual([])
  })
  it("some listed events without a booking page: 'each' is left out", () => {
    expect(segmentAFields({ ...IAN, listedWithBooking: 12 })['listed line']).toMatch(/^Your events are already listed on EventLinqs at no cost to you, with a button straight to your own booking page\./)
  })
  // The PM's 04:38 of 18 November 2026: the word comes from the one kind reader the posts use (campaign.ts nightKind),
  // never the raw category: 'An Evening with Alastair Campbell' is listed as music but is a talk, and Cosi by the Geelong
  // Repertory Theatre Company is listed as arts-community but is a play.
  it("'show' for a gig, jazz, classical, comedy, theatre or dance night by the kind reader; anything else, or no kind, an event", () => {
    const campbell = { ...IAN.night, title: 'An Evening with Alastair Campbell', categorySlug: 'music', summary: 'Alastair Campbell in conversation with Louise Adler.', venueName: 'Melbourne Recital Centre' }
    expect(segmentAFields({ ...IAN, night: campbell })['image line']).toMatch(/your next event/)
    const cosi = { ...IAN.night, title: 'Cosi: Geelong Repertory Theatre Company', categorySlug: 'arts-community', summary: 'Louis Nowra’s comedy, staged by the Geelong Repertory Theatre Company.', venueName: 'The Woodbin Theatre' }
    expect(segmentAFields({ ...IAN, night: cosi })['image line']).toMatch(/your next show/)
    expect(segmentAFields({ ...IAN, night: { ...IAN.night, title: 'Storytime', categorySlug: 'family', summary: 'Stories and songs for little ones.', startDate: '2026-11-23T23:30:00Z' } })['image line']).toMatch(/your next event/)
    expect(segmentAFields({ ...IAN, night: { ...IAN.night, title: 'Front Bar Trivia', categorySlug: 'nightlife', summary: null } })['image line']).toMatch(/your next event/)
  })
  it("a billing set in capitals reads as their night, never as a name (class 13): 'your Professional Comedians night on Tuesday 24 November'", () => {
    const f = segmentAFields({ ...IAN, night: { ...IAN.night, title: 'PROFESSIONAL COMEDIANS', categorySlug: 'comedy', startDate: '2026-11-24T09:00:00Z' } })
    expect(f.event).toBe('your Professional Comedians night')
    expect(f['event day']).toBe('Tuesday 24 November')
  })
})

describe("the greeting names the organisation that owns the address (the PM's 03:10, classes 10 to 12)", () => {
  it("a leading 'The', a bracketed part and an 'at <venue>' tail are left out of a greeting", () => {
    expect(greetingOf('The Wheeler Centre', null)).toBe('Wheeler Centre team')
    expect(greetingOf('Friends of Ballarat Botanical Gardens (Guiding Friends)', null)).toBe('Friends of Ballarat Botanical Gardens team')
    expect(greetingOf('Melbourne Comedy Club at Miranda Tequila Bar', null)).toBe('Melbourne Comedy Club team')
    expect(greetingOf("Her Majesty's Theatre Ballarat", 'Sam Lee')).toBe('Sam')
  })
  it('an organisation the address does not belong to is refused, so the letter is held', () => {
    expect(addressFitsName('manager@bcfm.org.au', 'Bendigo Foodshare')).toBe(false)
    expect(addressFitsName('info@fbbg.org.au', 'Friends of Ballarat Botanical Gardens (Guiding Friends)')).toBe(true)
    expect(addressFitsName('boxoffice@geelongartscentre.org.au', 'Geelong Arts Centre')).toBe(true)
    expect(addressFitsName('hermaj@hermaj.com', "Her Majesty's Theatre Ballarat")).toBe(true)
    expect(addressFitsName('bendigo@ncgrl.vic.gov.au', 'Bendigo Library')).toBe(true)
    expect(addressFitsName('ticketing@wheelercentre.com', 'The Wheeler Centre')).toBe(true)
  })
  it('a listing with no photo says so, and why one helps', () => {
    expect(segmentAFields({ ...IAN, night: { ...IAN.night, hasPhoto: false } })['image line']).toBe(
      "Right now its listing has no photo. A real photo of the show gives people browsing the guide a reason to stop and click through to your tickets. Send me one image you're happy for us to use and I'll add it for you. Your tickets stay exactly where they are.",
    )
  })
  it('a fact we do not hold leaves the field unfilled, so the draft is held', () => {
    const { rendered } = judged(SEGMENT_A_FIRST, { ...IAN, photoLink: null })
    expect(rendered.heldBecause.join(' ')).toMatch(/\[photo link\]/)
  })
})

describe('the timing rule (the standard, Part 2 rule 4)', () => {
  it('a night is named only when it starts 3 or more Melbourne days after the day the letter lands', () => {
    expect(isSegmentANight('2026-11-22T03:00:00Z', '2026-11-19')).toBe(true)
    expect(isSegmentANight('2026-11-21T12:00:00Z', '2026-11-19')).toBe(false)
    expect(isSegmentANight('2026-11-19T08:00:00Z', '2026-11-19')).toBe(false)
  })
  it('the gateway refuses a letter that would land too close to its night', () => {
    expect(judged(SEGMENT_A_FIRST, IAN, '2026-11-26').voice.some((v) => v.startsWith('timing'))).toBe(true)
  })
})

describe('the day 4 and day 10 letters (standard-v1 msg-2 and msg-3, with their next night)', () => {
  const thread = { 'thread subject': 'Helping more people find Ian Moss and Troy Cassar-Daley: Together Alone Tour on 28 November' }
  it('day 4 names the night and its page (no count while the openers are not proved to be people), and one action; the CRM rules and the gateway pass', () => {
    const { rendered, voice } = judged(SEGMENT_A_DAY4, { ...IAN, nightOpeners: 4 }, '2026-11-23', thread)
    expect(rendered.subject).toBe('Re: Helping more people find Ian Moss and Troy Cassar-Daley: Together Alone Tour on 28 November')
    expect(rendered.content).toContain('Ian Moss and Troy Cassar-Daley: Together Alone Tour on Saturday 28 November is listed on EventLinqs: https://www.eventlinqs.com.au/events/')
    expect(rendered.content).toContain(`Reply with one image, or add it here: ${PHOTO}`)
    expect(ruleFailures(rendered)).toEqual([])
    expect(voice).toEqual([])
    expect(segmentAFields({ ...IAN, nightOpeners: 0 })['night line']).toMatch(/is listed on EventLinqs: https/)
  })
  it('day 10 brings the listing again, and keeps its tickets words only where there is a booking page', () => {
    const { rendered, voice } = judged(SEGMENT_A_DAY10, IAN, '2026-11-24', thread)
    expect(rendered.content).toContain("I'd still love to help more people find it while it's coming up: send me one image you're happy for us to use and I'll add it to the listing for you, with your tickets staying exactly where they are.")
    expect(ruleFailures(rendered)).toEqual([])
    expect(voice).toEqual([])
    expect(segmentAFields({ ...IAN, night: { ...IAN.night, hasBooking: false } })['still line']).not.toMatch(/tickets/)
  })
  it('the three letters are stored as versioned templates, steps 1 to 3', () => {
    expect(SEGMENT_A_LETTERS.map((l) => [l.key, l.step])).toEqual([
      ['segment_a_first', 1],
      ['segment_a_day4', 2],
      ['segment_a_day10', 3],
    ])
  })
})
