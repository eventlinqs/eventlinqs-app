import { describe, expect, it } from 'vitest'
import { photoFirst } from '@/lib/events/photo-first'

/*
 * THE RAILS LEAD WITH PHOTOGRAPHS (the CONTROLLER's 31 October 13:45; Lawal at 11:11: 'I shouldn't be seeing
 * EventLinqs on there'): within each rail, the nights that hold a real photo of their own (the organiser's, or the venue
 * photo dealt to that night) come first, in their own order; then the rest, in theirs. Nothing is dropped.
 */
const OWN = 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/u/e/1.jpg'
const VENUE = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Hall.jpg/1920px-Hall.jpg'
const COMPOSED = 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/generated-covers/e/1.jpg'
const LIBRARY = 'https://gndnldyfudbytbboxesk.supabase.co/storage/v1/object/public/event-images/stock/music.jpg'

describe('a rail leads with its photographed nights', () => {
  it('moves the nights with their own photo to the front, each group keeping its order, nothing dropped', () => {
    const rail = [
      { id: 'a', cover_image_url: COMPOSED },
      { id: 'b', cover_image_url: OWN },
      { id: 'c', cover_image_url: null },
      { id: 'd', cover_image_url: VENUE },
      { id: 'e', cover_image_url: LIBRARY },
    ]
    expect(photoFirst(rail).map((e) => e.id)).toEqual(['b', 'd', 'a', 'c', 'e'])
  })
  it('leaves a rail with no photographs, or all photographs, as it was', () => {
    const none = [{ id: 'a', cover_image_url: COMPOSED }, { id: 'b', cover_image_url: null }]
    expect(photoFirst(none)).toEqual(none)
    const all = [{ id: 'a', cover_image_url: OWN }, { id: 'b', cover_image_url: VENUE }]
    expect(photoFirst(all)).toEqual(all)
  })
})

/*
 * THE DISCOVERY DESIGN (Lawal's orders of 1 November 2026, 11:01 and 11:14) replaced the home and city rails. The
 * photographs now lead in ONE place, Featured this week; What's on, the directory, keeps EVERY night in date order,
 * with or without a photograph (the brief's point 4: a night with no authorised image stays fully findable).
 */
describe('the directory keeps every night in date order, photographed or not', () => {
  it('lists a night with no cover beside one with a cover, by day', async () => {
    const { directoryDays } = await import('@/lib/events/whats-on-directory')
    const base = {
      timezone: 'Australia/Melbourne', venue_name: 'Hall', venue_city: 'Bendigo', category: null,
      is_free: true, entry_mode: 'walk_in', external_ticket_url: null, ticket_tiers: [],
    }
    const days = directoryDays(
      [
        { ...base, id: 'later', slug: 'later', title: 'Later', start_date: '2026-11-03T08:00:00Z' },
        { ...base, id: 'sooner', slug: 'sooner', title: 'Sooner', start_date: '2026-11-02T08:00:00Z' },
      ],
      new Date('2026-11-01T00:00:00Z'),
    )
    expect(days.flatMap((d) => d.rows.map((r) => r.id))).toEqual(['sooner', 'later'])
  })
})
