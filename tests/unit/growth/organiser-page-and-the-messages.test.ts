/**
 * OL1. THE ORGANISER PAGE AND THE OUTREACH MESSAGES BECOME ONE THING.
 *
 * From 12 September 2026 every message the founder sends by hand points a
 * stranger at /organisers. Three things those messages promise were not on it:
 * a live event the stranger can open, the founder setting the first event up
 * personally on a call, and a way to say yes to him rather than to a form.
 *
 * DESIGN-LOCK applies to that page: nothing already on it changes except what
 * this item adds, and the assertions below are written to notice if it did.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { FOUNDING_OFFER } from '@/lib/organisers/founding-offer'
import { ORGANISER_OBJECTIONS } from '@/lib/organisers/objections'
import {
  ORGANISER_SIGNUP_PATH,
  ORGANISER_SIGNUP_SOURCE,
  withSignupSource,
} from '@/lib/organisers/signup-source'
import { NEWEST_EVENT_SELECT } from '@/lib/organisers/newest-published-event'
import { contactAddress, contactMailto } from '@/lib/email/sender'
import { FOR_ORGANISERS } from '@/components/layout/site-footer'

const ROOT = process.cwd()
const TEMPLATE = readFileSync(join(ROOT, 'src/components/templates/OrganisersLandingPage.tsx'), 'utf8')
const HEADER = readFileSync(join(ROOT, 'src/components/layout/site-header-client.tsx'), 'utf8')

describe('OL1: the signup source every button carries', () => {
  it('adds src to a bare path', () => {
    expect(withSignupSource(ORGANISER_SIGNUP_PATH)).toBe(`${ORGANISER_SIGNUP_PATH}?src=${ORGANISER_SIGNUP_SOURCE}`)
  })

  it('keeps a query that is already there', () => {
    expect(withSignupSource('/organisers/signup?ref=ABC123')).toBe('/organisers/signup?ref=ABC123&src=organisers')
  })

  it('never overwrites a more specific source', () => {
    // A share link or a confirmation page knows better than the page the person
    // happened to land on, so the coarser answer must not clobber the finer one.
    expect(withSignupSource('/organisers/signup?src=ticket')).toBe('/organisers/signup?src=ticket')
  })

  it('takes every button on the page through it, and leaves no bare href behind', () => {
    expect(TEMPLATE).not.toMatch(/href=\{?["']?\/organisers\/signup["']?\}?/)
    expect([...TEMPLATE.matchAll(/withSignupSource\(/g)].length).toBeGreaterThanOrEqual(3)
  })
})

describe('OL1: the way to say yes to the founder rather than to a form', () => {
  it('opens a mailto with the subject the reply can be found by', () => {
    const href = contactMailto('hello', FOUNDING_OFFER.founderCtaSubject)
    expect(href.startsWith('mailto:')).toBe(true)
    expect(href).toContain(encodeURIComponent('Founding Organiser'))
  })

  it('uses the brand address, never a private mailbox', () => {
    // Founder ruling R2, 3 August 2026: a personal address was hardcoded in two
    // source files and nothing failed, because the fallback worked. This page is
    // public, so the address is resolved from the one sender definition.
    const address = contactAddress('hello')
    expect(address).not.toMatch(/gmail|outlook|hotmail|yahoo/i)
    expect(TEMPLATE).toContain("contactMailto('hello', FOUNDING_OFFER.founderCtaSubject)")
    expect(TEMPLATE).not.toMatch(/mailto:[a-z0-9._%-]+@/i)
  })

  it('says the thing in the founder’s own words, under the button', () => {
    expect(FOUNDING_OFFER.founderCtaLabel).toBe('Set up my event with Lawal')
    expect(FOUNDING_OFFER.founderCtaNote).toContain('20 minute call')
    expect(FOUNDING_OFFER.founderCtaNote).toContain('Lawal Adams, founder')
    expect(TEMPLATE).toContain('FOUNDING_OFFER.founderCtaLabel')
    expect(TEMPLATE).toContain('FOUNDING_OFFER.founderCtaNote')
  })
})

describe('OL1: the live proof block is a read, not a screenshot', () => {
  it('selects the columns a card needs, and orders by when it went live', () => {
    // Not created_at: a draft can sit for weeks, so the newest CREATED event is
    // not the newest thing a stranger can go and look at.
    const source = readFileSync(join(ROOT, 'src/lib/organisers/newest-published-event.ts'), 'utf8')
    expect(source).toContain("order('published_at', { ascending: false, nullsFirst: false })")
    // WHICH events are eligible is COMPOSED from the one rule, never spelled
    // out here: a predicate written at each call site is a predicate per call
    // site, and /events once printed a correct count of 2 beside a rail of 8
    // deleted events for exactly that reason.
    expect(source).toContain('applyPublicEventVisibility(')
    expect(source).not.toContain("eq('status', 'published')")
    expect(source).not.toContain("eq('visibility', 'public')")
    for (const column of ['slug', 'title', 'cover_image_url', 'start_date', 'ticket_tiers']) {
      expect(NEWEST_EVENT_SELECT).toContain(column)
    }
  })

  it('renders nothing at all when the catalogue has nothing to show', () => {
    // An empty catalogue is a real state on a launching platform. A fabricated
    // example would be the exact thing Law 4 forbids.
    expect(TEMPLATE).toContain('{newestEvent && <LiveProofEvent event={newestEvent} />}')
  })

  it('carries no event literal anywhere on the surface', () => {
    expect(TEMPLATE).not.toMatch(/["'`]\/events\/[a-z0-9]/i)
    expect(TEMPLATE).toContain('getNewestPublishedEvent()')
  })

  it('promises live sales beside a card the reader can actually open', () => {
    expect(TEMPLATE).toContain('Live now, real event, real sales')
    expect(TEMPLATE).toContain('href={`/events/${event.slug}`}')
  })
})

describe('OL1: the five things a stranger says back', () => {
  const questions = ORGANISER_OBJECTIONS.map(o => o.q.toLowerCase())

  it.each([
    ['will I get paid', /paid/],
    ['nobody knows you', /nobody knows you/],
    ['no time', /no time/],
    ['my people are elsewhere', /somewhere else/],
    ['what if you shut down', /shut down/],
  ])('answers %s', (_name, pattern) => {
    expect(questions.some(q => pattern.test(q))).toBe(true)
  })

  it('names no other platform, anywhere in the answers', () => {
    // Public copy never names a competitor (positioning lock, 7 September 2026).
    // The recruitment pack's own answer to "my people are elsewhere" names one;
    // the co-listing offer works without it.
    const prose = ORGANISER_OBJECTIONS.map(o => `${o.q} ${o.a}`).join(' ')
    for (const name of ['Eventbrite', 'Ticketmaster', 'Ticketek', 'Humanitix', 'DICE', 'Moshtix', 'Oztix', 'TryBooking']) {
      expect(prose).not.toContain(name)
    }
  })

  it('does not restate a fee or a founding number that is published from configuration elsewhere', () => {
    // Two sources for one number is how the page and the invoice come to
    // disagree. These answers point at the mechanism instead.
    const prose = ORGANISER_OBJECTIONS.map(o => o.a).join(' ')
    expect(prose).not.toMatch(/\d+(\.\d+)?\s*(?:%|per cent)/)
    expect(prose).not.toMatch(/AUD\s*\d/)
  })

  it('only promises the export because the export exists', () => {
    // Never fabricate the data-ownership promise: the surface must actually
    // work. This is the route that serves it.
    const attendees = readFileSync(
      join(ROOT, 'src/app/(dashboard)/dashboard/events/[id]/attendees/page.tsx'),
      'utf8',
    )
    expect(attendees).toContain('/attendees/export')
    expect(attendees).toContain('format=csv')
    const shutdown = ORGANISER_OBJECTIONS.find(o => /shut down/i.test(o.q))
    expect(shutdown?.a).toContain('export')
  })

  it('reaches the page through the same FAQ the help answers use', () => {
    expect(TEMPLATE).toContain('const FAQ_ENTRIES = [...FAQ_ARTICLES, ...ORGANISER_OBJECTIONS]')
    expect(TEMPLATE).toContain('{FAQ_ENTRIES.map((article, i) => (')
  })
})

describe('OL1: the header and the footer both point at the page', () => {
  it('the header links to it, in the wording the founder set', () => {
    // The launch-blocker list renamed "For Organisers" to "Event Organisers".
    // OL1 asks that the header link to the page, not that it be renamed again.
    expect(HEADER).toContain("{ label: 'Event Organisers', href: '/organisers' }")
  })

  it('the footer names it Organisers rather than describing it as a guide', () => {
    const organisers = FOR_ORGANISERS.find(l => l.href === '/organisers')
    expect(organisers).toBeDefined()
    expect(organisers?.label).toBe('Organisers')
  })
})

describe('OL1: DESIGN-LOCK, every section that was there is still there', () => {
  it.each([
    ['the photographic hero', 'organisers-hero-heading'],
    ['the live counts strip', 'LiveProofStrip'],
    ['the real-truths stats band', 'STATS.map'],
    ['the demand engine band', 'DISCOVERY_BAND'],
    ['the pricing clarity band and payout calculator', 'PricingClarityBand'],
    ['the Founding Organiser offer', 'FoundingOfferBand'],
    ['the alternating feature bands', 'BANDS.map'],
    ['the testimonials slot', 'TestimonialsBand'],
    ['the visual how-it-works', 'How it works'],
    ['the every-community tile grid', 'OrganiserCommunityStrip'],
    ['the premium FAQ', 'Organiser FAQ'],
    ['the photographic closing CTA', 'organisers-cta-heading'],
  ])('%s survives', (_name, marker) => {
    expect(TEMPLATE).toContain(marker)
  })
})
