// The venue's own photographs (the project manager's 16:42 of 30 October 2026, venue-first real photography). Pinned
// over fake reads and writes: a photograph is stored under the venue's folder and then registered by the database as
// the venue's, pending; the database's refusal comes back in its own words and the stored file is removed; nothing is
// stored without a real image; a replacement, a challenge and a withdrawal each go to their one database function;
// staff approve once with a whole quality score; and the public read gives the photograph with its credit, or null.

import { describe, expect, test } from 'vitest'
import {
  addVenuePhoto,
  approveVenuePhoto,
  challengeVenuePhoto,
  replaceVenuePhoto,
  venuePhotoFor,
  venuePhotosFor,
  withdrawVenuePhoto,
  type VenueMediaDeps,
} from '@/lib/venues/venue-images'

type Call = { name: string; args: Record<string, unknown> }

function fake(answer: (call: Call) => { data: unknown; error: { code: string; message: string } | null }) {
  const calls: Call[] = []
  const stored: string[] = []
  const removed: string[] = []
  const d: VenueMediaDeps = {
    process: async (bytes) => {
      if (bytes.byteLength === 3) throw new Error('not an image')
      return { buffer: Buffer.from('webp'), extension: 'webp', contentType: 'image/webp' }
    },
    store: async (path) => {
      stored.push(path)
      return `https://test.supabase.co/storage/v1/object/public/organiser-media/${path}`
    },
    remove: async (paths) => {
      removed.push(...paths)
    },
    rpc: async (name, args) => {
      const call = { name, args }
      calls.push(call)
      return answer(call)
    },
  }
  return { d, calls, stored, removed }
}

const PHOTO = new File([new Uint8Array(2048)], 'room.jpg', { type: 'image/jpeg' })
const YES = 'Yes, please use these photos of our venue on EventLinqs.'
const SOURCE = 'https://www.eventlinqs.com.au/venues/costa-hall'

describe('the venue adds a photograph', () => {
  test('stored under its folder, then registered by the database as the venue\'s, pending approval', async () => {
    const { d, calls, stored } = fake(() => ({ data: 'img-1', error: null }))
    const done = await addVenuePhoto({ userId: 'u1', venueId: 'v1', file: PHOTO, permissionWords: `  ${YES}  `, sourceUrl: SOURCE, credit: ' Photo: Costa Hall ' }, d)
    expect(done).toEqual({ state: 'done', id: 'img-1' })
    expect(stored[0]).toMatch(/^venues\/v1\/[0-9a-f-]{36}\.webp$/)
    expect(calls).toEqual([
      {
        name: 'venue_image_add',
        args: {
          p_user: 'u1',
          p_venue: 'v1',
          p_image_url: `https://test.supabase.co/storage/v1/object/public/organiser-media/${stored[0]}`,
          p_source_url: SOURCE,
          p_permission_words: YES,
          p_attribution: 'Photo: Costa Hall',
          p_uses: null,
        },
      },
    ])
  })

  test('refused by the database takes its words, and the stored file is removed', async () => {
    const { d, stored, removed } = fake(() => ({ data: null, error: { code: '23514', message: 'refused: only the people of a claimed venue may add its photographs' } }))
    const done = await addVenuePhoto({ userId: 'u2', venueId: 'v1', file: PHOTO, permissionWords: YES, sourceUrl: SOURCE, credit: null }, d)
    expect(done).toEqual({ state: 'refused', reason: 'Only the people of a claimed venue may add its photographs' })
    expect(removed).toEqual(stored)
  })

  test('nothing is stored or registered without a real image', async () => {
    const { d, calls, stored } = fake(() => ({ data: 'x', error: null }))
    expect(await addVenuePhoto({ userId: 'u1', venueId: 'v1', file: null, permissionWords: YES, sourceUrl: SOURCE, credit: null }, d)).toEqual({
      state: 'refused',
      reason: 'Choose a photograph of your venue to add.',
    })
    const notImage = new File([new Uint8Array(3)], 'x.jpg', { type: 'image/jpeg' })
    expect(await addVenuePhoto({ userId: 'u1', venueId: 'v1', file: notImage, permissionWords: YES, sourceUrl: SOURCE, credit: null }, d)).toEqual({
      state: 'refused',
      reason: 'That photograph could not be read. Try a JPEG or PNG.',
    })
    expect(stored).toEqual([])
    expect(calls).toEqual([])
  })

  test('any fault that is not a refusal is thrown, and the stored file is still removed', async () => {
    const { d, stored, removed } = fake(() => ({ data: null, error: { code: '42501', message: 'permission denied' } }))
    await expect(addVenuePhoto({ userId: 'u1', venueId: 'v1', file: PHOTO, permissionWords: YES, sourceUrl: SOURCE, credit: null }, d)).rejects.toThrow('permission denied')
    expect(removed).toEqual(stored)
  })
})

describe('replace, challenge, withdraw and approve each go to their one database function', () => {
  test('a replacement is a new stored photograph the database links to the one it replaces', async () => {
    const { d, calls, stored } = fake(() => ({ data: 'img-2', error: null }))
    expect(await replaceVenuePhoto({ userId: 'u1', venueId: 'v1', imageId: 'img-1', file: PHOTO, permissionWords: YES, sourceUrl: SOURCE }, d)).toEqual({ state: 'done', id: 'img-2' })
    expect(calls[0]).toEqual({
      name: 'venue_image_replace',
      args: { p_user: 'u1', p_image: 'img-1', p_image_url: `https://test.supabase.co/storage/v1/object/public/organiser-media/${stored[0]}`, p_source_url: SOURCE, p_permission_words: YES },
    })
  })

  test('a challenge carries its reason; a refusal comes back in the database\'s words', async () => {
    const ok = fake(() => ({ data: null, error: null }))
    expect(await challengeVenuePhoto({ userId: 'u3', imageId: 'img-1', reason: ' Not our venue. ' }, ok.d)).toEqual({ state: 'done', id: 'img-1' })
    expect(ok.calls[0]).toEqual({ name: 'venue_image_challenge', args: { p_user: 'u3', p_image: 'img-1', p_reason: 'Not our venue.' } })
    const no = fake(() => ({ data: null, error: { code: '23514', message: 'refused: only the venue, or an organiser with nights there, may challenge its photographs' } }))
    expect(await challengeVenuePhoto({ userId: 'u9', imageId: 'img-1', reason: 'Wrong.' }, no.d)).toEqual({
      state: 'refused',
      reason: 'Only the venue, or an organiser with nights there, may challenge its photographs',
    })
  })

  test('a withdrawal names the photograph and the person', async () => {
    const { d, calls } = fake(() => ({ data: null, error: null }))
    expect(await withdrawVenuePhoto({ userId: 'u1', imageId: 'img-1' }, d)).toEqual({ state: 'done', id: 'img-1' })
    expect(calls[0]).toEqual({ name: 'venue_image_withdraw', args: { p_user: 'u1', p_image: 'img-1' } })
  })

  test('staff approve once with a whole quality score from 0 to 100, primary on request', async () => {
    const { d, calls } = fake(() => ({ data: null, error: null }))
    expect(await approveVenuePhoto({ adminId: 'a1', imageId: 'img-1', quality: 85, primary: true }, d)).toEqual({ state: 'done', id: 'img-1' })
    expect(calls[0]).toEqual({ name: 'venue_image_approve', args: { p_admin: 'a1', p_image: 'img-1', p_quality: 85, p_primary: true } })
    for (const quality of [-1, 101, 7.5, Number.NaN]) {
      expect(await approveVenuePhoto({ adminId: 'a1', imageId: 'img-1', quality, primary: false }, d)).toEqual({
        state: 'refused',
        reason: 'Give the photograph a quality score from 0 to 100.',
      })
    }
    expect(calls).toHaveLength(1)
  })
})

describe('the public read, the chain\'s second link', () => {
  test('gives the one photograph for the use with its credit', async () => {
    const { d, calls } = fake(() => ({
      data: [{ venue_id: 'v1', image_url: 'https://x/room.webp', attribution_text: 'Photo: Jane Citizen, CC BY-SA 4.0', licence: 'cc_by_sa', licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'Jane Citizen', source_url: 'https://commons.wikimedia.org/wiki/File:Room.jpg' }],
      error: null,
    }))
    expect(await venuePhotoFor('v1', 'event_card', d)).toEqual({
      imageUrl: 'https://x/room.webp',
      credit: 'Photo: Jane Citizen, CC BY-SA 4.0',
      licence: 'cc_by_sa',
      licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      author: 'Jane Citizen',
      fileUrl: 'https://commons.wikimedia.org/wiki/File:Room.jpg',
    })
    expect(calls[0]).toEqual({ name: 'venue_photos_for', args: { p_venues: ['v1'], p_use: 'event_card' } })
  })

  test('is null when the venue has no approved photograph for that use', async () => {
    const { d } = fake(() => ({ data: [], error: null }))
    expect(await venuePhotoFor('v1', 'social', d)).toBeNull()
  })
})

describe('the page read, one call for all its cards', () => {
  const row = (venue: string) => ({
    venue_id: venue,
    image_url: `https://x/${venue}.webp`,
    attribution_text: `Photo: ${venue}`,
    licence: 'cc0',
    licence_url: null,
    author: null,
    source_url: null,
  })

  test('asks once with each venue named once and answers by venue', async () => {
    const { d, calls } = fake(() => ({ data: [row('v1'), row('v2')], error: null }))
    const photos = await venuePhotosFor(['v1', 'v2', 'v1', 'v3'], 'event_card', d)
    expect(calls).toEqual([{ name: 'venue_photos_for', args: { p_venues: ['v1', 'v2', 'v3'], p_use: 'event_card' } }])
    expect(photos.get('v1')?.imageUrl).toBe('https://x/v1.webp')
    expect(photos.get('v2')?.credit).toBe('Photo: v2')
    expect(photos.has('v3')).toBe(false)
  })

  test('asks nothing for a page with no venue', async () => {
    const { d, calls } = fake(() => ({ data: [], error: null }))
    expect((await venuePhotosFor([], 'event_card', d)).size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  test('a failed read is thrown, so the page can fall to its typographic cover', async () => {
    const { d } = fake(() => ({ data: null, error: { code: 'XX000', message: 'down' } }))
    await expect(venuePhotosFor(['v1'], 'event_card', d)).rejects.toThrow('the venue photographs could not be read: down')
  })
})
