import { describe, expect, it } from 'vitest'
import { planCandidates, type FoundEvent } from '@/lib/listings/collect'

/*
 * A NIGHT THE SOURCE RE-ISSUES IS THE SAME NIGHT (the PM's 00:39 of 21 November 2026, item 1 (c), the class of the
 * sentinel's CRITICAL of 23:41 on 20 November). Geelong Regional Libraries took 'Laser cutting workshop' (UID 17530260,
 * its page now 404) out of its feed and carries the same session, 9 December 2026 at 2 pm Melbourne at the Dome, as
 * 'Festive laser cutting workshop' under UID 17564231 (C:\dev\EVIDENCE\EL-21NOV\laser\read3, read politely). The
 * collector must take the re-issue as the night it already lists, adding its new link (which releases the hold on a
 * night that left its source's list), never as a second card beside a dead one.
 */
describe('a re-issued night', () => {
  const now = new Date('2026-11-20T17:10:00Z') // the 04:10 collection run on 21 November, Melbourne
  const known = [
    {
      eventId: '0fbe99e6-6bc3-44a3-8716-a79f076f6f88',
      venueId: null,
      venueName: 'Geelong Library and Heritage Centre (The Dome)',
      venueAddress: '51 Little Malop Street, Geelong VIC 3220',
      title: 'Laser cutting workshop',
      startsAt: '2026-12-09T03:00:00.000Z',
      citySlug: 'geelong',
    },
  ]
  const reissued: FoundEvent = {
    title: 'Festive laser cutting workshop',
    startsAt: '2026-12-09T03:00:00.000Z',
    endsAt: '2026-12-09T04:30:00.000Z',
    venueName: 'Geelong Library and Heritage Centre (The Dome)',
    venueAddress: '51 Little Malop Street, Geelong VIC 3220',
    pageUrl: 'https://events.grlc.vic.gov.au/event/17564231',
    imageUrl: null,
    description: null,
    links: [{ url: 'https://events.grlc.vic.gov.au/event/17564231', availability: 'on_sale', priceFromCents: null }],
  }

  it('the new UID at the same start and venue adds its link to the listed night, never a new card', () => {
    const plans = planCandidates([reissued], known, now, 'geelong')
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ kind: 'adds_links', eventId: '0fbe99e6-6bc3-44a3-8716-a79f076f6f88' })
    expect(plans[0].event.links.map((l) => l.url)).toEqual(['https://events.grlc.vic.gov.au/event/17564231'])
  })

  it('another laser session at another start stays its own night', () => {
    const plans = planCandidates([{ ...reissued, title: 'Laser cutting workshop', startsAt: '2026-11-25T04:00:00.000Z' }], known, now, 'geelong')
    expect(plans.map((p) => p.kind)).not.toContain('adds_links')
  })
})
