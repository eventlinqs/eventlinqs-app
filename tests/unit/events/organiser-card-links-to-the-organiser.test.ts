import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE "ORGANISED BY" CARD MUST LEAD SOMEWHERE (close-out UX1).
 *
 * Found on 11 September 2026 by running the UX1 organiser journey, which had
 * been written and never run. The card on the event page named the organiser,
 * drew their initials and clamped their bio to three lines, and linked nowhere.
 *
 * What makes it worth a test rather than a note is that the SAME PAGE was
 * already publishing that profile URL to search engines:
 * `event-schema-jsonld.tsx` emits `organizer.url` as
 * `${baseUrl}/organisers/${organisation.slug}`. So the structured data told
 * Google about a page the document itself never linked to. The organiser's
 * profile had no inbound link from the one page a buyer actually reads, the
 * fully rendered bio on it was unreachable, and on a phone a card that reads as
 * tappable did nothing, which is the dead-end tile Law 5 names.
 *
 * These are source assertions on purpose. The driven proof lives in
 * `scripts/verify/ux1-organiser-surfaces-proof.mjs`, which signs a real
 * organiser up and clicks through from their published event; that runs against
 * a served build and cannot run in the unit suite. This holds the shape so the
 * link cannot quietly disappear between drives.
 */
const EVENT_PAGE = join(process.cwd(), 'src/app/events/[slug]/page.tsx')
/*
 * THE FILE THAT BUILDS `organizer.url` MOVED, and this constant moved with it.
 *
 * Until SEO1 the payload was built inside `event-schema-jsonld.tsx`. SEO1 split
 * the pure builder out into `src/lib/seo/event-schema.ts` so that
 * `scripts/guards/event-structured-data.mjs` can EXECUTE it: the alias loader
 * strips types but does not transpile, so a module holding JSX cannot be loaded
 * by a guard at all. The component is now a thin renderer.
 *
 * The invariant this test holds is unchanged and still the one that matters: the
 * page must LINK the same profile URL the structured data PUBLISHES. Only the
 * file the URL is built in is different, so the assertion follows it rather than
 * being relaxed.
 */
const EVENT_JSONLD = join(process.cwd(), 'src/lib/seo/event-schema.ts')

describe('the event page links to the organiser it names', () => {
  test('the Organised by card carries a link to /organisers/<slug>', () => {
    const page = readFileSync(EVENT_PAGE, 'utf8')
    expect(page).toMatch(/href=\{`\/organisers\/\$\{event\.organisation\.slug\}`\}/)
  })

  test('the link is a sibling of the Follow control, never its ancestor', () => {
    // A <button> inside an <a> is invalid HTML and the browser resolves it
    // however it likes. The card has both, so the ordering matters: the anchor
    // must close before the FollowButton opens.
    const page = readFileSync(EVENT_PAGE, 'utf8')
    const linkAt = page.indexOf('`/organisers/${event.organisation.slug}`')
    const closeAt = page.indexOf('</Link>', linkAt)
    const followAt = page.indexOf('<FollowButton type="organiser"', linkAt)
    expect(linkAt, 'the organiser link is present').toBeGreaterThan(-1)
    expect(followAt, 'the organiser Follow control is present').toBeGreaterThan(-1)
    expect(closeAt).toBeGreaterThan(-1)
    expect(closeAt).toBeLessThan(followAt)
  })

  test('the page links the same profile URL its structured data publishes', () => {
    // This is the disagreement that produced the defect: one half of the page
    // told a search engine the profile existed and the other half never
    // pointed at it.
    const page = readFileSync(EVENT_PAGE, 'utf8')
    const jsonld = readFileSync(EVENT_JSONLD, 'utf8')
    // Both halves ask shownOrganiser (ruling A): the card renders only where it gives a slug, and the builder
    // takes its slug, which for an organiser's own event is the organisation's (car 2's read back, 29 October 2026).
    expect(jsonld).toMatch(/\/organisers\/\$\{shown\.slug\}/)
    expect(jsonld).toContain('shownOrganiser(event, organisation)')
    expect(page).toContain('/organisers/${event.organisation.slug}')
    expect(page).toContain('shownOrganiser(event, event.organisation).slug !== null')
  })

  test('the link has an accessible name that contains its visible label', () => {
    // WCAG 2.5.3: the accessible name must contain the visible text, or voice
    // control cannot activate what a person can read.
    const page = readFileSync(EVENT_PAGE, 'utf8')
    expect(page).toContain('aria-label={`View profile: ${event.organisation.name}`}')
    expect(page).toContain('View profile')
  })
})

/**
 * AN EVENTLINQS LISTING SHOWS NO ORGANISER CARD (ruling A of 23 October 2026; window 5's finish pass on production,
 * 29 October 2026): the card linked /organisers/eventlinqs-listings, which answers 404, on every curated night the
 * event page draws (Fighters Of Foo and Kate Ceberano among them). The card renders only where shownOrganiser
 * gives a page to link, which it never does for the listings organisation.
 */
describe('an EventLinqs listing never shows the listings organisation', () => {
  test('the Organised by card is gated on shownOrganiser having a page to link', () => {
    const page = readFileSync(EVENT_PAGE, 'utf8')
    const gateAt = page.indexOf('shownOrganiser(event, event.organisation).slug !== null')
    const cardAt = page.indexOf('eyebrow="Organised by"')
    expect(gateAt, 'the card is gated on shownOrganiser').toBeGreaterThan(-1)
    expect(cardAt).toBeGreaterThan(gateAt)
  })

  test('shownOrganiser gives the listings organisation no page to link', async () => {
    const { shownOrganiser } = await import('@/lib/listings/shown-organiser')
    expect(shownOrganiser({ listing_source: 'eventlinqs', venue_name: 'Barwon Club Hotel' }, { name: 'EventLinqs listings', slug: 'eventlinqs-listings' }).slug).toBeNull()
    expect(shownOrganiser({ listing_source: null }, { name: 'EventLinqs listings', slug: 'eventlinqs-listings' }).slug).toBeNull()
    expect(shownOrganiser({ listing_source: null }, { name: 'MKL Studios', slug: 'mkl-studios' }).slug).toBe('mkl-studios')
  })
})
