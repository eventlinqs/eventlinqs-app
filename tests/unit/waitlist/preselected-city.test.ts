import { describe, expect, it } from 'vitest'
import { cityFromQuery } from '@/lib/waitlist/city-waitlist'

/* A city guide's 'Get <City> alerts by email' opens /waitlist?city=<slug> with that city chosen; anything else, the first. */
describe('the sign up opens with the guide city chosen', () => {
  const cities = [{ slug: 'sydney' }, { slug: 'geelong' }, { slug: 'melbourne' }]
  it('picks the named city', () => {
    expect(cityFromQuery('?city=geelong', cities)?.slug).toBe('geelong')
  })
  it('ignores an unknown or missing city', () => {
    expect(cityFromQuery('?city=victoria', cities)).toBeNull()
    expect(cityFromQuery('', cities)).toBeNull()
  })
})
