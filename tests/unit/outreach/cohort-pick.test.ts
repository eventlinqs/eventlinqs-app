import { describe, expect, it } from 'vitest'
import { CITY_SHARES, COHORT_SIZE, pickCohort, statedCityOf, type Candidate } from '@/lib/outreach/cohort-pick'

// The first cohort (the project manager's ruling 5 of 30 October 2026): "The first 100 come from production's 151
// organisers, ranked by score (Geelong 45%, Melbourne 35%, Ballarat and Bendigo 10% each, as the starting hypothesis).
// Only contacts with a recorded lawful basis enter email; the rest go to inbound, partnership or in-person routes."

const c = (id: string, city: string | null, score: number, email = true): Candidate => ({ id, city, score, writableEmail: email })

describe('the first cohort', () => {
  it('carries the ruling exactly: 100, and the four city shares adding to the whole', () => {
    expect(COHORT_SIZE).toBe(100)
    expect(CITY_SHARES).toEqual({ geelong: 0.45, melbourne: 0.35, ballarat: 0.1, bendigo: 0.1 })
    expect(Object.values(CITY_SHARES).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10)
  })

  it('takes each city its share, highest score first', () => {
    const pool = [c('g1', 'geelong', 50), c('g2', 'geelong', 90), c('g3', 'geelong', 70), c('m1', 'melbourne', 80), c('m2', 'melbourne', 60), c('b1', 'ballarat', 40), c('d1', 'bendigo', 30)]
    const picked = pickCohort(pool, 10)
    // Of 10: 4.5, 3.5, 1 and 1. Rounding each would ask for 11; the largest remainders give the one left over to the
    // first city in the ruling's order, so the quotas add to the size: 5, 3, 1, 1.
    expect(picked.quota).toEqual({ geelong: 5, melbourne: 3, ballarat: 1, bendigo: 1 })
    expect(Object.values(picked.quota).reduce((a, b) => a + b, 0)).toBe(10)
    expect(pickCohort([], 100).quota).toEqual({ geelong: 45, melbourne: 35, ballarat: 10, bendigo: 10 })
    expect(picked.byCity.geelong.map((x) => x.id)).toEqual(['g2', 'g3', 'g1'])
    expect(picked.byCity.melbourne.map((x) => x.id)).toEqual(['m1', 'm2'])
  })

  it('never fills one city\'s gap from another, and says what is short', () => {
    const pool = [c('g1', 'geelong', 50), c('m1', 'melbourne', 80), c('m2', 'melbourne', 70), c('m3', 'melbourne', 60), c('m4', 'melbourne', 50), c('m5', 'melbourne', 40)]
    const picked = pickCohort(pool, 10)
    expect(picked.byCity.melbourne.map((x) => x.id)).toEqual(['m1', 'm2', 'm3'])
    expect(picked.short).toEqual({ geelong: 4, melbourne: 0, ballarat: 1, bendigo: 1 })
    expect(picked.total).toBe(4)
  })

  it('leaves out an organiser outside the four cities, or with no city, and counts them', () => {
    const picked = pickCohort([c('s1', 'sydney', 99), c('n1', null, 98), c('g1', 'geelong', 10)], 100)
    expect(picked.total).toBe(1)
    expect(picked.outside).toBe(2)
  })

  it('routes only a lawful-basis email contact to email; every other pick to inbound, partnership or in person', () => {
    const picked = pickCohort([c('g1', 'geelong', 90, true), c('g2', 'geelong', 80, false)], 100)
    expect(picked.email.map((x) => x.id)).toEqual(['g1'])
    expect(picked.otherRoutes.map((x) => x.id)).toEqual(['g2'])
  })

  it('reads the city the cohort import stated in notes, as a slug, and nothing from "not stated"', () => {
    expect(statedCityOf('Victoria small hosts. Runs: trivia; weekly. City: Geelong.')).toBe('geelong')
    expect(statedCityOf('Listings. Runs: not stated. City: Surf Coast.')).toBe('surf-coast')
    expect(statedCityOf('Listings. Runs: not stated. City: not stated.')).toBe(null)
    expect(statedCityOf(null)).toBe(null)
    expect(statedCityOf('No city sentence here')).toBe(null)
  })

  it('breaks a tie by id, so the cohort never moves between runs', () => {
    const picked = pickCohort([c('g2', 'geelong', 50), c('g1', 'geelong', 50), c('g3', 'geelong', 50)], 4)
    expect(picked.byCity.geelong.map((x) => x.id)).toEqual(['g1', 'g2'])
  })
})
