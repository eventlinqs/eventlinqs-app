// Stage 3 artist core proof: slug generation stays URL-safe and unique
// enough, mirroring the event slug pattern exactly.

import { describe, expect, test, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('admin client must not be constructed in pure tests')
  },
}))

import { generateArtistSlug } from '@/lib/broadcast/artists'

describe('generateArtistSlug', () => {
  test('lowercases, hyphenates, and suffixes', () => {
    const slug = generateArtistSlug('DJ Sienna & The Night Owls')
    expect(slug).toMatch(/^dj-sienna-the-night-owls-[a-z0-9]{6}$/)
  })

  test('handles names that strip to nothing', () => {
    const slug = generateArtistSlug('!!!')
    expect(slug).toMatch(/^[a-z0-9]{6}$/)
  })

  test('two calls for the same name differ (suffix entropy)', () => {
    expect(generateArtistSlug('Same Name')).not.toBe(generateArtistSlug('Same Name'))
  })
})
