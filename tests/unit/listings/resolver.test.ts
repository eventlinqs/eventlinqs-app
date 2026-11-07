import { describe, expect, it } from 'vitest'
import { holdScope, isListingSite, resolveFact, type Reading } from '@/lib/listings/resolver'

/*
 * THE RESOLVER'S RULING (Lawal, 06:21 on 7 November 2026; the CONTROLLER's 10:50). (1) THE EVENT'S OWN OFFICIAL PAGE IS THE
 * AUTHORITY: the organiser's or the venue's page, or the ticket seller it links to; a single official source is NOT a
 * conflict, and where ours differs the resolver corrects ours to the page's own words. A council or tourism listing is not
 * official. (2) HOLD ONLY WHAT STAYS IN DOUBT: official pages that disagree, or no official page readable; a price or a status
 * is held as a FACT (the night stays), a start, venue or session holds the NIGHT. A test per path.
 */
const r = (kind: Reading['kind'], url: string, value: string | null): Reading => ({ kind, url, value })
const COUNCIL = 'https://www.geelongcity.vic.gov.au/whats-happening/events/boost-mobile-ausx-open'
const GAC = 'https://www.geelongartscentre.org.au/whats-on/cosi'

describe('one official page is the authority', () => {
  it('corrects ours to the official page, alone, no second site needed', () => {
    const out = resolveFact({ field: 'status', stored: 'on_sale', ownUrl: GAC, readings: [r('venue', GAC, 'sold_out')] })
    expect(out).toMatchObject({ kind: 'correct', value: 'sold_out' })
  })
  it('keeps ours when the official page states it', () => {
    expect(resolveFact({ field: 'price', stored: '2200', ownUrl: GAC, readings: [r('venue', GAC, '2200')] })).toMatchObject({ kind: 'keep', value: '2200' })
  })
  it('re-sources a listing read from a council page to the official page it agrees with or corrects to', () => {
    const out = resolveFact({
      field: 'start',
      stored: '2026-11-07T02:00:00.000Z',
      ownUrl: COUNCIL,
      readings: [r('listing', COUNCIL, '2026-11-07T02:00:00.000Z'), r('organiser', 'https://ausxsupercross.com.au/events/ausx-open/schedule/', '2026-11-07T07:00:00.000Z')],
    })
    expect(out.kind).toBe('resource')
    if (out.kind !== 'resource') return
    expect(out.value).toBe('2026-11-07T07:00:00.000Z')
    expect(out.corrected).toBe(true)
    expect(out.to.kind).toBe('organiser')
  })
  it('the organiser and its linked seller agreeing correct together', () => {
    const out = resolveFact({
      field: 'price',
      stored: '2900',
      ownUrl: GAC,
      readings: [r('venue', GAC, null), r('seller', 'https://tix.example.com/cosi', '3300'), r('organiser', 'https://grtc.example.com/cosi', '3300')],
    })
    expect(out).toMatchObject({ kind: 'resource', value: '3300' })
  })
})

describe('hold only what stays in doubt', () => {
  it('official pages that disagree hold it', () => {
    const out = resolveFact({ field: 'price', stored: '2900', ownUrl: GAC, readings: [r('venue', GAC, '3300'), r('seller', 'https://tix.example.com/cosi', '3500')] })
    expect(out).toMatchObject({ kind: 'hold', reason: 'officials_disagree', scope: 'fact' })
  })
  it('no official page readable holds it', () => {
    const out = resolveFact({ field: 'start', stored: '2026-11-07T02:00:00.000Z', ownUrl: GAC, readings: [r('venue', GAC, null)] })
    expect(out).toMatchObject({ kind: 'hold', reason: 'no_official_page', scope: 'night' })
  })
  it('a council or tourism listing alone, however sure, never decides', () => {
    const out = resolveFact({ field: 'start', stored: 'x', ownUrl: COUNCIL, readings: [r('listing', COUNCIL, 'y'), r('listing', 'https://visitballarat.com.au/e', 'y')] })
    expect(out).toMatchObject({ kind: 'hold', reason: 'no_official_page' })
  })
  it('two pages of one official site are one voice', () => {
    const out = resolveFact({ field: 'price', stored: '1', ownUrl: GAC, readings: [r('venue', GAC, '2'), r('venue', 'https://geelongartscentre.org.au/other', '3')] })
    expect(out).toMatchObject({ kind: 'correct', value: '2' })
  })
  it('a price or a status is held as a fact; a start, venue or session holds the night', () => {
    expect(holdScope('price')).toBe('fact')
    expect(holdScope('status')).toBe('fact')
    expect(holdScope('start')).toBe('night')
    expect(holdScope('venue')).toBe('night')
    expect(holdScope('session')).toBe('night')
  })
})

describe('what is a council or tourism listing', () => {
  it('government and visitor sites are listings, a venue or a seller is not', () => {
    expect(isListingSite('https://www.geelongcity.vic.gov.au/x')).toBe(true)
    expect(isListingSite('https://visitballarat.com.au/events/x')).toBe(true)
    expect(isListingSite('https://whatson.melbourne.vic.gov.au/x')).toBe(true)
    expect(isListingSite('https://www.geelongartscentre.org.au/x')).toBe(false)
    expect(isListingSite('https://premier.ticketek.com.au/x')).toBe(false)
  })
})
