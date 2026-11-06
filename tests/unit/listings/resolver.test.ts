import { describe, expect, it } from 'vitest'
import { resolveFact, type Reading } from '@/lib/listings/resolver'

/*
 * THE RESOLVER'S RULING (Lawal, 06:21 on 7 November 2026, through the CONTROLLER: 'Any mismatch is not hidden. Any mismatch,
 * you go and verify which is the proper and the best event ... check other sources ... Unless your verification still brings
 * conflict or discrepancies, then you can have it hidden.'). A mismatch or an unreadable source starts a resolver, not a
 * hide: it reads the event's other authoritative pages (the organiser's own, the ticket seller's, the venue's, then the
 * council or tourism listing). Two independent pages (two sites) agreeing on a fact decide it; only a conflict, or nothing
 * readable, is quarantined, with its reason. A test per path, as the CONTROLLER's 06:21 orders.
 */
const r = (kind: Reading['kind'], url: string, value: string | null): Reading => ({ kind, url, value })
const OWN = 'https://www.geelongcity.vic.gov.au/whats-happening/events/boost-mobile-ausx-open'

describe('the resolver', () => {
  it('agree and correct: two sites agree on another value, so the listing takes it, both recorded', () => {
    const out = resolveFact({
      stored: '2026-11-07T02:00:00.000Z',
      ownUrl: OWN,
      readings: [
        r('listing', OWN, '2026-11-07T02:00:00.000Z'),
        r('organiser', 'https://ausxsupercross.com.au/events/ausx-open/schedule/', '2026-11-07T07:00:00.000Z'),
        r('seller', 'https://www.ticketmaster.com.au/boost-mobile-ausx-open/event/250064D1860C1717', '2026-11-07T07:00:00.000Z'),
      ],
    })
    expect(out.kind).toBe('correct')
    if (out.kind !== 'correct') return
    expect(out.value).toBe('2026-11-07T07:00:00.000Z')
    expect(out.agreeing.map((a) => a.kind)).toEqual(['organiser', 'seller'])
  })

  it('keep: two sites agree with the stored value, which stands', () => {
    const out = resolveFact({
      stored: '3300',
      ownUrl: OWN,
      readings: [r('listing', OWN, '2900'), r('organiser', 'https://org.example.com/e', '3300'), r('seller', 'https://tix.example.com/e', '3300')],
    })
    expect(out).toMatchObject({ kind: 'keep', value: '3300' })
  })

  it('re-source: the listing\'s own page cannot be read, two others agree, so it is re-sourced to the most authoritative of them', () => {
    const out = resolveFact({
      stored: 'on_sale',
      ownUrl: 'https://visitballarat.com.au/events/x',
      readings: [
        r('listing', 'https://visitballarat.com.au/events/x', null),
        r('venue', 'https://www.hermaj.com/whats-on/x', 'sold_out'),
        r('organiser', 'https://org.example.com/x', 'sold_out'),
      ],
    })
    expect(out.kind).toBe('resource')
    if (out.kind !== 'resource') return
    expect(out.value).toBe('sold_out')
    expect(out.corrected).toBe(true)
    expect(out.to.kind).toBe('organiser')
  })

  it('conflict and quarantine: the readable sites still disagree', () => {
    const out = resolveFact({
      stored: '2026-11-07T02:00:00.000Z',
      ownUrl: OWN,
      readings: [r('listing', OWN, '2026-11-07T02:00:00.000Z'), r('organiser', 'https://ausxsupercross.com.au/e', '2026-11-07T07:00:00.000Z')],
    })
    expect(out).toMatchObject({ kind: 'quarantine', reason: 'sources_disagree' })
  })

  it('none readable and quarantine: no authoritative page can be read', () => {
    const out = resolveFact({ stored: '3300', ownUrl: OWN, readings: [r('listing', OWN, null), r('seller', 'https://tix.example.com/e', null)] })
    expect(out).toMatchObject({ kind: 'quarantine', reason: 'unverifiable' })
  })

  it('one site alone never decides, even when it states a value', () => {
    const out = resolveFact({ stored: '3300', ownUrl: OWN, readings: [r('listing', OWN, null), r('organiser', 'https://org.example.com/e', '2900')] })
    expect(out).toMatchObject({ kind: 'quarantine', reason: 'single_source' })
  })

  it('two pages of ONE site are one source, never two that agree', () => {
    const out = resolveFact({
      stored: '3300',
      ownUrl: OWN,
      readings: [r('listing', OWN, null), r('seller', 'https://tix.example.com/a', '2900'), r('seller', 'https://www.tix.example.com/b', '2900')],
    })
    expect(out).toMatchObject({ kind: 'quarantine', reason: 'single_source' })
  })

  it('two values each agreed by two sites is a conflict, never a guess', () => {
    const out = resolveFact({
      stored: '1',
      ownUrl: OWN,
      readings: [r('organiser', 'https://a.example.com', '2'), r('seller', 'https://b.example.com', '2'), r('venue', 'https://c.example.com', '3'), r('listing', 'https://d.example.com', '3')],
    })
    expect(out).toMatchObject({ kind: 'quarantine', reason: 'sources_disagree' })
  })
})
