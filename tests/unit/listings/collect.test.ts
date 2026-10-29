import { describe, expect, it } from 'vitest'
import {
  FAILING_AFTER_RUNS,
  failuresInARow,
  dueSources,
  eventsFromHtml,
  planCandidates,
  robotsAllows,
  robotsRules,
  robotsVerdict,
  type FoundEvent,
  type RegisteredSource,
} from '@/lib/listings/collect'

/*
 * Item 19, the weekly collection run (START-16OCT/EVENTLINQS-FOUNDATION-LOCKED-27OCT.md; docs/walk-in/COLLECTION-RUN.md):
 * only sources whose terms allow it, robots.txt as RFC 9309 says, the page's own Event data, reviewed before
 * publishing, and a second source adds a link, never a card.
 */

describe('robots.txt, RFC 9309', () => {
  const txt = [
    'User-agent: *',
    'Disallow: /private',
    'Allow: /private/events',
    '',
    'User-agent: BadBot',
    'Disallow: /',
  ].join('\n')

  it('the "*" group when none names us; the longest match wins; an equal allow wins', () => {
    const rules = robotsRules(txt)
    expect(robotsAllows(rules, '/whats-on')).toBe(true)
    expect(robotsAllows(rules, '/private/admin')).toBe(false)
    expect(robotsAllows(rules, '/private/events/jazz')).toBe(true)
    expect(robotsAllows(robotsRules('User-agent: *\nDisallow: /a\nAllow: /a'), '/a')).toBe(true)
  })

  it('our own group, matched case insensitive, replaces the "*" group', () => {
    const rules = robotsRules('User-agent: *\nAllow: /\n\nUser-agent: eventlinqs\nDisallow: /events')
    expect(robotsAllows(rules, '/events/x')).toBe(false)
    expect(robotsAllows(rules, '/about')).toBe(true)
  })

  it('"*" and "$" as the RFC defines them', () => {
    const rules = robotsRules('User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*/x')
    expect(robotsAllows(rules, '/files/a.pdf')).toBe(false)
    expect(robotsAllows(rules, '/files/a.pdf?x=1')).toBe(true)
    expect(robotsAllows(rules, '/tmp/1/x')).toBe(false)
  })

  it('a 4xx robots.txt allows; a 429, a 5xx or no answer disallows everything', () => {
    expect(robotsVerdict(404, '', '/e')).toBe('allowed')
    expect(robotsVerdict(503, '', '/e')).toBe('disallowed')
    expect(robotsVerdict(429, '', '/e')).toBe('disallowed')
    expect(robotsVerdict(null, '', '/e')).toBe('disallowed')
    expect(robotsVerdict(200, 'User-agent: *\nDisallow: /', '/e')).toBe('disallowed')
  })
})

const page = (events: unknown) =>
  `<html><head><script type="application/ld+json">${JSON.stringify(events)}</script></head><body></body></html>`

describe("the page's own Event data", () => {
  it('reads an event as the page states it, offers and all', () => {
    const html = page({
      '@context': 'https://schema.org',
      '@type': 'MusicEvent',
      name: 'Bp Proof Trio',
      startDate: '2026-11-14T20:00:00+11:00',
      endDate: '2026-11-14T23:00:00+11:00',
      location: { '@type': 'Place', name: 'The Barwon Club', address: { streetAddress: '509 Moorabool St', addressLocality: 'Geelong' } },
      image: '/img/trio.jpg',
      offers: [
        { url: 'https://events.humanitix.com/bp-proof-trio', price: '28.50', priceCurrency: 'AUD', availability: 'https://schema.org/InStock' },
        { url: 'https://www.moshtix.com.au/v2/event/bp-proof-trio', availability: 'SoldOut' },
      ],
    })
    const [e] = eventsFromHtml(html, 'https://barwonclub.example.com.au/gigs')
    expect(e.title).toBe('Bp Proof Trio')
    expect(e.startsAt).toBe('2026-11-14T09:00:00.000Z')
    expect(e.venueAddress).toBe('509 Moorabool St, Geelong')
    expect(e.imageUrl).toBe('https://barwonclub.example.com.au/img/trio.jpg')
    expect(e.links).toEqual([
      { url: 'https://events.humanitix.com/bp-proof-trio', availability: 'on_sale', priceFromCents: 2850 },
      { url: 'https://www.moshtix.com.au/v2/event/bp-proof-trio', availability: 'sold_out', priceFromCents: null },
    ])
  })

  it('reads a @graph; skips cancelled, a location that is not a Place, and events missing a name, a start or a place', () => {
    const html = page({
      '@graph': [
        { '@type': 'Event', name: 'Kept', startDate: '2026-11-20T19:00:00+11:00', location: { name: 'Hall' } },
        { '@type': 'Event', name: 'Cancelled', startDate: '2026-11-20', location: { name: 'Hall' }, eventStatus: 'https://schema.org/EventCancelled' },
        { '@type': 'Event', name: 'Not at a place', startDate: '2026-11-20', location: { '@type': 'WebPage', name: 'A stream', url: 'https://stream.example.com/1' } },
        { '@type': 'Event', name: 'No place', startDate: '2026-11-20' },
        { '@type': 'Organization', name: 'Not an event' },
      ],
    })
    expect(eventsFromHtml(html, 'https://x.example.com').map((e) => e.title)).toEqual(['Kept'])
    expect(eventsFromHtml('<script type="application/ld+json">{broken</script>', 'https://x.example.com')).toEqual([])
  })

  it('never takes an http link or a price in another currency', () => {
    const html = page({
      '@type': 'Event',
      name: 'Bp Proof Night',
      startDate: '2026-11-20T19:00:00+11:00',
      location: { name: 'Hall' },
      offers: [{ url: 'http://insecure.example.com/t', price: 10 }, { url: 'https://t.example.com/t', price: 10, priceCurrency: 'USD' }],
    })
    expect(eventsFromHtml(html, 'https://x.example.com')[0].links).toEqual([{ url: 'https://t.example.com/t', availability: 'on_sale', priceFromCents: null }])
  })
})

describe('the register', () => {
  const now = new Date('2026-10-27T03:00:00Z')
  const src = (id: string, over: Partial<RegisteredSource>): RegisteredSource => ({
    id, name: id, pageUrl: `https://${id}.example.com`, collection: 'read', changes: 'weekly', lastCheckedAt: null, lastSuccessAt: null, permits: { facts: true, descriptions: false, images: false, links: true }, verified: true, partner: false, partnerVenue: null, ...over,
  })

  it('reads only sources whose terms allow it, each at its own pace', () => {
    const due = dueSources(
      [
        src('never-checked', {}),
        src('ask', { collection: 'ask' }),
        src('never', { collection: 'never' }),
        src('checked-yesterday', { lastCheckedAt: '2026-10-26T03:00:00Z' }),
        src('checked-a-week-ago', { lastCheckedAt: '2026-10-20T03:00:00Z' }),
        src('monthly-a-week-ago', { changes: 'monthly', lastCheckedAt: '2026-10-20T03:00:00Z' }),
      ],
      now,
    )
    expect(due.map((s) => s.id)).toEqual(['never-checked', 'checked-a-week-ago'])
  })
})

describe('what lands for review', () => {
  const now = new Date('2026-10-27T03:00:00Z')
  const found = (title: string, over: Partial<FoundEvent> = {}): FoundEvent => ({
    title,
    startsAt: '2026-11-14T09:00:00.000Z',
    endsAt: null,
    venueName: 'The Barwon Club',
    venueAddress: '509 Moorabool St, Geelong',
    pageUrl: 'https://barwonclub.example.com.au/gigs',
    imageUrl: null,
    description: null,
    links: [{ url: `https://events.humanitix.com/${title.length}`, availability: 'on_sale', priceFromCents: null }],
    ...over,
  })

  it('two sources, one event: one candidate with both links; an event already listed gains links, never a card', () => {
    const plans = planCandidates(
      [
        found('Bp Proof Trio'),
        found('Bp Proof Trio, live', { links: [{ url: 'https://www.eventbrite.com.au/e/1', availability: 'on_sale', priceFromCents: null }] }),
        found('Bp Comedy Hour', { startsAt: '2026-11-15T09:00:00.000Z' }),
      ],
      [{ eventId: 'ev-1', venueId: null, venueName: 'The Barwon Club', venueAddress: null, title: 'Bp Comedy Hour', startsAt: '2026-11-15T09:30:00.000Z' }],
      now,
    )
    expect(plans.map((p) => p.kind)).toEqual(['new', 'adds_links'])
    expect(plans[0].event.links.map((l) => l.url)).toEqual(['https://events.humanitix.com/13', 'https://www.eventbrite.com.au/e/1'])
    expect(plans[1].kind === 'adds_links' && plans[1].eventId).toBe('ev-1')
  })

  it('nothing past, nothing past the 90 day horizon (the engine plan of 28 October 2026)', () => {
    const plans = planCandidates([found('Bp Past', { startsAt: '2026-10-01T09:00:00.000Z' }), found('Bp Far', { startsAt: '2027-06-01T09:00:00.000Z' })], [], now)
    expect(plans).toEqual([])
    const at = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
    expect(planCandidates([found('Bp Edge', { startsAt: at(89) })], [], now)).toHaveLength(1)
    expect(planCandidates([found('Bp Beyond', { startsAt: at(91) })], [], now)).toEqual([])
  })
})

describe('a source failing run after run (the engine plan part A)', () => {
  it('counts failures from the newest run back to the last success', () => {
    expect(failuresInARow([])).toBe(0)
    expect(failuresInARow([{ succeeded: true }, { succeeded: false }])).toBe(0)
    expect(failuresInARow([{ succeeded: false }, { succeeded: false }, { succeeded: true }, { succeeded: false }])).toBe(2)
    expect(failuresInARow([{ succeeded: false }, { succeeded: false }, { succeeded: false }])).toBe(FAILING_AFTER_RUNS)
  })
})
