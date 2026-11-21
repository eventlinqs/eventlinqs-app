import { describe, expect, it } from 'vitest'
import { slideImagesNow } from '@/lib/social/store'

/*
 * THE STORY'S SECOND PHOTOGRAPH IS PERMITTED (22 November 2026). The plan run drew AMCF's final day feed on its first
 * permitted photograph and the story on its second; the policy dry run at 00:11 refused the story, quoted: 'Slide 1:
 * its photograph is not permitted now, so it is never drawn.' Both records were identical (organiser_authorised, scope
 * both, approved, current): slideImagesNow compared the slide only with the night's ONE lead image. A slide's photograph
 * is now judged against every photograph the register permits for its night (social_usable_images_all).
 */
const NIGHT = '5d664060-a175-4b07-9c07-5e3c4a934c69'
const BASE = 'https://x.supabase.co/storage/v1/object/public/event-images/3b753251/5d664060'
const row = (n: number) => ({ event_id: NIGHT, asset_id: `a${n}`, asset_url: `${BASE}/photo-${n}.jpg`, asset_type: 'photo', lead_rank: n, source_width: 1100, source_height: 733, focal_x: 0.43, focal_y: 0.32, attribution_text: null })

const db = {
  rpc: async (name: string) =>
    name === 'social_usable_images' ? { data: [row(1)], error: null }
    : name === 'social_usable_images_all' ? { data: [row(1), row(2)], error: null }
    : { data: [], error: null },
  from: () => ({ select: () => ({ in: async () => ({ data: [], error: null }) }) }),
} as never

const photoSlide = (url: string) => ({ t: 'photo', photo: url, eventId: NIGHT, line: null, width: 1100, height: 733, credit: null, composition: 'photo_whole' }) as never

describe("a slide's photograph is judged against every photograph permitted for its night", () => {
  it('the lead is permitted, as before', async () => {
    const out = await slideImagesNow(db, [photoSlide(`${BASE}/photo-1.jpg`)], new Date())
    expect(out.get(0)?.url).toBe(`${BASE}/photo-1.jpg`)
  })
  it('the second permitted photograph, which the planner gives a story, is permitted too', async () => {
    const out = await slideImagesNow(db, [photoSlide(`${BASE}/photo-2.jpg`)], new Date())
    expect(out.get(0)?.url).toBe(`${BASE}/photo-2.jpg`)
    expect(out.get(0)?.assetId).toBe('a2')
  })
  it('a photograph the register does not permit for the night stays refused', async () => {
    const out = await slideImagesNow(db, [photoSlide(`${BASE}/photo-9.jpg`)], new Date())
    expect(out.get(0)).toBeNull()
  })
})
