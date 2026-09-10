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
const EVENT_JSONLD = join(process.cwd(), 'src/components/features/events/event-schema-jsonld.tsx')

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
    expect(jsonld).toMatch(/\/organisers\/\$\{organisation\.slug\}/)
    expect(page).toContain('/organisers/${event.organisation.slug}')
  })

  test('the link has an accessible name that contains its visible label', () => {
    // WCAG 2.5.3: the accessible name must contain the visible text, or voice
    // control cannot activate what a person can read.
    const page = readFileSync(EVENT_PAGE, 'utf8')
    expect(page).toContain('aria-label={`View profile: ${event.organisation.name}`}')
    expect(page).toContain('View profile')
  })
})
