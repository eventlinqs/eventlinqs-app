import { describe, it, expect } from 'vitest'
import { searchCities, searchCommunities } from '@/lib/events/search-scopes'
import { getAllCities } from '@/lib/cities/data'
import { getAllCommunities } from '@/lib/communities/data'

/**
 * The header search offers four tabs and routes three of them to /events.
 * /events answered every one of them with EVENTS, so searching "Melbourne"
 * under Cities returned event titles containing Melbourne and no cities at all.
 * Three of the four tabs asked a question the page never answered.
 *
 * Organiser search is a database query and is proven end to end in
 * scripts/verify/search-reach-e2e.mjs. Cities and communities are locked
 * editorial data, so they are asserted directly here.
 */
describe('header-search scopes', () => {
  describe('cities', () => {
    it('finds a city by name', () => {
      expect(searchCities('melbourne').map((r) => r.slug)).toContain('melbourne')
    })

    it('finds a multi-word city typed with a space, which the slug does not contain', () => {
      expect(searchCities('gold coast').map((r) => r.slug)).toContain('gold-coast')
      expect(searchCities('Gold Coast').map((r) => r.slug)).toContain('gold-coast')
    })

    it('finds cities by state, so "VIC" is a useful search', () => {
      const vic = searchCities('VIC').map((r) => r.slug)
      expect(vic).toContain('melbourne')
      expect(vic).toContain('geelong')
    })

    it('returns nothing for a query that matches nothing, rather than everything', () => {
      expect(searchCities('zzzznothing')).toEqual([])
      expect(searchCities('')).toEqual([])
    })

    it('gives every result a working landing route and a non-empty line of context', () => {
      for (const city of getAllCities()) {
        const [result] = searchCities(city.name)
        expect(result, city.name).toBeDefined()
        expect(result.href).toBe(`/city/${result.slug}`)
        expect(result.meta.trim().length).toBeGreaterThan(0)
      }
    })
  })

  describe('communities', () => {
    it('finds a community by display name', () => {
      expect(searchCommunities('african').map((r) => r.slug)).toContain('african')
    })

    it('is punctuation insensitive, so the hyphenated slug is reachable by words', () => {
      expect(searchCommunities('latin american').map((r) => r.slug)).toContain('latin-american')
    })

    it('returns nothing for a query that matches nothing', () => {
      expect(searchCommunities('zzzznothing')).toEqual([])
    })

    it('gives every community a working landing route and a non-empty line of context', () => {
      for (const community of getAllCommunities()) {
        const match = searchCommunities(community.displayName).find((r) => r.slug === community.slug)
        expect(match, community.displayName).toBeDefined()
        expect(match?.href).toBe(`/community/${community.slug}`)
        expect(match?.meta.trim().length).toBeGreaterThan(0)
      }
    })
  })
})
