import { describe, expect, it } from 'vitest'
import { planCandidates, type FoundEvent, type KnownEvent } from '@/lib/listings/collect'

/*
 * A SECOND SESSION THE SAME DAY IS A NEW NIGHT, NEVER THE LISTED ONE MOVED (the CONTROLLER's 20:28 of 6 November 2026, case 1).
 * Geelong Arts Centre's page for Medimime's The Little Mermaid states 8 sessions (read through the engine's own reader on 6
 * November: Sat 7 Nov 1:30 pm AND 7:00 pm, Sat 14 Nov 1:30 pm AND 7:00 pm among them); production lists 6, both 7:00 pm shows
 * missing. When the page states the listed 1:30 pm and a 7:00 pm the same day, the 7:00 pm is a second session: the listed
 * night has not moved, because its own start is still stated.
 */
const NOW = new Date('2026-11-06T00:00:00Z')
const venue = { venueName: 'The Story House', venueAddress: '50 Little Malop Street, Geelong VIC 3220' }
const title = 'Medimime Productions presents The Little Mermaid'
const page = 'https://geelongartscentre.org.au/whats-on/all-events/medimime-little-mermaid/'
const found = (iso: string): FoundEvent => ({
  title, startsAt: iso, endsAt: null, ...venue, pageUrl: page, imageUrl: null, description: null,
  links: [{ url: 'https://tickets.example.com/mermaid', availability: 'on_sale', priceFromCents: null }],
})
const listedMatinee: KnownEvent = {
  eventId: 'e-sat-matinee', seriesId: 's1', citySlug: 'geelong', venueId: 'v1', ...venue, title,
  startsAt: '2026-11-07T02:30:00.000Z', // Sat 7 Nov 1:30 pm Melbourne
}

describe('a second session on a listed night day', () => {
  it('the 7:00 pm show beside the listed 1:30 pm, both stated, is a new night', () => {
    const plans = planCandidates([found('2026-11-07T13:30:00+11:00'), found('2026-11-07T19:00:00+11:00')], [listedMatinee], NOW, 'geelong')
    const evening = plans.find((p) => new Date(p.event.startsAt).getTime() === new Date('2026-11-07T19:00:00+11:00').getTime())
    expect(evening?.kind).toBe('new')
  })

  it('when the page states only 7:00 pm, the listed 1:30 pm has moved: a time change for a person, as before', () => {
    const plans = planCandidates([found('2026-11-07T19:00:00+11:00')], [listedMatinee], NOW, 'geelong')
    expect(plans[0]).toMatchObject({ kind: 'changes_facts', change: 'time_changed', eventId: 'e-sat-matinee' })
  })
})
