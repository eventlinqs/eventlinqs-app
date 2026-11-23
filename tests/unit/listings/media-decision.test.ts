import { describe, expect, it } from 'vitest'
import { DECLARATION_VERSION, grantWording, mediaDecision } from '@/lib/listings/photo-permission-math'

/*
 * LAW 32, THE ORGANISER MEDIA POLICY (the PM's 13:30 of 19 November 2026, on Lawal's 13:20). One decision for every image
 * an organiser gives, whatever it shows. The case that set it: AMCF's 2196bf73, a mother, a father and two young children
 * playing djembes at the festival's workshop, held for its children although AMCF's chair had granted it for the
 * listing and organic social; Lawal: children in an organiser's photograph are not, by themselves, a reason to hold it.
 */
describe('a family photograph is decided by its grant, never by who is in it', () => {
  it('with a grant that covers the placement it is approved', () => {
    expect(mediaDecision({ grant: { uses: 'both' }, placement: 'site' })).toEqual({ state: 'approved' })
    expect(mediaDecision({ grant: { uses: 'both' }, placement: 'social' })).toEqual({ state: 'approved' })
  })
  it('with no grant it is held, reason no authorisation', () => {
    expect(mediaDecision({ grant: null, placement: 'site' })).toEqual({ state: 'held', reason: 'no_authorisation' })
  })
  it('outside the granted scope it is held, reason outside scope, so one confirmation is asked', () => {
    expect(mediaDecision({ grant: { uses: 'site' }, placement: 'social' })).toEqual({ state: 'held', reason: 'outside_scope' })
  })
  it('only a concrete concern holds a granted image, each with its own reason', () => {
    expect(mediaDecision({ grant: { uses: 'both' }, placement: 'site', concerns: ['sensitive'] })).toEqual({ state: 'held', reason: 'sensitive' })
    expect(mediaDecision({ grant: { uses: 'both' }, placement: 'site', concerns: ['objection'] })).toEqual({ state: 'held', reason: 'objection' })
  })
})

describe('the declaration carries the consent of anyone identifiable, dated', () => {
  it('in the words the organiser gives on their photo page', () => {
    const words = grantWording({ givenBy: 'Fred Alale', organiserName: 'AMCF', nightTitle: 'African Music and Cultural Festival 2026', count: 1 })
    expect(words).toContain('anyone identifiable in it has agreed')
    expect(words).toContain(`(declaration of ${DECLARATION_VERSION})`)
  })
})
