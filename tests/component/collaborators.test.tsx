import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { askableVenue } from '@/lib/events/collaborators'
import { CollaboratorsLine } from '@/components/events/collaborators-line'

/*
 * Collaborators, item 15 of the locked plan of 27 October 2026: a venue joins an
 * event another organisation runs, shows on its page and gets links of its own
 * (docs/walk-in/COLLABORATORS-DECISION.md). The database's own rules are proved
 * on TEST by scripts/verify/collaborators-proof.sql; these are the page's.
 */

const venue = { id: 'v1', organisation_id: 'org-venue', name: "Beav's Bar", listing_source: 'organiser', claimed_at: null }

describe('askableVenue', () => {
  it("offers the ask when the event's venue is another organisation's own", () => {
    expect(askableVenue('org-promoter', venue)).toEqual({ venueId: 'v1', organisationId: 'org-venue', name: "Beav's Bar" })
  })

  it("never offers it on the organiser's own venue", () => {
    expect(askableVenue('org-venue', venue)).toBeNull()
  })

  it('waits for a listed venue to be claimed by its own people', () => {
    expect(askableVenue('org-promoter', { ...venue, listing_source: 'eventlinqs', claimed_at: null })).toBeNull()
    expect(askableVenue('org-promoter', { ...venue, listing_source: 'eventlinqs', claimed_at: '2026-10-27T03:00:00Z' })?.venueId).toBe('v1')
  })

  it('offers nothing for an event with no venue', () => {
    expect(askableVenue('org-promoter', null)).toBeNull()
  })
})

describe('CollaboratorsLine', () => {
  it('names each venue that joined, linked to its own page', () => {
    const { container } = render(
      <CollaboratorsLine
        collaborators={[
          { id: 'c1', name: "Beav's Bar", venuePath: '/venues/beavs-bar' },
          { id: 'c2', name: 'The Wool Exchange', venuePath: '/venues/the-wool-exchange' },
        ]}
      />,
    )
    expect(container.textContent).toBe("With Beav's Bar and The Wool Exchange")
    expect(Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['/venues/beavs-bar', '/venues/the-wool-exchange'])
  })

  it('draws nothing when no venue has joined', () => {
    const { container } = render(<CollaboratorsLine collaborators={[]} />)
    expect(container.querySelector('[data-collaborators]')).toBeNull()
  })
})
