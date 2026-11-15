import { describe, expect, test } from 'vitest'
import { readBookingFacts } from '../../../src/lib/listings/booking-facts'
import { judgeSelfListing, sessionOf, wordsStateDate, type PageReading, type SelfListingSubmission } from '../../../src/lib/listings/self-listing'
import { publicHost } from '../../../src/lib/listings/booking-page'
import { cleanTitle, summaryFrom } from '../../../src/lib/listings/self-listing-run'
import { judgeSubmission, type SubmissionContext, type SubmissionInput } from '../../../src/lib/listings/submission'

/**
 * ORGANISER SELF-LISTING (Lawal's rulings of 8 November 2026, 07:01 (3) and 07:05 (2)): a submission publishes itself
 * once the organiser's own booking page bears it out; a wrong fact the page states rightly is corrected from the page;
 * only one that cannot be verified is held, with its reason in plain words.
 *
 * The fixtures are cut from the three real submissions' own booking pages, read politely on 8 November 2026
 * (C:\dev\EVIDENCE\EL-8NOV\submissions): TryBooking 1660299 (Kyivska Perepichka), Humanitix's Canberra Bush Fringe
 * Festival (Mr Snotbottom's two sessions), and GroovyTown's A Moment of Sanity, whose page has no structured data.
 */

const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`

const TRYBOOKING = `<html><head><title>Kyivska tickets | TryBooking</title>
<meta property="og:title" content="Ukrainian Theatre: Irma Vitovska-Vants in Kyivska Perepichka">
${ld({
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: 'Ukrainian Theatre: Irma Vitovska-Vants in Kyivska Perepichka',
  startDate: '2026-12-05T18:30:00.000+11:00',
  endDate: '2026-12-05T21:00:00.000+11:00',
  eventStatus: 'https://schema.org/EventScheduled',
  location: {
    '@type': 'Place',
    name: 'The Wheeler Centre',
    address: { '@type': 'PostalAddress', streetAddress: '176 Little Lonsdale St, ', addressLocality: 'Melbourne', addressRegion: 'VIC', postalCode: '3000' },
  },
  offers: { '@type': 'AggregateOffer', priceCurrency: 'AUD', lowPrice: 80, highPrice: 120 },
  organizer: { '@type': 'Organization', name: 'Ukrainian Multicultural Society of Australia Inc.' },
})}
${ld({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] })}
</head><body><h1>Ukrainian Theatre: Irma Vitovska-Vants in Kyivska Perepichka</h1><p>Saturday 5 December 2026 6:30 pm - 9:00 pm</p></body></html>`

const HUMANITIX_FESTIVAL = `<html><head><title>Canberra Bush Fringe Festival</title>
${ld({
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: 'Canberra Bush Fringe Festival',
  startDate: '2026-11-27T16:00:00+1100',
  endDate: '2026-11-29T21:30:00+1100',
  location: {
    '@type': 'Place',
    name: 'Harmonie German Club',
    address: { '@type': 'PostalAddress', streetAddress: '49 Jerrabomberra Ave, Narrabundah ACT 2604, Australia', addressLocality: 'Narrabundah', postalCode: '2604', addressRegion: 'ACT' },
  },
  eventStatus: 'https://schema.org/EventScheduled',
  offers: [
    { '@type': 'AggregateOffer', offerCount: 12, priceCurrency: 'AUD' },
    { '@type': 'Offer', name: 'The Night Before 13+ Friday 5pm', price: 25, priceCurrency: 'AUD' },
    { '@type': 'Offer', name: 'Mr Snotbottom - all ages Saturday 11.30am', price: 26, priceCurrency: 'AUD' },
    { '@type': 'Offer', name: 'Chopin\u2019s Last Tour 13+ Saturday 2.30pm', price: 25, priceCurrency: 'AUD' },
    { '@type': 'Offer', name: 'Mr Snotbottom - all ages Sunday 10.30am', price: 26, priceCurrency: 'AUD' },
    { '@type': 'Offer', name: 'Tutti Fruitti Cabaret and Circus 18+ Sunday 8pm', price: 30, priceCurrency: 'AUD' },
  ],
})}
</head><body><h1>Canberra Bush Fringe Festival</h1><p>Fri, 27 Nov, 4pm - Sun, 29 Nov, 9:30pm AEDT</p></body></html>`

const GROOVYTOWN = `<html><head><title>A Moment of Sanity</title><style>.x{color:red}</style><script>var tickets = 1</script></head>
<body><h1>A Moment of Sanity</h1><p>A gentle evening to pause, reset and reconnect.</p>
<p>DATE: Tuesday 24 November</p><p>TIME: 7pm - 9pm</p><p>LOCATION: Thornbury Apothecary, 800 High St, Thornbury VIC 3071</p>
<p>INVESTMENT: $65 per person</p></body></html>`

const read = (html: string): PageReading => ({ ok: true, facts: readBookingFacts(html) })
const NOW = new Date('2026-11-08T00:00:00Z')

const KYIV: SelfListingSubmission = {
  title: 'Kyivska Perepichka',
  startsAt: '2026-12-05T08:00:00.000Z', // 7:00pm in Melbourne: the page says 6:30pm
  endsAt: null,
  venueName: 'The Wheeler Centre',
  venueAddress: '176 Little Lonsdale Street, Melbourne',
  timezone: 'Australia/Melbourne',
  entry: 'paid',
  priceFromCents: 8000,
  description: 'A mono-performance by Irma Vitovska-Vants.',
  bookingUrl: 'https://www.trybooking.com/au/event/1660299',
}

const SNOTBOTTOM: SelfListingSubmission = {
  title: 'Mr Snotbottom',
  startsAt: '2026-11-28T00:30:00.000Z', // Saturday 28 November, 11:30am in Canberra
  endsAt: null,
  venueName: 'Harmonie German Club',
  venueAddress: '49 Jerrabomberra Ave, Narrabundah ACT 2604',
  timezone: 'Australia/Sydney',
  entry: 'paid',
  priceFromCents: 2600,
  description: 'A children\u2019s show for all ages.',
  bookingUrl: 'https://events.humanitix.com/canberra-bush-fringe-festival',
}

const SANITY: SelfListingSubmission = {
  title: 'A Moment of Sanity',
  startsAt: '2026-11-24T08:00:00.000Z', // Tuesday 24 November, 7pm in Melbourne
  endsAt: '2026-11-24T10:00:00.000Z',
  venueName: 'Thornbury Apothecary',
  venueAddress: '800 High Street, Thornbury VIC 3071',
  timezone: 'Australia/Melbourne',
  entry: 'paid',
  priceFromCents: 5400,
  description: 'A gentle evening to pause, reset and reconnect.',
  bookingUrl: 'https://groovytown.com.au/amomentofsanity',
}

describe('the booking page, read for what it states', () => {
  test("TryBooking's structured data: the event, its times, venue, address, host and lowest price", () => {
    const facts = readBookingFacts(TRYBOOKING)
    expect(facts.events).toHaveLength(1)
    expect(facts.events[0]).toMatchObject({
      name: 'Ukrainian Theatre: Irma Vitovska-Vants in Kyivska Perepichka',
      startDate: '2026-12-05T18:30:00.000+11:00',
      locationName: 'The Wheeler Centre',
      address: '176 Little Lonsdale St, Melbourne, VIC, 3000',
      organiser: 'Ukrainian Multicultural Society of Australia Inc.',
      lowPrice: 80,
    })
    expect(facts.title).toBe('Ukrainian Theatre: Irma Vitovska-Vants in Kyivska Perepichka')
  })

  test("Humanitix's offset is given its colon, and every ticket type is kept with its price", () => {
    const e = readBookingFacts(HUMANITIX_FESTIVAL).events[0]
    expect(e.startDate).toBe('2026-11-27T16:00:00+11:00')
    expect(e.endDate).toBe('2026-11-29T21:30:00+11:00')
    expect(e.offers.map((o) => o.price)).toEqual([25, 26, 25, 26, 30])
    expect(e.lowPrice).toBe(25)
  })

  test('a page with no structured data is read by its words, never its scripts or styles', () => {
    const facts = readBookingFacts(GROOVYTOWN)
    expect(facts.events).toEqual([])
    expect(facts.text).toContain('tuesday 24 november')
    expect(facts.text).not.toContain('var tickets')
    expect(facts.text).not.toContain('color:red')
  })

  test('structured data that is not JSON is passed over, and an @graph is read', () => {
    const html = `<script type="application/ld+json">{not json</script>${ld({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'MusicEvent', name: 'Late Show', startDate: '2026-12-01' }] })}`
    expect(readBookingFacts(html).events.map((e) => e.name)).toEqual(['Late Show'])
  })
})

describe('the session a ticket type names', () => {
  test.each([
    ['Mr Snotbottom - all ages Saturday 11.30am', 6, '11:30'],
    ['Mr Snotbottom - all ages Sunday 10.30am', 0, '10:30'],
    ['Tutti Fruitti Cabaret and Circus 18+ Friday 8pm', 5, '20:00'],
    ['The Pink Pony Parlour 18 + Fri 9:30pm', 5, '21:30'],
    ['Midday show Thurs 12pm', 4, '12:00'],
    ['Wedding Singer matinee', null, null],
  ])('%s', (name, weekday, time) => {
    expect(sessionOf(name)).toEqual({ weekday, time })
  })
})

describe('a submission the page bears out publishes itself', () => {
  test("Kyivska Perepichka: the wrong start is corrected from TryBooking's page, and its end and host are taken", () => {
    const v = judgeSelfListing(KYIV, read(TRYBOOKING), [], NOW)
    expect(v.verdict).toBe('publish')
    if (v.verdict !== 'publish') return
    expect(v.matchedBy).toBe('structured_data')
    expect(v.facts.startsAt).toBe('2026-12-05T07:30:00.000Z')
    expect(v.facts.endsAt).toBe('2026-12-05T10:00:00.000Z')
    expect(v.facts.priceFromCents).toBe(8000)
    expect(v.facts.venueName).toBe('The Wheeler Centre')
    expect(v.facts.venueAddress).toBe('176 Little Lonsdale Street, Melbourne')
    expect(v.facts.host).toBe('Ukrainian Multicultural Society of Australia Inc.')
    expect(v.corrections.map((c) => c.field)).toEqual(['start', 'end'])
  })

  test('a page that states the day only corrects the day and keeps the organiser\'s own clock', () => {
    const dayOnly = (day: string) => TRYBOOKING.replace('2026-12-05T18:30:00.000+11:00', day).replace('2026-12-05T21:00:00.000+11:00', day)
    const moved = judgeSelfListing(KYIV, read(dayOnly('2026-12-06')), [], NOW)
    expect(moved.verdict).toBe('publish')
    if (moved.verdict !== 'publish') return
    expect(moved.facts.startsAt).toBe('2026-12-06T08:00:00.000Z')
    expect(moved.corrections.map((c) => c.field)).toEqual(['start'])
    const same = judgeSelfListing(KYIV, read(dayOnly('2026-12-05')), [], NOW)
    expect(same.verdict).toBe('publish')
    if (same.verdict !== 'publish') return
    expect(same.facts.startsAt).toBe('2026-12-05T08:00:00.000Z')
    expect(same.corrections).toEqual([])
  })
  test('a wrong price and a wrong venue are corrected from the page, never held', () => {
    const v = judgeSelfListing({ ...KYIV, priceFromCents: 6000, venueName: 'Melbourne Town Hall', venueAddress: '90 Swanston St' }, read(TRYBOOKING), [], NOW)
    expect(v.verdict).toBe('publish')
    if (v.verdict !== 'publish') return
    expect(v.facts.priceFromCents).toBe(8000)
    expect(v.facts.venueName).toBe('The Wheeler Centre')
    expect(v.facts.venueAddress).toBe('176 Little Lonsdale St, Melbourne, VIC, 3000')
    expect(v.corrections.map((c) => c.field)).toEqual(['start', 'end', 'venue', 'address', 'price'])
  })

  test("Mr Snotbottom: one session of a festival, matched by its ticket type, at the festival's venue and the ticket's price", () => {
    const v = judgeSelfListing(SNOTBOTTOM, read(HUMANITIX_FESTIVAL), [], NOW)
    expect(v.verdict).toBe('publish')
    if (v.verdict !== 'publish') return
    expect(v.matchedBy).toBe('ticket_type')
    expect(v.facts.startsAt).toBe('2026-11-28T00:30:00.000Z')
    expect(v.facts.priceFromCents).toBe(2600)
    expect(v.corrections).toEqual([])
  })

  test("the festival's ticket type corrects a wrong session time and price, keeping the day the organiser chose", () => {
    const sunday = judgeSelfListing({ ...SNOTBOTTOM, startsAt: '2026-11-29T00:00:00.000Z', priceFromCents: 2000 }, read(HUMANITIX_FESTIVAL), [], NOW)
    expect(sunday.verdict).toBe('publish')
    if (sunday.verdict !== 'publish') return
    expect(sunday.facts.startsAt).toBe('2026-11-28T23:30:00.000Z') // Sunday 29 November, 10:30am in Canberra
    expect(sunday.facts.priceFromCents).toBe(2600)
    expect(sunday.corrections.map((c) => c.field)).toEqual(['start', 'price'])
  })

  test('A Moment of Sanity: no structured data, so the words name it and state its date; the organiser\u2019s facts stand', () => {
    const v = judgeSelfListing(SANITY, read(GROOVYTOWN), [], NOW)
    expect(v.verdict).toBe('publish')
    if (v.verdict !== 'publish') return
    expect(v.matchedBy).toBe('page_words')
    expect(v.facts.startsAt).toBe(SANITY.startsAt)
    expect(v.facts.endsAt).toBe(SANITY.endsAt)
    expect(v.corrections).toEqual([])
  })

  test('a paid submission whose page sells only free tickets is listed free', () => {
    const page = ld({ '@type': 'Event', name: 'Kyivska Perepichka reading', startDate: '2026-12-05T18:30:00+11:00', offers: [{ '@type': 'Offer', name: 'General', price: 0 }] })
    const v = judgeSelfListing(KYIV, read(page), [], NOW)
    expect(v.verdict).toBe('publish')
    if (v.verdict !== 'publish') return
    expect(v.facts.entry).toBe('free')
    expect(v.facts.priceFromCents).toBeNull()
  })
})

describe('only a submission that cannot be verified is held, and says why', () => {
  const reasonOf = (sub: SelfListingSubmission, reading: PageReading, listed: { title: string; startsAt: string }[] = [], now = NOW) => {
    const v = judgeSelfListing(sub, reading, listed, now)
    return v.verdict === 'hold' ? v.reason : null
  }

  test('a page that cannot be read', () => {
    expect(reasonOf(KYIV, { ok: false, reason: 'the page answered 404' })).toBe('Its booking page could not be read (the page answered 404).')
  })
  test('a page that does not name the event', () => {
    expect(reasonOf({ ...SANITY, title: 'Harbour Lights Gala' }, read(GROOVYTOWN))).toBe('Its booking page does not name this event.')
  })
  test('a page that says the event is cancelled', () => {
    expect(reasonOf(KYIV, read(TRYBOOKING.replace('EventScheduled', 'EventCancelled')))).toBe('Its booking page says the event is cancelled or postponed.')
  })
  test("a festival's ticket type that names the show but not when", () => {
    expect(reasonOf(SNOTBOTTOM, read(HUMANITIX_FESTIVAL.replace(/Mr Snotbottom - all ages (Saturday 11\.30am|Sunday 10\.30am)/g, 'Mr Snotbottom - all ages')))).toBe(
      "Its festival's booking page names the show but not when it is on.",
    )
  })
  test('a link shortener', () => {
    expect(reasonOf({ ...KYIV, bookingUrl: 'https://bit.ly/3abcde' }, read(TRYBOOKING))).toBe('Its booking link is a link shortener, so the page behind it cannot be checked.')
  })
  test('spam', () => {
    expect(reasonOf({ ...KYIV, description: 'Best crypto airdrop tonight' }, read(TRYBOOKING))).toBe('It reads as spam, not an event.')
  })
  test('the same event already listed that day', () => {
    expect(reasonOf(KYIV, read(TRYBOOKING), [{ title: 'Kyivska Perepichka', startsAt: '2026-12-05T07:30:00.000Z' }])).toBe('The same event is already listed on that date.')
  })
  test('an event that has already started', () => {
    expect(reasonOf(KYIV, read(TRYBOOKING), [], new Date('2026-12-05T08:00:00Z'))).toBe('The event has already started.')
  })
})

describe('the reader goes only to the public web', () => {
  test.each([
    ['www.trybooking.com', true],
    ['events.humanitix.com', true],
    ['localhost', false],
    ['127.0.0.1', false],
    ['169.254.169.254', false],
    ['[::1]', false],
    ['intranet', false],
    ['printer.local', false],
    ['db.internal', false],
  ])('%s', (host, ok) => {
    expect(publicHost(host)).toBe(ok)
  })
})

describe('the listing in our own words', () => {
  test("a title loses the marks before its first word ('#Kyivska Perepichka')", () => {
    expect(cleanTitle('#Kyivska  Perepichka ')).toBe('Kyivska Perepichka')
  })
  test('the summary takes the organiser\u2019s first clean sentences, never a link, a dash or a ticket word', () => {
    const s = summaryFrom('A gentle evening to pause, reset and reconnect. BOOK NOW at https://x.example. Tickets are limited \u2014 hurry.', 'A Moment of Sanity', 'Thornbury Apothecary')
    expect(s).toBe('A gentle evening to pause, reset and reconnect.')
  })
  test('with nothing usable, the summary names the event and its venue', () => {
    expect(summaryFrom(null, 'Mr Snotbottom', 'Harmonie German Club')).toBe('Mr Snotbottom at Harmonie German Club.')
  })
})

describe('the form takes every city EventLinqs knows, timed in its own zone', () => {
  const CONTEXT: SubmissionContext = {
    cities: new Map([
      ['melbourne', { name: 'Melbourne', state: 'VIC', timezone: 'Australia/Melbourne' }],
      ['canberra', { name: 'Canberra', state: 'ACT', timezone: 'Australia/Sydney' }],
      ['perth', { name: 'Perth', state: 'WA', timezone: 'Australia/Perth' }],
    ]),
    categories: new Set(['comedy', 'theatre']),
  }
  const INPUT: SubmissionInput = {
    name: 'A Organiser',
    email: 'organiser@example.com',
    role: 'organiser',
    title: 'Mr Snotbottom',
    startsLocal: '2026-11-28T11:30',
    endsLocal: '',
    venueName: 'Harmonie German Club',
    venueAddress: '49 Jerrabomberra Ave, Narrabundah ACT 2604',
    city: 'canberra',
    category: 'comedy',
    bookingUrl: 'https://events.humanitix.com/canberra-bush-fringe-festival',
    entry: 'paid',
    price: '26',
    description: '',
    hasPhoto: false,
    photoOwned: false,
    authority: true,
    permission: true,
  }
  test('a Canberra event is read in Canberra time and keeps its city and kind', () => {
    const j = judgeSubmission(INPUT, NOW, CONTEXT)
    expect(j.ok).toBe(true)
    if (!j.ok) return
    expect(j.row).toMatchObject({ starts_at: '2026-11-28T00:30:00.000Z', city_slug: 'canberra', category_slug: 'comedy' })
  })
  test('a Perth event is read in Perth time', () => {
    const j = judgeSubmission({ ...INPUT, city: 'perth' }, NOW, CONTEXT)
    expect(j.ok && j.row.starts_at).toBe('2026-11-28T03:30:00.000Z')
  })
  test('a city EventLinqs does not know, and a missing kind, are each refused with a reason', () => {
    const city = judgeSubmission({ ...INPUT, city: 'atlantis' }, NOW, CONTEXT)
    expect(city.ok ? null : city.problem).toBe('Choose the city it is in.')
    const kind = judgeSubmission({ ...INPUT, category: '' }, NOW, CONTEXT)
    expect(kind.ok ? null : kind.problem).toBe('Choose what kind of event it is.')
  })
  test('the date words a page uses are read in each common form', () => {
    for (const t of ['tuesday 24 november', 'november 24th, 2026', '24/11/2026', '2026-11-24', 'tue 24th of nov']) expect(wordsStateDate(t, '2026-11-24')).toBe(true)
    expect(wordsStateDate('tuesday 25 november', '2026-11-24')).toBe(false)
  })
})

/*
 * LAWAL'S 20:52 OF 15 NOVEMBER 2026, ITEM 3, ON H2O: "next time, I want such events to be live". A submission from the
 * organiser, with authority confirmed on the form (submission.ts AUTHORITY_WORDS, required), is its own source for its
 * date (law 19 accepts the organiser): when the organiser's own page names the event but states no date in its words,
 * it publishes at once on the organiser's word, never held. Joe Merlo's H2o New Year's Eve night (submission a02aea30,
 * 11 November) was held at 'Its booking page does not state the event's date.' because nyeh2o.com.au does not.
 */
describe("an organiser's own submission is its own source for its date (Lawal's 20:52 of 15 November 2026)", () => {
  const H2O_PAGE = `<html><head><title>New Years Eve Melbourne - H2o | Sunset on the Yarra</title></head><body>
<h1>New Years Eve Melbourne H2o</h1><p>Sunset on the Yarra. Celebrate the countdown at Metropolis Events, Southbank, with
fireworks over the Yarra, a DJ and a three course menu. Tickets on sale now.</p></body></html>`
  const H2O: SelfListingSubmission = {
    title: 'New Years Eve Melbourne - H2o | Sunset on the Yarra',
    startsAt: '2026-12-31T09:00:00.000Z', // Thursday 31 December, 8 pm in Melbourne
    endsAt: '2027-01-01T15:30:00.000Z', // 2:30 am
    venueName: 'Metropolis Events',
    venueAddress: 'Southbank VIC 3006',
    timezone: 'Australia/Melbourne',
    entry: 'paid',
    priceFromCents: 15000,
    description: 'New Year\u2019s Eve on the Yarra with fireworks views.',
    bookingUrl: 'https://nyeh2o.com.au/',
  }

  test('H2o: the page names the night and states no date, so it publishes at once on the organiser\u2019s date', () => {
    const v = judgeSelfListing(H2O, read(H2O_PAGE), [], NOW)
    expect(v.verdict).toBe('publish')
    if (v.verdict !== 'publish') return
    expect(v.matchedBy).toBe('organiser_word')
    expect(v.facts.startsAt).toBe(H2O.startsAt)
    expect(v.facts.endsAt).toBe(H2O.endsAt)
    expect(v.corrections).toEqual([])
  })

  test('a page whose words name the night but not its date publishes on the organiser\u2019s date (GroovyTown, another day)', () => {
    const v = judgeSelfListing({ ...SANITY, startsAt: '2026-11-25T08:00:00.000Z', endsAt: null }, read(GROOVYTOWN), [], NOW)
    expect(v.verdict).toBe('publish')
    if (v.verdict !== 'publish') return
    expect(v.matchedBy).toBe('organiser_word')
    expect(v.facts.startsAt).toBe('2026-11-25T08:00:00.000Z')
  })

  test('the page words that do state the date still read as the page\u2019s own match', () => {
    const v = judgeSelfListing(SANITY, read(GROOVYTOWN), [], NOW)
    expect(v.verdict === 'publish' && v.matchedBy).toBe('page_words')
  })

  test('what still holds: a page that does not name the night, and a night already started', () => {
    expect(judgeSelfListing({ ...H2O, title: 'Harbour Lights Gala' }, read(H2O_PAGE), [], NOW)).toEqual({ verdict: 'hold', reason: 'Its booking page does not name this event.' })
    expect(judgeSelfListing(H2O, read(H2O_PAGE), [], new Date('2027-01-01T00:00:00Z'))).toEqual({ verdict: 'hold', reason: 'The event has already started.' })
  })
})
