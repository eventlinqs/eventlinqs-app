import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

describe('the home and city pages put every rail photo-first before dealing their cards', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n')
  it('src/app/page.tsx: every rail', () => {
    const src = read('src/app/page.tsx')
    expect(src).toContain("import { photoFirst } from '@/lib/events/photo-first'")
    expect(src).toMatch(/oneCardPerEvent\(\s*\[[\s\S]*?\]\.map\(\(s\) => \(\{ \.\.\.s, events: photoFirst\(s\.events\) \}\)\)/)
  })
  it('src/components/templates/CityLandingPage.tsx: every rail, and the full list keeps its date order', () => {
    const src = read('src/components/templates/CityLandingPage.tsx')
    expect(src).toContain("import { photoFirst } from '@/lib/events/photo-first'")
    for (const rail of ['todayTomorrowCandidates', 'thisWeekendCandidates', 'thisWeekCandidates', 'r.events', 'popularCandidates']) {
      expect(src).toContain(`events: photoFirst(${rail})`)
    }
    expect(src).toContain('{ events: allEvents, cap: ALL_EVENTS_SHOWN }')
  })
})
