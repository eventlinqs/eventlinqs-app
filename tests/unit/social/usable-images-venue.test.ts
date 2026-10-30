import { describe, expect, test } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { usableImages } from '@/lib/social/store'

/**
 * D4, CREATIVE ON RIGHTS-CLEARED VENUE PHOTOS (the DemandOS directive, section 4; the project manager's 31 October 05:00).
 * A night's social image is its approved register row first (J1 to J4); with none, the venue photo dealt to that night,
 * read through the one reader (event_cover_photos_for) for the use 'social', so only a photo whose rights row permits
 * social ever reaches a post; with neither, the card is typographic.
 */

type Call = { name: string; args: Record<string, unknown> }
const NOW = new Date('2026-10-31T06:00:00Z')

function db(answers: Record<string, { data: unknown; error: { message: string } | null }>) {
  const calls: Call[] = []
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return answers[name] ?? { data: [], error: null }
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const REGISTER = { event_id: 'e1', asset_url: 'https://x/organiser.webp', attribution_text: 'Kaze Entertainment', asset_id: 'a1', focal_x: null, focal_y: null, source_width: 1600, source_height: 2000 }
const VENUE = {
  event_id: 'e2',
  image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Hall.jpg/1920px-Hall.jpg',
  attribution_text: 'Photo: Jane Citizen, CC BY 4.0',
  licence: 'cc_by',
  licence_url: 'https://creativecommons.org/licenses/by/4.0/',
  author: 'Jane Citizen',
  source_url: 'https://commons.wikimedia.org/wiki/File:Hall.jpg',
}

describe('a night with no register photo takes its dealt venue photo, for social only', () => {
  test('the register row wins; a night without one asks the venue reader for the use social', async () => {
    const { client, calls } = db({
      social_usable_images: { data: [REGISTER], error: null },
      event_cover_photos_for: { data: [VENUE], error: null },
    })
    const usable = await usableImages(client, ['e1', 'e2', 'e3'], NOW)
    expect(usable.get('e1')?.url).toBe('https://x/organiser.webp')
    expect(usable.get('e2')).toEqual({
      url: VENUE.image_url,
      credit: 'Jane Citizen, CC BY 4.0',
      assetId: `venue:${VENUE.image_url}`,
      focal: null,
      width: null,
      height: null,
    })
    expect(usable.has('e3')).toBe(false)
    expect(calls.find((c) => c.name === 'event_cover_photos_for')).toEqual({ name: 'event_cover_photos_for', args: { p_events: ['e2', 'e3'], p_use: 'social' } })
  })

  test('every night with a register row asks the venue reader nothing', async () => {
    const { client, calls } = db({ social_usable_images: { data: [REGISTER], error: null } })
    await usableImages(client, ['e1'], NOW)
    expect(calls.map((c) => c.name)).toEqual(['social_usable_images'])
  })

  test('a failed venue read leaves the register rows and draws the rest in type, never breaking a post', async () => {
    const { client } = db({
      social_usable_images: { data: [REGISTER], error: null },
      event_cover_photos_for: { data: null, error: { message: 'no such function' } },
    })
    const usable = await usableImages(client, ['e1', 'e2'], NOW)
    expect([...usable.keys()]).toEqual(['e1'])
  })
})
