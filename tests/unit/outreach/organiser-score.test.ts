import { describe, expect, it } from 'vitest'
import { PILOT_CITIES, WEIGHTS, lineOf, rankOrganisers, scoreOrganisers, type Night, type OrganiserFacts } from '@/lib/outreach/organiser-score'

// The organiser score of the growth blueprint (the project manager's ruling 3 of 30 October 2026): six parts with the
// blueprint's weights, each a named constant, the score shown with its parts. A prioritisation rule, not a prediction.

const night = (over: Partial<Night> = {}): Night => ({
  citySlug: 'geelong',
  cta: 'paid_external',
  hasDescription: true,
  hasImage: true,
  hasVenueAddress: true,
  ...over,
})

const facts = (id: string, over: Partial<OrganiserFacts> = {}): OrganiserFacts => ({
  id,
  nights: [night()],
  writableEmail: true,
  positiveSign: false,
  stopped: false,
  ...over,
})

describe('the organiser score', () => {
  it('carries the blueprint weights exactly, adding to 100', () => {
    expect(WEIGHTS).toEqual({ frequency: 25, fit: 20, value: 20, readiness: 15, completeness: 10, partnership: 10 })
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100)
    expect([...PILOT_CITIES]).toEqual(['geelong', 'melbourne', 'ballarat', 'bendigo'])
  })

  it('gives every part its full weight to an organiser that meets each one, and the parts add to the score', () => {
    // Beside two organisers with one night each, the median is 1, so four nights is past twice it and takes the full 25.
    const four = Array.from({ length: 4 }, () => night())
    const [s] = scoreOrganisers([facts('a', { nights: four, positiveSign: true }), facts('y'), facts('z')])
    expect(s.state).toBe('scored')
    if (s.state !== 'scored') return
    expect(s.parts).toEqual(WEIGHTS)
    expect(s.score).toBe(100)
    expect(Object.values(s.parts).reduce((a, b) => a + b, 0)).toBe(s.score)
  })

  it('scores frequency against the median of the organisers with nights ahead: half at it, full at twice it, none at no nights', () => {
    const many = (n: number) => Array.from({ length: n }, () => night())
    const scored = scoreOrganisers([
      facts('none1', { nights: [] }),
      facts('none2', { nights: [] }),
      facts('none3', { nights: [] }),
      facts('two', { nights: many(2) }),
      facts('four', { nights: many(4) }),
      facts('eight', { nights: many(8) }),
    ])
    const freq = Object.fromEntries(scored.map((s) => [s.id, s.state === 'scored' ? s.parts.frequency : null]))
    // The organisers with no nights do not drag the median to none: the median of 2, 4 and 8 is 4. Were they counted,
    // the median would be 1 and two nights would already take the full 25, so 2 and 8 nights could not be told apart.
    expect(freq.none1).toBe(0)
    expect(freq.two).toBe(Math.round((25 * 2) / 8))
    expect(freq.four).toBe(Math.round((25 * 4) / 8))
    expect(freq.eight).toBe(25)
    const [s] = scored.filter((x) => x.id === 'two')
    if (s.state === 'scored') expect(s.why.frequency).toBe("2 nights in the next 90 days (the median of organisers with nights ahead: 4)")
  })

  it('reads fit and value as the share of the nights in the pilot cities and with a counted destination', () => {
    const [s] = scoreOrganisers([
      facts('a', {
        nights: [night(), night({ citySlug: 'sydney', cta: 'free_open' }), night({ citySlug: 'melbourne', cta: 'paid_native' }), night({ citySlug: null, cta: 'unknown_price' })],
      }),
    ])
    if (s.state !== 'scored') throw new Error('not scored')
    expect(s.parts.fit).toBe(10)
    expect(s.parts.value).toBe(10)
  })

  it('counts native tickets, outside tickets and registration as a destination; walk-in and an unknown price not', () => {
    const one = (cta: Night['cta']) => {
      const [s] = scoreOrganisers([facts('a', { nights: [night({ cta })] })])
      return s.state === 'scored' ? s.parts.value : null
    }
    expect(one('paid_native')).toBe(20)
    expect(one('paid_external')).toBe(20)
    expect(one('free_registration')).toBe(20)
    expect(one('free_open')).toBe(0)
    expect(one('unknown_price')).toBe(0)
  })

  it('gives readiness only for an email address that may be written to, and partnership only for a positive sign', () => {
    const [cold] = scoreOrganisers([facts('a', { writableEmail: false, positiveSign: false })])
    if (cold.state !== 'scored') throw new Error('not scored')
    expect(cold.parts.readiness).toBe(0)
    expect(cold.parts.partnership).toBe(0)
  })

  it('reads completeness from each night: a line about it, a picture, the venue address and a known admission', () => {
    const [s] = scoreOrganisers([facts('a', { nights: [night({ hasDescription: false, hasImage: false }), night({ cta: 'unknown_price', hasVenueAddress: false })] })])
    if (s.state !== 'scored') throw new Error('not scored')
    // 4 of the 8 checks across the two nights hold.
    expect(s.parts.completeness).toBe(5)
  })

  it('gives an organiser with no nights ahead nothing for frequency, fit, value or completeness', () => {
    const [s] = scoreOrganisers([facts('a', { nights: [] })])
    if (s.state !== 'scored') throw new Error('not scored')
    expect(s.parts).toEqual({ frequency: 0, fit: 0, value: 0, readiness: 15, completeness: 0, partnership: 0 })
  })

  it('never scores or ranks an organiser who said no or stop, and says so', () => {
    const scored = scoreOrganisers([facts('stop', { stopped: true, positiveSign: true }), facts('b')])
    expect(scored[0]).toEqual({ id: 'stop', state: 'stopped' })
    expect(rankOrganisers(scored).map((s) => s.id)).toEqual(['b'])
  })

  it('ranks the highest score first and breaks a tie by id, so the order never moves between runs', () => {
    const scored = scoreOrganisers([facts('c', { writableEmail: false }), facts('b'), facts('a')])
    expect(rankOrganisers(scored).map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('explains every part in words, so the score is shown with its reasons', () => {
    const [s] = scoreOrganisers([facts('a')])
    if (s.state !== 'scored') throw new Error('not scored')
    expect(Object.keys(s.why).sort()).toEqual(Object.keys(WEIGHTS).sort())
    expect(s.why.frequency).toMatch(/1 night in the next 90 days/)
  })

  it('takes a listing\'s summary as the line about the night, as its description', () => {
    expect(lineOf({ description: null, summary: 'Comedy every Tuesday.' })).toBe(true)
    expect(lineOf({ description: 'A night of jazz.', summary: null })).toBe(true)
    expect(lineOf({ description: '  ', summary: '' })).toBe(false)
    expect(lineOf({ description: null, summary: null })).toBe(false)
  })
})
