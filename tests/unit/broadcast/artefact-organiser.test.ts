import { describe, expect, it } from 'vitest'
import { artefactOrganiser } from '@/lib/broadcast/artefact-organiser'

/**
 * WI2 ruling A (23 October 2026): the listings organisation is never shown. An
 * EventLinqs listing's cover and share cards name its host. The names below are
 * invented for the test.
 */
const org = { name: 'EventLinqs listings', logo_url: 'https://example.com/logo.png' }

describe('artefactOrganiser', () => {
  it("an organiser's own event names the organisation, with its logo", () => {
    expect(artefactOrganiser({ listing_source: 'organiser', venue_name: 'The Corner Hall', organisation: { name: 'Harbour Lights', logo_url: 'https://example.com/h.png' } }, 'EventLinqs')).toEqual({
      name: 'Harbour Lights',
      logoUrl: 'https://example.com/h.png',
    })
  })

  it('an EventLinqs listing names its host and carries no logo', () => {
    expect(artefactOrganiser({ listing_source: 'eventlinqs', venue_name: 'The Corner Hall', organisation: org }, 'EventLinqs')).toEqual({
      name: 'The Corner Hall',
      logoUrl: null,
    })
  })

  it('never falls back to the listings organisation, even with no host name', () => {
    const named = artefactOrganiser({ listing_source: 'eventlinqs', venue_name: '  ', organisation: org }, 'EventLinqs')
    expect(named.name).toBe('EventLinqs')
    expect(named.name).not.toBe(org.name)
  })

  it('a row read before listing_source existed is an organiser event, as before', () => {
    expect(artefactOrganiser({ venue_name: null, organisation: { name: 'Harbour Lights', logo_url: null } }, 'EventLinqs').name).toBe('Harbour Lights')
  })
})
