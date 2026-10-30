// Lawal's venue photo queue (the project manager's 16:52 of 30 October 2026, G: one tap a venue, the best photo
// pre-picked). Pinned over a fake read: the waiting photographs come back grouped by venue, venues by name; within a
// venue the venue's own photograph leads (it came with their yes), then the highest quality, then the widest; a review
// match says so; and staff refuse with a reason or match a candidate by hand through their one database function.

import { describe, expect, test } from 'vitest'
import { bestFirst, groupWaiting, unmatchedCandidateCount, waitingVenuePhotos, type QueueRow } from '@/lib/venues/venue-photo-queue'
import { linkVenuePhoto, refuseVenuePhoto } from '@/lib/venues/venue-images'

const row = (over: Partial<QueueRow>): QueueRow => ({
  id: 'i1',
  venue_id: 'v1',
  venue_name: 'Costa Hall',
  venue_city: 'Geelong',
  image_url: 'https://x/a.jpg',
  source: 'wikimedia_commons',
  source_url: 'https://commons.wikimedia.org/wiki/File:A.jpg',
  licence: 'cc_by_sa',
  attribution_text: 'Photo: A Person, CC BY-SA 4.0',
  quality_score: 60,
  width: 2000,
  height: 1300,
  match_method: 'auto',
  match_distance_m: '42.5',
  permission_evidence: null,
  challenge_reason: null,
  ...over,
})

describe('the queue', () => {
  test('a challenged photograph leads its venue and carries what was said, so a person answers it', () => {
    const venues = groupWaiting([
      row({ id: 'own', source: 'venue', licence: 'owner_permission', quality_score: 95 }),
      row({ id: 'said', quality_score: 40, challenge_reason: 'This is the hall next door.' }),
    ])
    expect(venues[0].photos.map((p) => p.id)).toEqual(['said', 'own'])
    expect(venues[0].photos[0].challengeReason).toBe('This is the hall next door.')
    expect(venues[0].photos[1].challengeReason).toBeNull()
  })

  test('groups by venue, venues by name, and pre-picks the best of each first', () => {
    const venues = groupWaiting([
      row({ id: 'c-low', quality_score: 55 }),
      row({ id: 'c-high', quality_score: 90 }),
      row({ id: 'own', source: 'venue', licence: 'owner_permission', quality_score: null, permission_evidence: 'Yes, please use our photos.' }),
      row({ id: 'b1', venue_id: 'v2', venue_name: 'Bendigo Bank Theatre', venue_city: 'Bendigo' }),
    ])
    expect(venues.map((v) => v.venueName)).toEqual(['Bendigo Bank Theatre', 'Costa Hall'])
    expect(venues[1].photos.map((p) => p.id)).toEqual(['own', 'c-high', 'c-low'])
    expect(venues[1].photos[1].matchDistanceM).toBe(42.5)
  })

  test('at equal quality, the wider photograph leads', () => {
    const narrow = groupWaiting([row({ id: 'n', width: 1300 })])[0].photos[0]
    const wide = groupWaiting([row({ id: 'w', width: 3000 })])[0].photos[0]
    expect([narrow, wide].sort(bestFirst).map((p) => p.id)).toEqual(['w', 'n'])
  })

  test('is read through venue_photo_queue, and the unmatched candidates through their count', async () => {
    const calls: string[] = []
    const deps = {
      rpc: async (name: string) => {
        calls.push(name)
        return name === 'venue_photo_queue' ? { data: [row({ match_method: 'review' })], error: null } : { data: 7, error: null }
      },
    }
    const venues = await waitingVenuePhotos(deps)
    expect(venues[0].photos[0].matchMethod).toBe('review')
    expect(await unmatchedCandidateCount(deps)).toBe(7)
    expect(calls).toEqual(['venue_photo_queue', 'venue_photo_unmatched_count'])
  })

  test('a read that fails is thrown, never shown as an empty queue', async () => {
    const deps = { rpc: async () => ({ data: null, error: { code: '42501', message: 'permission denied' } }) }
    await expect(waitingVenuePhotos(deps)).rejects.toThrow('permission denied')
  })
})

describe('staff refuse or match a photograph by its one database function', () => {
  test('a refusal carries its reason; the database\'s refusal comes back in its words', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = []
    const ok = { rpc: async (name: string, args: Record<string, unknown>) => (calls.push({ name, args }), { data: null, error: null }) }
    expect(await refuseVenuePhoto({ adminId: 'a1', imageId: 'i1', reason: ' Blurred. ' }, ok)).toEqual({ state: 'done', id: 'i1' })
    expect(calls[0]).toEqual({ name: 'venue_image_refuse', args: { p_admin: 'a1', p_image: 'i1', p_reason: 'Blurred.' } })
    const no = { rpc: async () => ({ data: null, error: { code: '23514', message: 'refused: say why it is refused' } }) }
    expect(await refuseVenuePhoto({ adminId: 'a1', imageId: 'i1', reason: '' }, no)).toEqual({ state: 'refused', reason: 'Say why it is refused' })
  })

  test('a candidate is matched to a venue by hand', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = []
    const deps = { rpc: async (name: string, args: Record<string, unknown>) => (calls.push({ name, args }), { data: null, error: null }) }
    expect(await linkVenuePhoto({ adminId: 'a1', imageId: 'i9', venueId: 'v3' }, deps)).toEqual({ state: 'done', id: 'i9' })
    expect(calls[0]).toEqual({ name: 'venue_image_link', args: { p_admin: 'a1', p_image: 'i9', p_venue: 'v3' } })
  })
})
